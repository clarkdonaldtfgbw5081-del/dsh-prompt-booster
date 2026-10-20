import { Context } from '@deepseek-ai/cordis'
import { createHash } from 'node:crypto'
import { BlockAssembler, createUserMessage, type GenerateOptions } from '@deepseek-ai/dsh-llm'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type {} from '@deepseek-ai/dsh-typert-registry'
import type {} from '@deepseek-ai/dsh-agent-default-model'
import { appendPluginRecord, type SessionId } from '@deepseek-ai/dsh-session'
import { BoostEngine, baseResult } from './core/engine.ts'
import { Config, configSchema, type BoosterConfig } from './config.ts'
import { collectContext } from './adapters/context.ts'
import { remoteInfo, type RpcRequest } from './adapters/wire.ts'
import { sessionRoute } from './adapters/route.ts'
import { optimizationControls } from './adapters/controls.ts'
import { BoostFailure } from './core/failures.ts'
import { FeedbackTracker } from './core/feedback.ts'
import { feedbackSchema, requestSchema, type BoostEvent, type BoostRequest, type BoostResult, type FeedbackRequest } from './types.ts'

declare module '@deepseek-ai/cordis' { interface Context { promptBooster: PromptBooster } }
declare module '@deepseek-ai/dsh-session/types' {
  interface PluginRecordMap {
    'plugin:dsh-prompt-booster/request': {
      request_id: string; route: { provider: string; model: string; reasoningEffort?: string }; system: string; input: string; maxTokens: number
    }
    'plugin:dsh-prompt-booster/result': {
      request_id: string; status: BoostResult['status']; reason_code: string | null; warnings: string[]; latency_ms: number; attempts?: number
    }
  }
}

const EVENT_LOG_LIMIT = 200

/** Host service. Auxiliary calls are audited as log-only records, never admitted as user messages. */
export default class PromptBooster extends TypertRemoteService {
  static inject = ['llm', 'typert', 'agentDefaultModel', 'sessions']
  static Config = Config
  private readonly readControls: () => zConfig
  private get controls(): zConfig { return this.readControls() }
  private readonly lifetime = new AbortController()
  private readonly events: BoostEvent[] = []
  private readonly feedbackTracker = new FeedbackTracker(event => this.record(event))

  constructor(ctx: Context, config: BoosterConfig | { get(): unknown } = {}) {
    super(ctx, 'promptBooster')
    this.readControls = () => configSchema.parse('get' in config && typeof config.get === 'function' ? config.get() : config)
    this.readControls()
    ctx.effect(() => ctx.typert.register({
      package: 'dsh-prompt-booster', face: 'host', schemas: [],
      model: { services: [], events: [], objects: [] }, invocations: remoteInfo.descriptors,
    }), 'prompt-booster: typed remote contract')
    ctx.effect(() => () => this.lifetime.abort(), 'prompt-booster: cancel on unload')
    ctx.on('session/event', (session, event) => {
      if (event.type !== 'user/message' || event.data.source.kind !== 'user') return
      const text = event.data.content.filter(block => block.type === 'text').map(block => block.text).join('')
      if (text) this.feedbackTracker.admitted(session.id, createHash('sha256').update(text).digest('hex'))
    })
  }

  @Remote({ mode: 'stream', resources: { session: (input) => input.session_id as SessionId } })
  async *boost(input: RpcRequest, signal: AbortSignal): AsyncIterable<BoostResult> {
    let request = requestSchema.parse(input.request)
    const session = this.ctx.sessions.get(input.session_id as SessionId)
    if (!session) {
      yield { ...baseResult(request, ''), reason_code: 'session_not_open' }
      return
    }
    const contextStarted = performance.now()
    const controls = this.controls
    if (request.use_configured_mode) request = requestSchema.parse({ ...request, mode: controls.mode })
    const contextDeadline = AbortSignal.timeout(controls.timeoutMs)
    let contextNotices: string[] = []
    try {
      const context = await collectContext(session, request, controls.context, AbortSignal.any([signal, this.lifetime.signal, contextDeadline]))
      contextNotices = context.notices
      request = requestSchema.parse({ ...request, context_sources: context.sources, preferences: request.preferences ?? controls.preferences })
    } catch {
      yield { ...baseResult(request, ''), status: signal.aborted || this.lifetime.signal.aborted ? 'cancelled' : 'fallback',
        reason_code: signal.aborted || this.lifetime.signal.aborted ? 'cancelled' : contextDeadline.aborted ? 'timeout' : 'context_unavailable' }
      return
    }
    let route: { provider: string; model: string }
    try {
      route = controls.provider && controls.model
        ? { provider: controls.provider, model: controls.model }
        : sessionRoute(session) ?? this.ctx.agentDefaultModel.currentSelection()
    } catch (error) {
      yield { ...this.hostFailure(request, '默认模型解析失败', error), reason_code: 'model_unavailable' }
      return
    }
    const engine = new BoostEngine({
      name: `${route.provider}/${route.model}`,
      generate: async ({ system, input: text, signal: abort }) => {
        const call = await this.ctx.llm.prepareCall({ provider: route.provider, model: route.model, maxTokens: controls.maxOutputTokens }, abort, optimizationControls)
        appendPluginRecord(session, 'plugin:dsh-prompt-booster/request', {
          request_id: request.request_id,
          route: { provider: call.config.provider, model: call.config.model, ...(call.config.reasoningEffort ? { reasoningEffort: call.config.reasoningEffort } : {}) },
          system, input: text, maxTokens: call.config.maxTokens ?? controls.maxOutputTokens,
        })
        const options: GenerateOptions = {
          ...call.config, system,
          messages: [createUserMessage({ content: [{ type: 'text', text }], source: { kind: 'user' } })],
          sessionId: session.id, signal: abort,
        }
        const assembler = new BlockAssembler()
        let outputChars = 0
        for await (const chunk of call.stream(options)) {
          abort.throwIfAborted()
          outputChars += JSON.stringify(chunk).length
          if (outputChars > 100000) throw new BoostFailure('model_response_invalid')
          assembler.push(chunk)
        }
        abort.throwIfAborted()
        if (assembler.finish.kind === 'max-tokens') throw new BoostFailure('model_output_truncated')
        if (assembler.finish.kind !== 'stop') throw new BoostFailure('model_request_failed')
        const blocks = assembler.blocks()
        if (blocks.some(block => block.type !== 'text' && block.type !== 'reasoning')) throw new BoostFailure('model_response_invalid')
        return blocks.filter(block => block.type === 'text').map(block => block.text).join('')
      },
    }, {
      timeoutMs: Math.max(1, Math.floor(controls.timeoutMs - (performance.now() - contextStarted))),
      repairAttempts: controls.repairAttempts,
      onEvent: event => this.record(event),
    })
    try {
      const result = await engine.boost(request, AbortSignal.any([signal, this.lifetime.signal]))
      result.warnings.push(...contextNotices)
      appendPluginRecord(session, 'plugin:dsh-prompt-booster/result', {
        request_id: request.request_id, status: result.status, reason_code: result.reason_code,
        warnings: result.warnings, latency_ms: result.meta.latency_ms,
        ...(result.meta.attempts === undefined ? {} : { attempts: result.meta.attempts }),
      })
      if (result.status === 'ok') this.feedbackTracker.remember(session.id, request.request_id)
      yield result
    } catch (error) {
      yield this.hostFailure(request, '优化引擎异常', error)
    }
  }

  /** Host-side faults surface as visible fallback results instead of opaque RPC rejections. */
  private hostFailure(request: BoostRequest, label: string, error: unknown): BoostResult {
    this.ctx.logger.warn(`[prompt-booster] ${label}`)
    return { ...baseResult(request, ''), reason_code: 'model_request_failed', warnings: [] }
  }

  @Remote({ resources: { session: (input) => input.session_id as SessionId } })
  feedback(input: FeedbackRequest): { accepted: boolean } {
    return { accepted: this.feedbackTracker.accept(feedbackSchema.parse(input)) }
  }

  private record(event: BoostEvent): void {
    this.events.push({ ...event })
    if (this.events.length > EVENT_LOG_LIMIT) this.events.shift()
  }

  /** Bounded in-memory evaluation events; never persisted and carries no draft text. */
  recentEvents(): readonly BoostEvent[] {
    return this.events.map(event => ({ ...event }))
  }
}
type zConfig = ReturnType<typeof configSchema.parse>
