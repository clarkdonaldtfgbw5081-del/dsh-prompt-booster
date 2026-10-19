import { test } from 'node:test'
import assert from 'node:assert/strict'
import { BoostEngine } from '../src/core/engine.ts'
import { requestSchema, resultSchema, type BoostEvent, type Candidate, type ModelProvider } from '../src/types.ts'
import { validateCandidate, protectedFragments } from '../src/guards/validate.ts'

const request = (raw = '做一个登录页面') => requestSchema.parse({ request_id: 'test', draft_revision: 4, raw, mode: 'standard' })
const candidate = (optimized = '请实现一个登录页面。'): Candidate => ({
  optimized, task_type: 'code_gen', slots: { goal: '登录页面', context: '', inputs: '', output_format: '', constraints: [], acceptance: [] }, additions: [], unresolved: [],
})
const provider = (value: Candidate): ModelProvider => ({ name: 'fixture', async generate() { return JSON.stringify(value) } })

test('ordinary rewrite succeeds and preserves request correlation', async () => {
  const result = await new BoostEngine(provider(candidate())).boost(request())
  assert.equal(result.status, 'ok'); assert.equal(result.request_id, 'test'); assert.equal(result.draft_revision, 4)
})
for (const raw of ['', '继续', '好的', '/plan off']) test(`skip branch: ${JSON.stringify(raw)}`, async () => {
  let calls = 0
  const result = await new BoostEngine({ name: 'never', async generate() { calls++; throw new Error() } }).boost(request(raw))
  assert.equal(result.status, 'skipped'); assert.equal(result.optimized, raw); assert.equal(calls, 0)
})
test('short actionable input is not skipped', async () => {
  assert.equal((await new BoostEngine(provider(candidate('请修复登录问题'))).boost(request('修复登录'))).status, 'ok')
})
test('stage and negative constraints cannot disappear', async () => {
  const input = request('登录页面，先给方案，不要改代码')
  const result = await new BoostEngine(provider(candidate('直接实现登录页面'))).boost(input)
  assert.equal(result.status, 'fallback'); assert.equal(result.optimized, input.raw)
  assert.ok(result.warnings.includes('lost_constraint')); assert.ok(result.warnings.includes('changed_stage'))
})
test('numbers, paths, and identifiers survive', () => {
  const input = request('修复 src/login.ts，使用 React，最多 20 字，不新增依赖')
  assert.ok(validateCandidate(input, candidate('修复登录问题')).includes('lost_number'))
  assert.ok(validateCandidate(input, candidate('修复登录问题')).includes('lost_identifier'))
  assert.equal(validateCandidate(input, candidate(input.raw)).length, 0)
})
test('invented numbers and framework are rejected', () => {
  const errors = validateCandidate(request(), candidate('用 React 实现登录页面，耗时 2 秒'))
  assert.ok(errors.includes('new_identifier')); assert.ok(errors.includes('new_number'))
})
test('English prose can be rewritten without treating every new word as an entity', () => {
  assert.deepEqual(validateCandidate(request('build a login page'), candidate('Please create a clear login page.')), [])
  assert.ok(validateCandidate(request('build a login page'), candidate('Create a login page with React.')).includes('new_identifier'))
})
test('whole-file evidence cannot launder an unsupported claim', () => {
  const input = request(); input.context_sources = [{ id: 'f', label: '项目配置', content: 'React 18' }]
  const value = candidate('用 React 99 实现登录页面')
  value.additions = [{ id: 'f1', kind: 'sourced_fact', value: 'React 99', evidence_quote: 'React 18', source_id: 'f', action: 'included' }]
  assert.ok(validateCandidate(input, value).includes('unverifiable_source'))
})
test('exact sourced excerpt is allowed with traceable evidence', () => {
  const input = request(); input.context_sources = [{ id: 'f', label: '项目配置', content: '技术栈 React 18' }]
  const value = candidate('用 React 18 实现登录页面')
  value.additions = [{ id: 'f1', kind: 'sourced_fact', value: 'React 18', evidence_quote: '技术栈 React 18', source_id: 'f', action: 'included' }]
  assert.deepEqual(validateCandidate(input, value), [])
})
test('reference material cannot silently authorize scope expansion', () => {
  const input = request(); input.context_sources = [{ id: 'f', label: '参考', content: '注册和短信验证' }]
  assert.ok(validateCandidate(input, candidate('实现登录页面和短信验证')).includes('expanded_scope'))
})
test('pending suggestions are excluded until explicitly selected', () => {
  const value = candidate('实现登录页面，加入注册')
  value.additions = [{ id: 's', kind: 'suggestion', value: '加入注册', action: 'pending' }]
  assert.ok(validateCandidate(request(), value).includes('pending_suggestion_in_body'))
  assert.deepEqual(validateCandidate(request(), value, ['s']), [])
})
test('edits cannot invent a suggestion id', () => {
  assert.ok(validateCandidate(request(), candidate(), ['made-up']).includes('unknown_suggestion'))
})
test('light mode and Unicode length caps are enforced', () => {
  const input = request('写总结'); input.mode = 'light'
  assert.ok(validateCandidate(input, candidate('字'.repeat(81))).includes('too_long'))
  const standard = request('🙂'.repeat(79))
  assert.ok(!validateCandidate(standard, candidate('🙂'.repeat(400))).includes('too_long'))
  assert.ok(validateCandidate(standard, candidate('🙂'.repeat(401))).includes('too_long'))
})
test('quoted refusal wording is not a rejection heuristic', async () => {
  const input = request('润色这句：抱歉，无法协助处理此事')
  const result = await new BoostEngine(provider(candidate('请润色这句话：抱歉，无法协助处理此事'))).boost(input)
  assert.equal(result.status, 'ok')
})
test('a legitimate question is preserved rather than blocked', () => {
  assert.deepEqual(validateCandidate(request('为什么登录失败？'), candidate('请解释为什么登录失败？')), [])
})
test('malformed JSON returns original', async () => {
  const result = await new BoostEngine({ name: 'broken', async generate() { return '{"optimized":' } }).boost(request())
  assert.equal(result.status, 'fallback'); assert.equal(result.reason_code, 'model_format_error')
})
test('timeout bounds a provider that ignores abort', async () => {
  let aborted = false
  const result = await new BoostEngine({ name: 'hang', generate({ signal }) {
    signal.addEventListener('abort', () => { aborted = true }); return new Promise(() => {})
  } }, { timeoutMs: 20 }).boost(request())
  assert.equal(result.reason_code, 'timeout'); assert.equal(result.status, 'fallback'); assert.equal(aborted, true)
})
test('cancellation aborts the provider and returns a cancelled outcome', async () => {
  const controller = new AbortController()
  const operation = new BoostEngine({ name: 'hang', generate() { return new Promise(() => {}) } }).boost(request(), controller.signal)
  controller.abort()
  assert.equal((await operation).status, 'cancelled')
})
test('telemetry failure cannot break optimization or disclose raw text', async () => {
  const events: BoostEvent[] = []
  const result = await new BoostEngine(provider(candidate()), { timeoutMs: 5000, onEvent(event) { events.push(event); throw new Error() } }).boost(request())
  assert.equal(result.status, 'ok'); assert.equal(events.length, 2)
  assert.deepEqual(events.map(event => event.name), ['boost_clicked', 'boost_completed'])
  assert.ok(events.every(event => event.request_id === 'test'))
  assert.ok(!JSON.stringify(events).includes('登录'))
})
test('invalid and oversized requests fail before a model call', async () => {
  await assert.rejects(new BoostEngine(provider(candidate())).boost({ ...request(), raw: 'x'.repeat(20001) }))
  await assert.rejects(new BoostEngine(provider(candidate())).boost({ ...request(), context_sources: [{ id: 'a', label: 'a', content: '' }, { id: 'a', label: 'b', content: '' }] }))
})
test('code blocks and Windows paths are protected verbatim', () => {
  const raw = '修改 D:\\app\\login.ts，不要改接口\n```ts\nconst n = 4\n```'
  assert.ok(protectedFragments(raw).includes('D:\\app\\login.ts'))
  assert.ok(protectedFragments(raw).includes('```ts\nconst n = 4\n```'))
})
test('numeric constraints are compared as whole tokens, including signs', () => {
  assert.ok(validateCandidate(request('比较 2 和 12'), candidate('比较 12')).includes('lost_number'))
  assert.ok(validateCandidate(request('数值 -2'), candidate('数值 2')).includes('lost_number'))
})
test('an identifier cannot be preserved merely as a prefix of another', () => {
  assert.ok(validateCandidate(request('比较 React 和 ReactNative'), candidate('请比较 ReactNative')).includes('lost_identifier'))
})
test('long-input fallback remains valid on the RPC result boundary', async () => {
  const input = request('任务'.repeat(5000))
  const result = await new BoostEngine({ name: 'broken', async generate() { throw new Error() } }).boost(input)
  assert.equal(result.status, 'fallback')
  assert.equal(resultSchema.parse(result).optimized, input.raw)
})
test('excessively large model responses fall back before parsing', async () => {
  const result = await new BoostEngine({ name: 'oversized', async generate() { return 'x'.repeat(100001) } }).boost(request())
  assert.equal(result.status, 'fallback')
})
