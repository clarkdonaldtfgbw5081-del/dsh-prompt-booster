import { test } from 'node:test'
import assert from 'node:assert/strict'
import { z } from 'zod'
import { ClientFailure, generateWithCompatibility } from '../src/client/transport.ts'
import { requestSchema, type Capabilities } from '../src/types.ts'
import type { RpcRequest } from '../src/adapters/wire.ts'
import { baseResult } from '../src/core/engine.ts'

const current: Capabilities = { protocol: 1, configured_mode: true, reference_fragments: true }
const missing = { code: 'gateway/invocation-unavailable', message: 'private carrier detail' }
const request = requestSchema.parse({ request_id: 'compat', draft_revision: 3, raw: '写一份周报', use_configured_mode: true })
const signal = () => new AbortController().signal
function fixture(capabilities: () => Promise<{ ok: true; value: unknown } | { ok: false; error: unknown }>) {
  const inputs: RpcRequest[] = []
  let disposed = 0
  return { inputs, disposed: () => disposed, remote: {
    capabilities,
    boost(input: RpcRequest) {
      inputs.push(input)
      return { async *[Symbol.asyncIterator]() { yield { ...baseResult(input.request, 'fixture'), status: 'ok' as const } }, dispose() { disposed++ } }
    },
  } }
}

test('confirmed legacy hosts receive the old strict shape without changing draft identity', async () => {
  // Captures the pre-0.2.6 wire boundary; new fields must never reach that codec.
  const legacy = z.object({ request_id: z.string(), draft_revision: z.number(), raw: z.string(), mode: z.string(), language: z.string(), context_sources: z.array(z.unknown()) }).strict()
  assert.equal(legacy.safeParse(request).success, false)
  const f = fixture(async () => ({ ok: false, error: missing }))
  const result = await generateWithCompatibility(f.remote, 'session', request, signal())
  assert.equal(legacy.safeParse(f.inputs[0].request).success, true)
  assert.deepEqual(f.inputs[0].request, { request_id: request.request_id, draft_revision: 3, raw: request.raw, mode: 'standard', language: 'zh', context_sources: [] })
  assert.equal(request.use_configured_mode, true, 'never mutate the caller request')
  assert.deepEqual(result.warnings, ['host_legacy_compat'])
  assert.equal(f.inputs.length, 1)
  assert.equal(f.disposed(), 1)
})

test('current hosts keep native configured mode and reference protection unchanged', async () => {
  const f = fixture(async () => ({ ok: true, value: current }))
  const referenced = { ...request, reference_fragments: ['周报'] }
  await generateWithCompatibility(f.remote, 'session', referenced, signal())
  assert.deepEqual(f.inputs[0], { session_id: 'session', request: referenced })
})

test('legacy hosts cannot bypass structured reference checks', async () => {
  const f = fixture(async () => { throw missing })
  await assert.rejects(generateWithCompatibility(f.remote, 'session', { ...request, reference_fragments: ['周报'] }, signal()), { code: 'host_update_required' })
  assert.equal(f.inputs.length, 0)
})

test('only a missing capability method permits downgrade; faults never trigger a boost', async () => {
  for (const error of [new Error('private-secret'), { code: 'gateway/internal' }, { code: 'gateway/service-unavailable' }, { code: 'access/denied' }]) {
    const f = fixture(async () => ({ ok: false, error }))
    await assert.rejects(generateWithCompatibility(f.remote, 'session', request, signal()), { code: 'host_connection_failed' })
    assert.equal(f.inputs.length, 0)
  }
  for (const value of [{ protocol: 2 }, { ...current, surprise: true }, undefined]) {
    const f = fixture(async () => ({ ok: true, value }))
    await assert.rejects(generateWithCompatibility(f.remote, 'session', request, signal()), { code: 'host_update_required' })
    assert.equal(f.inputs.length, 0)
  }
})

test('capability timeout or cancellation cannot dispatch an optimization later', async () => {
  for (const cancel of [false, true]) {
    let release!: (value: { ok: true; value: Capabilities }) => void
    const f = fixture(() => new Promise(resolve => { release = resolve }))
    const controller = new AbortController()
    const pending = generateWithCompatibility(f.remote, 'session', request, controller.signal, 15)
    await Promise.resolve()
    if (cancel) controller.abort()
    await assert.rejects(pending, cancel ? { name: 'AbortError' } : { code: 'host_check_timeout' })
    release({ ok: true, value: current })
    await Promise.resolve()
    assert.equal(f.inputs.length, 0)
  }
})

test('host feature changes are checked on the next click rather than cached', async () => {
  let calls = 0
  const f = fixture(async () => ++calls === 1 ? { ok: false, error: missing } : { ok: true, value: current })
  await generateWithCompatibility(f.remote, 'session', request, signal())
  await generateWithCompatibility(f.remote, 'session', request, signal())
  assert.equal(f.inputs[0].request.use_configured_mode, undefined)
  assert.equal(f.inputs[1].request.use_configured_mode, true)
})

test('stream failures are classified, disposed, and never retried', async () => {
  for (const code of ['gateway/input-invalid', 'gateway/result-invalid', 'gateway/internal']) {
    const f = fixture(async () => ({ ok: true, value: current }))
    const remote = { ...f.remote, boost(input: RpcRequest) {
      const stream = f.remote.boost(input)
      return { ...stream, async *[Symbol.asyncIterator]() { throw { code, message: 'private-secret' } } }
    } }
    await assert.rejects(generateWithCompatibility(remote, 'session', request, signal()), error => {
      assert.ok(error instanceof ClientFailure)
      assert.equal(error.code, code === 'gateway/input-invalid' ? 'host_update_required' : code === 'gateway/result-invalid' ? 'client_result_invalid' : 'host_connection_failed')
      assert.ok(!error.message.includes('private-secret'))
      return true
    })
    assert.equal(f.inputs.length, 1)
    assert.equal(f.disposed(), 1)
  }
})

test('an empty remote stream is reported as an invalid result', async () => {
  const f = fixture(async () => ({ ok: true, value: current }))
  const remote = { ...f.remote, boost(input: RpcRequest) {
    const stream = f.remote.boost(input)
    return { ...stream, async *[Symbol.asyncIterator]() {} }
  } }
  await assert.rejects(generateWithCompatibility(remote, 'session', request, signal()), { code: 'client_result_invalid' })
  assert.equal(f.disposed(), 1)
})
