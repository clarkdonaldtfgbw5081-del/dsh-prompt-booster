import { test } from 'node:test'
import assert from 'node:assert/strict'
import { BoostEngine } from '../src/core/engine.ts'
import { requestSchema } from '../src/types.ts'

const request = requestSchema.parse({ request_id: 'repair', draft_revision: 0, raw: '修改这个函数，不新增依赖' })
const response = (optimized: string) => JSON.stringify({ optimized })
test('one bounded repair uses original constraints and clears old failure state', async () => {
  const inputs: Record<string, unknown>[] = []
  const result = await new BoostEngine({ name: 'fixture', async generate({ input }) {
    inputs.push(JSON.parse(input))
    return inputs.length === 1 ? response('修改这个函数。') : response('请修改这个函数，不新增依赖。')
  } }, { timeoutMs: 1000, repairAttempts: 1 }).boost(request)
  assert.equal(inputs.length, 2); assert.ok(inputs[1].repair)
  assert.equal(result.status, 'ok'); assert.equal(result.reason_code, null)
  assert.deepEqual(result.warnings, []); assert.equal(result.meta.attempts, 2)
})
test('format repair can run once but never becomes an unbounded retry loop', async () => {
  let calls = 0
  const result = await new BoostEngine({ name: 'fixture', async generate() { calls++; return '{broken' } }, { timeoutMs: 1000, repairAttempts: 1 }).boost(request)
  assert.equal(calls, 2); assert.equal(result.reason_code, 'model_format_error')
  assert.equal(result.optimized, request.raw)
})
test('transport failures are never automatically retried', async () => {
  let calls = 0
  const result = await new BoostEngine({ name: 'fixture', async generate() { calls++; throw new Error('offline') } }, { timeoutMs: 1000, repairAttempts: 1 }).boost(request)
  assert.equal(calls, 1); assert.equal(result.reason_code, 'model_request_failed')
})
test('a repair shares the original overall deadline and cancellation', async () => {
  let calls = 0
  const controller = new AbortController()
  const engine = new BoostEngine({ name: 'fixture', async generate({ signal }) {
    calls++
    if (calls === 1) return '{broken'
    queueMicrotask(() => controller.abort())
    return new Promise<string>((_, reject) => signal.addEventListener('abort', () => reject(new Error('cancelled')), { once: true }))
  } }, { timeoutMs: 1000, repairAttempts: 1 })
  assert.equal((await engine.boost(request, controller.signal)).status, 'cancelled')
  assert.equal(calls, 2)
  calls = 0
  const slow = new BoostEngine({ name: 'fixture', async generate() { calls++; return '{broken' } }, { timeoutMs: 100, repairAttempts: 1 })
  await slow.boost(request); assert.equal(calls, 1)
})
test('repair settings reject multiple retries', () => {
  assert.throws(() => new BoostEngine({ name: 'fixture', async generate() { return '' } }, { timeoutMs: 1000, repairAttempts: 2 }))
})
