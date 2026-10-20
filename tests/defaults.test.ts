import { test } from 'node:test'
import assert from 'node:assert/strict'
import { completeDefaults, defaultChoices } from '../src/core/defaults.ts'
import { BoostEngine } from '../src/core/engine.ts'
import { modelInput } from '../src/core/prompt.ts'
import { validateCandidate } from '../src/guards/validate.ts'
import { requestSchema, resultSchema, type Candidate } from '../src/types.ts'

const request = (raw = '生成一个风景主题的高级感网页') => requestSchema.parse({ request_id: 'defaults', draft_revision: 0, raw })
const candidate = (optimized = '生成风景主题的高级感网页，注重视觉质感与整体排版。'): Candidate => ({
  optimized, task_type: 'code_gen', slots: { goal: '', context: '', inputs: '', output_format: '', constraints: [], acceptance: [] },
  additions: [], unresolved: [],
})
test('webpage requests receive four explicit, adjustable product defaults', () => {
  const input = request(), value = completeDefaults(input, candidate())
  assert.deepEqual(defaultChoices(input).map(choice => choice.category), ['tech_stack', 'page_modules', 'assets', 'delivery'])
  assert.equal(value.additions.filter(addition => addition.kind === 'default_assumption').length, 4)
  assert.match(value.optimized, /HTML\/CSS\/JavaScript/)
  assert.match(value.optimized, /主题主视觉/); assert.match(value.optimized, /占位图/); assert.match(value.optimized, /完整源码/)
  assert.deepEqual(validateCandidate(input, value), [])
  assert.deepEqual(completeDefaults(input, value), value)
})
test('engine fills routine omissions even if the model only rewrites the task', async () => {
  const result = await new BoostEngine({ name: 'fixture', async generate() { return JSON.stringify(candidate()) } }).boost(request())
  assert.equal(result.status, 'ok'); assert.match(result.optimized, /默认技术路线/)
  assert.equal(resultSchema.parse(result).additions.length, 4)
})
test('known stack and explicit page modules are kept instead of replaced by defaults', () => {
  const choices = defaultChoices(request('使用 Vue 制作网页，只做轮播和页脚'))
  assert.ok(!choices.some(choice => choice.category === 'tech_stack'))
  assert.ok(!choices.some(choice => choice.category === 'page_modules'))
  const input = request(); input.context_sources = [{ id: 'project', label: '项目配置', content: 'React 项目' }]
  assert.ok(!defaultChoices(input).some(choice => choice.category === 'tech_stack'))
})
test('plan-only and no-dependency constraints stay intact', () => {
  const input = request('做一个登录页面，先给方案，不要改代码，不新增依赖')
  const value = completeDefaults(input, candidate(input.raw))
  assert.match(value.optimized, /设计方案与实施步骤，本轮不实施/)
  assert.match(value.optimized, /登录表单/)
  assert.deepEqual(validateCandidate(input, value), [])
  assert.ok(!value.optimized.includes('默认交付：页面完整源码'))
})
test('light mode, explicit opt-out and debugging do not receive default scope', () => {
  assert.deepEqual(defaultChoices({ ...request(), mode: 'light' }), [])
  assert.deepEqual(defaultChoices(request('生成网页，不要自行补充')), [])
  assert.deepEqual(defaultChoices(request('修复这个网页的报错')), [])
  assert.deepEqual(defaultChoices(request('写一份周报')), [])
})
test('explicit asset and delivery requirements suppress those defaults', () => {
  const choices = defaultChoices(request('生成纯文字网页，交付截图，不要图片'))
  assert.ok(!choices.some(choice => choice.category === 'assets' || choice.category === 'delivery'))
  assert.ok(!defaultChoices(request('生成网页，不需要介绍')).some(choice => choice.category === 'page_modules'))
})
test('routine unspecified sentence is removed while missing factual input remains', () => {
  const value = candidate('生成风景主题网页。具体技术栈、页面模块、素材和交付形式尚未指定。')
  value.unresolved = ['具体技术栈尚未指定', '账号密钥和技术栈未指定', '实际业务数据未指定']
  const completed = completeDefaults(request(), value)
  assert.ok(!completed.optimized.includes('尚未指定'))
  assert.deepEqual(completed.unresolved, ['账号密钥和技术栈未指定', '实际业务数据未指定'])
})
test('unauthorized assumptions cannot launder frameworks, numbers or business scope', () => {
  const value = candidate('用 React 构建网页，加入支付，保证 99 秒交付。')
  value.additions = [{ id: 'fake', kind: 'default_assumption', category: 'tech_stack', value: value.optimized, action: 'included' }]
  const errors = validateCandidate(request(), value)
  assert.ok(errors.includes('unapproved_default')); assert.ok(errors.includes('new_identifier'))
  assert.ok(errors.includes('new_number')); assert.ok(errors.includes('expanded_scope'))
})
test('defaults cannot be passed off as sourced facts or grant absent text', () => {
  const input = request(), value = completeDefaults(input, candidate())
  value.additions[0].source_id = 'fake'
  assert.ok(validateCandidate(input, value).includes('unapproved_default'))
  delete value.additions[0].source_id
  value.optimized = '生成一个网页'
  assert.ok(validateCandidate(input, value).includes('fact_not_in_body'))
})
test('English defaults fit the short-input limit and are sent to the model', () => {
  const input = { ...request('build a landscape page'), language: 'en' as const }
  const value = completeDefaults(input, candidate('Build a polished landscape page.'))
  assert.deepEqual(validateCandidate(input, value), [])
  assert.equal(JSON.parse(modelInput(input)).default_choices.length, 4)
})
test('automatic completion stays inside the strict output contract', async () => {
  const value = candidate()
  value.additions = Array.from({ length: 20 }, (_, i) => ({ id: String(i), kind: 'suggestion', action: 'pending', value: `建议${i}` }))
  const result = await new BoostEngine({ name: 'fixture', async generate() { return JSON.stringify(value) } }).boost(request())
  assert.equal(result.status, 'fallback'); assert.ok(resultSchema.safeParse(result).success)
})
test('paraphrased default bookkeeping does not reject an otherwise usable rewrite', async () => {
  const input = requestSchema.parse({ request_id: 'unused-default', draft_revision: 0, raw: 'build a login page', language: 'en' })
  const body = "Build a login page. Use the project's existing stack; if this is a standalone page, use HTML/CSS/JavaScript without adding dependencies. Include a login form, input guidance, and submission feedback. Deliver the page source and local run instructions. Keep the result focused on the current request and do not add extra business features or change frameworks."
  const canonical = 'Default stack: reuse the project stack; for a standalone page use HTML/CSS/JavaScript without new dependencies.'
  const value: Candidate = { ...candidate(body), task_type: 'code_gen', additions: [
    { id: 'd1', kind: 'default_assumption', category: 'tech_stack', value: canonical, action: 'included' },
  ] }
  const result = await new BoostEngine({ name: 'fixture', async generate() { return JSON.stringify(value) } }).boost(input)
  assert.equal(result.status, 'ok')
  // The canonical sentence did not fit the remaining budget, but its identifiers stay
  // authorized and the rewrite is still applied rather than falling back.
  assert.ok(!result.optimized.includes(canonical))
  assert.ok(result.additions.some(addition => addition.id === 'd1'))
  assert.ok(result.additions.every(addition => addition.kind !== 'default_assumption' || addition.value === canonical || result.optimized.includes(addition.value)))
})
