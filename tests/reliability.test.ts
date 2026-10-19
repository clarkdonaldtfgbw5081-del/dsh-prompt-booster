import { test } from 'node:test'
import assert from 'node:assert/strict'
import { BoostEngine } from '../src/core/engine.ts'
import { BoostFailure } from '../src/core/failures.ts'
import { defaultChoices } from '../src/core/defaults.ts'
import { parseCandidate } from '../src/guards/validate.ts'
import { requestSchema, resultSchema } from '../src/types.ts'

const request = requestSchema.parse({ request_id: 'reliable', draft_revision: 0, raw: '做一个登录页面' })
const run = (response: string) => new BoostEngine({ name: 'fixture', async generate() { return response } }).boost(request)

test('missing nonessential metadata does not discard usable optimized text', async () => {
  const result = await run(JSON.stringify({ optimized: '请实现一个登录页面。' }))
  assert.equal(result.status, 'ok'); assert.ok(resultSchema.safeParse(result).success)
  assert.equal(result.task_type, 'code_gen')
})
test('nullable optional metadata is normalized but task text remains required', async () => {
  const result = await run(JSON.stringify({ optimized: '请实现一个登录页面。', task_type: null,
    slots: { goal: null, constraints: null }, additions: null, unresolved: null }))
  assert.equal(result.status, 'ok')
  assert.equal((await run(JSON.stringify({ optimized: null }))).reason_code, 'model_format_error')
})
test('fenced JSON still works without extracting JSON from arbitrary answers', async () => {
  assert.equal((await run('```json\n{"optimized":"请实现一个登录页面。"}\n```')).status, 'ok')
  assert.equal((await run('解释：{"optimized":"请实现一个登录页面。"}')).reason_code, 'model_format_error')
  assert.equal((await run('请实现一个登录页面。')).reason_code, 'model_format_error')
})
test('known default sentences can recover omitted bookkeeping without granting extra authority', async () => {
  const choice = defaultChoices(request).find(choice => choice.category === 'tech_stack')!
  const result = await run(JSON.stringify({ optimized: `请实现一个登录页面。\n${choice.value}` }))
  assert.equal(result.status, 'ok')
  assert.ok(result.additions.some(addition => addition.kind === 'default_assumption' && addition.category === 'tech_stack'))
  const bad = await run(JSON.stringify({ optimized: '用 React 实现一个登录页面。' }))
  assert.equal(bad.reason_code, 'guard_failed'); assert.ok(bad.warnings.includes('new_identifier'))
})
test('malformed source metadata is not repaired into fictional evidence', async () => {
  const result = await run(JSON.stringify({ optimized: '用 React 实现登录页面。', additions: [
    { id: 'f', kind: 'sourced_fact', value: 'React', source_id: null, evidence_quote: null, action: 'included' },
  ] }))
  assert.equal(result.reason_code, 'guard_failed'); assert.ok(result.warnings.includes('unverifiable_source'))
})
test('bad field types and unknown fields still fail closed', () => {
  for (const value of [{ optimized: '正文', slots: { constraints: 'not-an-array' } }, { optimized: '正文', surprise: true }, { optimized: '正文', additions: [{ kind: 'default_assumption', category: 'made-up' }] }]) {
    assert.throws(() => parseCandidate(JSON.stringify(value), request))
  }
})
test('empty, malformed, truncated and provider failures have distinct safe codes', async () => {
  assert.equal((await run(' ')).reason_code, 'model_empty_response')
  assert.equal((await run('{"optimized":')).reason_code, 'model_format_error')
  for (const code of ['model_output_truncated', 'model_request_failed', 'model_response_invalid'] as const) {
    const result = await new BoostEngine({ name: 'fixture', async generate() { throw new BoostFailure(code) } }).boost(request)
    assert.equal(result.reason_code, code); assert.equal(result.optimized, request.raw)
  }
  const result = await new BoostEngine({ name: 'fixture', async generate() { throw new Error('provider-secret-token') } }).boost(request)
  assert.equal(result.reason_code, 'model_request_failed')
  assert.ok(!JSON.stringify(result).includes('provider-secret-token'))
})
