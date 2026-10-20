import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { Context } from '@deepseek-ai/cordis'
import { LlmRuntime, LlmAdapter, ReasoningEffortId, createUserMessage, type GenerateOptions, type StreamChunk, type FinishReason } from '@deepseek-ai/dsh-llm'
import { SessionStore, pluginRecordOf } from '@deepseek-ai/dsh-session'
import { TypertRegistry } from '@deepseek-ai/dsh-typert-registry'
import DefaultModel from '@deepseek-ai/dsh-agent-default-model'
import { remoteMethods } from '@deepseek-ai/dsh-typert-protocol'
import type { PeerScope, PeerId } from '@deepseek-ai/dsh-typert-protocol'
import Gateway from '@deepseek-ai/dsh-api-gateway'
import Access from '@deepseek-ai/dsh-api-remote-access'
import PromptBooster from '../src/index.ts'
import { remoteInfo } from '../src/adapters/wire.ts'
import { requestSchema, type BoostResult } from '../src/types.ts'
import { sessionRoute } from '../src/adapters/route.ts'

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface PrincipalMap { 'booster-test-guest': { kind: 'booster-test-guest' } }
}

class FixtureAdapter extends LlmAdapter {
  captured?: GenerateOptions
  finish: FinishReason = { kind: 'stop' }
  streams = 0
  failWith?: Error
  async resolveModel(provider: string, model: string) {
    return { provider, id: model, name: model, reasoning: {
      efforts: [{ id: ReasoningEffortId('low'), name: 'Low' }, { id: ReasoningEffortId('max'), name: 'Max' }],
      defaultEffort: ReasoningEffortId('max'),
    } }
  }
  async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    this.streams++
    this.captured = options
    if (this.failWith) throw this.failWith
    yield { type: 'text-delta', index: 0, text: JSON.stringify({
      optimized: '请实现一个登录页面。', task_type: 'code_gen',
      slots: { goal: '登录页面', context: '', inputs: '', output_format: '', constraints: [], acceptance: [] },
      additions: [], unresolved: [],
    }) }
    yield { type: 'finish', reason: this.finish }
  }
}

test('native Cordis host registration, prepared LLM call, log-only audit, and unload', async () => {
  const ctx = new Context()
  ctx.plugin(TypertRegistry)
  ctx.plugin(SessionStore)
  ctx.plugin(LlmRuntime)
  ctx.plugin(Access)
  const gateway = ctx.plugin(Gateway, {})
  ctx.plugin(DefaultModel, { provider: 'fixture', model: 'fixture-model' })
  const plugin = ctx.plugin(PromptBooster, { timeoutMs: 1000 })
  await plugin.await()
  await gateway.await()
  try {
    const adapter = new FixtureAdapter()
    ctx.llm.registerAdapter(['fixture'], adapter)
    const session = ctx.sessions.create()
    const request = requestSchema.parse({ request_id: 'native', draft_revision: 0, raw: '做一个登录页面' })
    const results = []
    const peer: PeerScope = { id: 'test-owner' as PeerId, ctx, principal: { kind: 'owner' }, signal: new AbortController().signal, interactions: 'none', dispose: async () => {} }
    const stream = await ctx.typertGateway.stream({ namespace: 'promptBooster', method: 'boost', args: { input: { session_id: session.id, request } }, peer })
    for await (const result of stream) results.push(result as import('../src/types.ts').BoostResult)
    assert.equal(results.length, 1); assert.equal(results[0].status, 'ok')
    assert.equal(adapter.captured?.model, 'fixture-model')
    assert.equal(adapter.captured?.reasoningEffort, 'low')
    assert.equal(adapter.captured?.maxTokens, 4096)
    assert.equal(adapter.captured?.messages.length, 1)
    assert.equal(adapter.captured?.tools, undefined)
    const events = session.snapshotEvents()
    assert.equal(events.filter(event => event.type === 'user/message').length, 0)
    assert.ok(events.some(event => pluginRecordOf(event)?.type === 'plugin:dsh-prompt-booster/request'))
    const outcome = events.map(pluginRecordOf).find(record => record?.type === 'plugin:dsh-prompt-booster/result')
    assert.ok(outcome)
    assert.ok(!JSON.stringify(outcome).includes('登录'))
    assert.equal(ctx.typert.local.get('promptBooster/boost')?.mode, 'stream')
    assert.equal(remoteMethods(ctx.promptBooster)[0].method, 'boost')
    const recent = ctx.promptBooster.recentEvents()
    assert.deepEqual(recent.map(event => event.name), ['boost_clicked', 'boost_completed'])
    assert.ok(recent.every(event => event.request_id === 'native'))
    assert.ok(!JSON.stringify(recent).includes('登录'))
    const feedback = await ctx.typertGateway.invoke({ namespace: 'promptBooster', method: 'feedback', args: { input: {
      session_id: session.id, event: { name: 'boost_applied', request_id: 'native', ok: true,
        content_hash: createHash('sha256').update(results[0].optimized).digest('hex') },
    } }, peer })
    assert.deepEqual(feedback, { accepted: true })
    session.append('user/message', createUserMessage({ content: [{ type: 'text', text: results[0].optimized }], source: { kind: 'user' } }), { surfaceOp: 'append' })
    assert.equal(ctx.promptBooster.recentEvents().at(-1)?.name, 'prompt_sent')
    adapter.finish = { kind: 'max-tokens' }
    const truncated = []
    for await (const item of await ctx.typertGateway.stream({ namespace: 'promptBooster', method: 'boost', args: { input: { session_id: session.id, request } }, peer })) truncated.push(item as import('../src/types.ts').BoostResult)
    assert.equal(truncated[0].reason_code, 'model_output_truncated')
    assert.equal(truncated[0].optimized, request.raw)
    adapter.finish = { kind: 'stop' }
    const contextual = requestSchema.parse({ request_id: 'contextual-native', draft_revision: 0, raw: '根据上面的需求继续整理登录页面' })
    const contextualResults = []
    for await (const item of await ctx.typertGateway.stream({ namespace: 'promptBooster', method: 'boost', args: { input: { session_id: session.id, request: contextual } }, peer })) contextualResults.push(item as import('../src/types.ts').BoostResult)
    assert.equal(contextualResults[0].status, 'ok')
    assert.equal(contextualResults[0].sources.length, 1)
    assert.equal(contextualResults[0].preferences?.fillDefaults, true)
    const guest: PeerScope = { ...peer, principal: { kind: 'booster-test-guest' } }
    await assert.rejects(async () => {
      const denied = await ctx.typertGateway.stream({ namespace: 'promptBooster', method: 'boost', args: { input: { session_id: session.id, request } }, peer: guest })
      for await (const _ of denied) { /* Access must be refused before any item. */ }
    }, /denied/i)
    await plugin.dispose()
    assert.equal(ctx.typert.local.get('promptBooster/boost'), undefined)
  } finally { await ctx.fiber.dispose() }
})
test('session model intent wins over previously used routes', async () => {
  const ctx = new Context()
  await ctx.plugin(SessionStore)
  try {
    const session = ctx.sessions.create()
    assert.equal(sessionRoute(session), undefined)
    session.append('request/header', { reason: 'initial', header: { config: { provider: 'p', model: 'old' } } })
    assert.equal(sessionRoute(session)?.model, 'old')
    session.append('model/selection', { provider: 'p', model: 'new' })
    session.append('request/header', { reason: 'change', header: { config: { provider: 'p', model: 'old' } } })
    assert.equal(sessionRoute(session)?.model, 'new')
    session.append('request/header', { reason: 'change', header: { config: { provider: 'p', model: 'new' } } })
    assert.equal(sessionRoute(session)?.model, 'new')
  } finally { await ctx.fiber.dispose() }
})

test('wire contract rejects undeclared input before dispatch', () => {
  const method = remoteInfo.methods['promptBooster/boost']
  assert.throws(() => method.input({ strict: true }).create().parse({ input: { session_id: 'x', request: {}, surprise: true } }))
  assert.equal(method.cancellation?.parameter, 'signal')
})

function ownerPeer(ctx: Context): PeerScope {
  return { id: 'test-owner' as PeerId, ctx, principal: { kind: 'owner' }, signal: new AbortController().signal, interactions: 'none', dispose: async () => {} }
}

async function boostThroughGateway(ctx: Context, sessionId: string, request: ReturnType<typeof requestSchema.parse>): Promise<BoostResult[]> {
  const results: BoostResult[] = []
  const stream = await ctx.typertGateway.stream({
    namespace: 'promptBooster', method: 'boost', args: { input: { session_id: sessionId, request } }, peer: ownerPeer(ctx),
  })
  for await (const result of stream) results.push(result as BoostResult)
  return results
}

test('a boost for a session that is not open returns a safe session_not_open fallback', async () => {
  const ctx = new Context()
  ctx.plugin(TypertRegistry)
  ctx.plugin(SessionStore)
  ctx.plugin(LlmRuntime)
  ctx.plugin(Access)
  const gateway = ctx.plugin(Gateway, {})
  ctx.plugin(DefaultModel, { provider: 'fixture', model: 'fixture-model' })
  const plugin = ctx.plugin(PromptBooster, { timeoutMs: 1000 })
  await plugin.await()
  await gateway.await()
  try {
    const request = requestSchema.parse({ request_id: 'closed-session', draft_revision: 2, raw: '做一个登录页面' })
    const results = await boostThroughGateway(ctx, 'session-that-is-not-open', request)
    assert.equal(results.length, 1)
    assert.equal(results[0].status, 'fallback')
    assert.equal(results[0].reason_code, 'session_not_open')
    assert.equal(results[0].optimized, request.raw)
    assert.equal(results[0].draft_revision, request.draft_revision)
    // The host guard returns before the engine starts: no click/completion events.
    assert.deepEqual(ctx.promptBooster.recentEvents(), [])
  } finally { await ctx.fiber.dispose() }
})

test('a provider transport failure falls back safely and never echoes the provider error', async () => {
  const ctx = new Context()
  ctx.plugin(TypertRegistry)
  ctx.plugin(SessionStore)
  ctx.plugin(LlmRuntime)
  ctx.plugin(Access)
  const gateway = ctx.plugin(Gateway, {})
  ctx.plugin(DefaultModel, { provider: 'fixture', model: 'fixture-model' })
  const plugin = ctx.plugin(PromptBooster, { timeoutMs: 1000 })
  await plugin.await()
  await gateway.await()
  try {
    const adapter = new FixtureAdapter()
    ctx.llm.registerAdapter(['fixture'], adapter)
    const session = ctx.sessions.create()
    const secret = 'provider-secret-body sk-live-must-not-leak'
    adapter.failWith = new Error(secret)
    const request = requestSchema.parse({ request_id: 'provider-transport', draft_revision: 0, raw: '做一个登录页面' })
    const results = await boostThroughGateway(ctx, session.id, request)
    assert.equal(results.length, 1)
    assert.equal(results[0].status, 'fallback')
    assert.equal(results[0].reason_code, 'model_request_failed')
    assert.equal(results[0].optimized, request.raw)
    assert.deepEqual(results[0].warnings, [])
    assert.equal(adapter.streams, 1, 'a transport failure must not trigger another model call')
    const audit = session.snapshotEvents().map(pluginRecordOf)
    const resultRecord = audit.find(record => record?.type === 'plugin:dsh-prompt-booster/result')
    assert.ok(resultRecord)
    assert.ok(JSON.stringify(resultRecord).includes('model_request_failed'))
    assert.equal(session.snapshotEvents().filter(event => event.type === 'user/message').length, 0)
    assert.deepEqual(ctx.promptBooster.recentEvents().map(event => [event.name, event.status]), [
      ['boost_clicked', undefined], ['boost_completed', 'fallback'],
    ])
    const exposed = JSON.stringify({ results, audit, recent: ctx.promptBooster.recentEvents() })
    assert.ok(!exposed.includes(secret), 'provider error text must not reach the client or the audit log')
    assert.ok(!exposed.includes('sk-live-must-not-leak'))
  } finally { await ctx.fiber.dispose() }
})

test('a default-model resolution failure returns model_unavailable without the error body', async () => {
  const ctx = new Context()
  const secret = 'default-model-secret'
  ctx.provide('agentDefaultModel', {
    currentSelection() { throw new Error(secret) },
  } as unknown as InstanceType<typeof DefaultModel>)
  ctx.plugin(TypertRegistry)
  ctx.plugin(SessionStore)
  ctx.plugin(LlmRuntime)
  ctx.plugin(Access)
  const gateway = ctx.plugin(Gateway, {})
  const plugin = ctx.plugin(PromptBooster, { timeoutMs: 1000 })
  await plugin.await()
  await gateway.await()
  try {
    const session = ctx.sessions.create()
    const request = requestSchema.parse({ request_id: 'model-unavailable', draft_revision: 0, raw: '做一个登录页面' })
    const results = await boostThroughGateway(ctx, session.id, request)
    assert.equal(results.length, 1)
    assert.equal(results[0].status, 'fallback')
    assert.equal(results[0].reason_code, 'model_unavailable')
    assert.equal(results[0].optimized, request.raw)
    assert.equal(session.snapshotEvents().filter(event => event.type === 'user/message').length, 0)
    const exposed = JSON.stringify({ results, events: session.snapshotEvents().map(pluginRecordOf), recent: ctx.promptBooster.recentEvents() })
    assert.ok(!exposed.includes(secret))
  } finally { await ctx.fiber.dispose() }
})
