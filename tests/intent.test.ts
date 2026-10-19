import { test } from 'node:test'
import assert from 'node:assert/strict'
import { taskIntent, textBudget } from '../src/core/intent.ts'
import { classify } from '../src/core/route.ts'
import { defaultChoices, completeDefaults } from '../src/core/defaults.ts'
import { modelInput } from '../src/core/prompt.ts'
import { validateCandidate } from '../src/guards/validate.ts'
import { BoostEngine } from '../src/core/engine.ts'
import { requestSchema, type Candidate } from '../src/types.ts'

const request = (raw: string) => requestSchema.parse({ request_id: 'intent', draft_revision: 0, raw, language: /[\u3400-\u9fff]/.test(raw) ? 'zh' : 'en' })
const candidate = (optimized: string): Candidate => ({ optimized, task_type: 'other', additions: [], unresolved: [],
  slots: { goal: '', context: '', inputs: '', output_format: '', constraints: [], acceptance: [] } })

for (const [raw, expected] of [
  ['写一篇关于网页设计的文章，给初学者看', 'writing'],
  ['写一封解释网站报错的邮件，语气友好', 'writing'],
  ['翻译这个登录页面的文案成英文', 'writing'],
  ['write a blog post about debugging a website', 'writing'],
  ['写一个 Python 脚本', 'code_gen'],
  ['write a script to build a page', 'code_gen'],
  ['生成高级感网页', 'code_gen'],
] as const) test(`action takes priority over topic: ${raw}`, () => {
  assert.equal(classify(raw), expected)
  if (expected === 'writing') assert.deepEqual(defaultChoices(request(raw)), [])
})

for (const raw of ['给现有网站加一个深色模式', '优化网页排版，保持接口不变', 'adjust the layout of this page', '修改这个页面的按钮']) {
  test(`local change does not turn into a new product: ${raw}`, () => {
    const intent = taskIntent(request(raw))
    assert.equal(intent.operation, 'modify')
    assert.deepEqual(defaultChoices(request(raw)), [])
    assert.ok(intent.guidance.some(line => line.includes('不要求重建完整项目')))
  })
}
test('no-dependency wording does not misclassify creation as a modification', () => {
  assert.equal(taskIntent(request('生成登录页面，不新增依赖')).operation, 'create')
  assert.ok(defaultChoices(request('生成登录页面，不新增依赖')).length > 0)
})
test('plan, diagnosis and questions keep their distinct delivery stage', () => {
  assert.equal(taskIntent(request('登录页面，先给方案，不要改代码')).stage, 'plan')
  assert.equal(taskIntent(request('先分析这个网页为什么加载慢')).stage, 'analysis')
  assert.equal(taskIntent(request('为什么网页加载慢？')).operation, 'explain')
  assert.deepEqual(defaultChoices(request('解释这个网页的设计思路')), [])
  const value = candidate('先给方案，不要直接实现。')
  assert.ok(!validateCandidate(request(value.optimized), value).includes('changed_stage'))
})
test('page defaults match login, dashboard, portfolio and commerce goals', () => {
  const layout = (raw: string) => defaultChoices(request(raw)).find(choice => choice.category === 'page_modules')!.value
  assert.match(layout('做一个登录页面'), /登录表单/)
  assert.match(layout('设计一个管理后台页面'), /字段和指标/)
  assert.match(layout('做一个个人作品集网站'), /作品展示/)
  assert.match(layout('设计商品详情页面'), /商品展示/)
  for (const raw of ['做一个登录页面', '设计一个管理后台页面']) {
    assert.ok(!defaultChoices(request(raw)).some(choice => choice.category === 'assets'))
  }
})
test('explicit minimal components are not expanded into whole-page sections', () => {
  const choices = defaultChoices(request('做一个网页，只要一个按钮'))
  assert.ok(!choices.some(choice => choice.category === 'page_modules' || choice.category === 'assets'))
})
test('explicit language, audience and style are preserved before defaults', async () => {
  const input = request('写一份中文说明，给初学者看，语气友好')
  const good = candidate('请为初学者写一份中文说明，语气友好。')
  assert.deepEqual(validateCandidate(input, good), [])
  const lost = candidate('请写一份正式说明。')
  assert.ok(validateCandidate(input, lost).includes('lost_preference'))
  const result = await new BoostEngine({ name: 'fixture', async generate() { return JSON.stringify(candidate('生成网页。')) } }).boost(request('生成高级感网页'))
  assert.equal(result.status, 'fallback'); assert.ok(result.warnings.includes('lost_preference'))
})
test('default template cannot hide a forbidden dependency constraint dropped by the model', async () => {
  const result = await new BoostEngine({ name: 'fixture', async generate() { return JSON.stringify(candidate('生成一个登录页面。')) } })
    .boost(request('生成一个登录页面，不新增依赖'))
  assert.equal(result.status, 'fallback'); assert.ok(result.warnings.includes('lost_constraint'))
})
test('concise prompts use a smaller budget and receive only defaults that fit', () => {
  const input = request('简短描述一个风景网页')
  assert.equal(textBudget(input), 100)
  const value = completeDefaults(input, candidate(input.raw))
  assert.ok([...value.optimized].length <= textBudget(input))
  assert.deepEqual(validateCandidate(input, value), [])
  const explicit = request('帮我生成一个网页，优化后的提示词最多50字')
  assert.equal(textBudget(explicit), 50)
  assert.ok(validateCandidate(explicit, candidate(`${explicit.raw}${'字'.repeat(60)}`)).includes('too_long'))
  // A downstream article limit is not a request to shrink the prompt itself.
  assert.equal(textBudget(request('写一篇不超过50字的文章')), 400)
})
test('prepared model input exposes task-specific guidance without reading project files', () => {
  const input = JSON.parse(modelInput(request('修复现有项目的登录报错，不新增依赖')))
  assert.equal(input.task_intent.task_type, 'debug')
  assert.equal(input.task_intent.project, 'existing')
  assert.deepEqual(input.default_choices, [])
  assert.ok(input.task_intent.guidance.some((line: string) => line.includes('不假定根因已经查明')))
  assert.equal(input.max_output_chars, 400)
})
test('question rewrites cannot become instructions to execute changes', () => {
  assert.ok(validateCandidate(request('为什么这个页面加载很慢？'), candidate('修改这个页面的加载方式。')).includes('changed_intent'))
  assert.equal(taskIntent(request('how to build a login page')).operation, 'explain')
  assert.deepEqual(defaultChoices(request('write a script to build a page')), [])
})
test('default completion never crowds out a nearly full valid rewrite', () => {
  const input = request('生成一个风景网页')
  const value = candidate('风景网页'.repeat(98))
  const completed = completeDefaults(input, value)
  assert.equal(completed.optimized, value.optimized)
  assert.deepEqual(validateCandidate(input, completed), [])
})
test('staged execution differs from a plan that awaits user confirmation', () => {
  assert.equal(taskIntent(request('做一个网页，先给方案，然后实现')).stage, 'execution')
  assert.equal(taskIntent(request('做一个网页，先给方案，等我确认后再实现')).stage, 'plan')
  assert.equal(taskIntent(request('先分析页面加载问题，再修改代码')).stage, 'execution')
  assert.equal(taskIntent(request('先分析页面加载问题，确认后再修改代码')).stage, 'analysis')
})
test('a visually simple page is not confused with a short-prompt instruction', () => {
  assert.equal(taskIntent(request('做一个简洁的登录页面')).concise, false)
  assert.equal(textBudget(request('做一个简洁的登录页面')), 400)
  assert.equal(classify('写一段说明网站报错的文案'), 'writing')
})
test('actual model phase paraphrase is accepted without weakening prohibitions', () => {
  const input = request('优化现有登录页面的排版，先给方案，不要改代码，不新增依赖')
  const value = candidate('针对现有登录页面，先给出排版优化方案，说明当前存在的排版问题、调整思路和具体改动点。本轮只讨论方案，不要改代码，不新增依赖。')
  assert.deepEqual(validateCandidate(input, value), [])
  assert.ok(validateCandidate(input, candidate('先给出排版优化方案，然后修改代码，不新增依赖。')).includes('lost_constraint'))
  assert.ok(validateCandidate(request('登录页面，先给方案'), candidate('先给出登录页面方案，然后实现。')).includes('changed_stage'))
})
