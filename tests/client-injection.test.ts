import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Context, Service } from '@deepseek-ai/cordis'
import { TypertRegistry } from '@deepseek-ai/dsh-typert-registry'
import * as RemoteClient from '@deepseek-ai/dsh-api-gateway/client'
import * as Client from '../src/client/index.tsx'
import { requestSchema, type BoostEvent, type BoostRequest, type BoostResult } from '../src/types.ts'

interface Face {
  generate(request: BoostRequest, signal: AbortSignal): Promise<BoostResult>
  readDraft(): { text: string; revision: number }
  focusDraft(): void
  trackEvent(event: BoostEvent): void
}

test('client mounts and injects the native remote namespace before boost and feedback', { timeout: 5000 }, async () => {
  const ctx = new Context()
  const calls: { endpoint: string; payload: unknown }[] = []
  const request = requestSchema.parse({ request_id: 'client-di', draft_revision: 1, raw: '做一个登录页' })
  const response: BoostResult = {
    ...request, optimized: '请实现一个登录页面。', task_type: 'code_gen', status: 'ok',
    slots: { goal: '登录页面', context: '', inputs: '', output_format: '', constraints: [], acceptance: [] },
    additions: [], unresolved: [], sources: [], warnings: [], reason_code: null,
    meta: { model: 'fixture', latency_ms: 1 },
  }
  let registration: { inject(sessionId: string): Face } | undefined
  let removed = 0
  let focused = 0
  let ready!: () => void
  const registered = new Promise<void>(resolve => { ready = resolve })
  let feedbackReady!: () => void
  const feedback = new Promise<void>(resolve => { feedbackReady = resolve })
  ctx.provide('connection', {
    interactions: 'none', isLoopback: true,
    rpc: {
      async *open(_path: string, endpoint: string, payload: unknown) {
        calls.push({ endpoint, payload })
        yield response
      },
      async call(_path: string, endpoint: string, payload: unknown) {
        calls.push({ endpoint, payload }); feedbackReady()
        return { ok: true, value: { accepted: true } }
      },
    },
  })
  class FixtureSlots extends Service {
    constructor(ctx: Context) { super(ctx, 'slots') }
    inject(_name: string, register: () => () => void) { return this.ctx.effect(register) }
    register(options: typeof registration) {
      registration = options; ready()
      return () => { registration = undefined; removed++ }
    }
  }
  await ctx.plugin(FixtureSlots)
  ctx.provide('sessions', { binding: () => ({ ctx }) })
  ctx.provide('conversation', { input: { for: () => ({ focus: () => { focused++ }, state: {
    getSnapshot: () => ({ draft: request.raw, draftRev: 1, phase: 'plain', occurrences: [] }),
  } }) } })
  await ctx.plugin(TypertRegistry)
  await ctx.plugin(RemoteClient)
  const plugin = ctx.plugin(Client)
  try {
    await plugin
    await registered
    const face = registration!.inject('session-fixture')
    assert.equal(face.readDraft().revision, 1)
    face.focusDraft(); assert.equal(focused, 1)
    assert.deepEqual(await face.generate(request, new AbortController().signal), response)
    face.trackEvent({ name: 'boost_undone', request_id: request.request_id, ok: true })
    await feedback
    assert.deepEqual(calls.map(call => call.endpoint), ['promptBooster/boost', 'promptBooster/feedback'])
    assert.deepEqual(JSON.parse(JSON.stringify(calls[0].payload)), { args: { input: { session_id: 'session-fixture', request } } })
    await plugin.dispose()
    assert.equal(registration, undefined)
    assert.equal(removed, 1)
    assert.equal(ctx.get('remote.promptBooster'), undefined)
  } finally { await ctx.fiber.dispose() }
})
