import { test } from 'node:test'
import assert from 'node:assert/strict'
import { defaultChoices, completeDefaults } from '../src/core/defaults.ts'
import { modelInput } from '../src/core/prompt.ts'
import { textBudget } from '../src/core/intent.ts'
import { requestSchema } from '../src/types.ts'
import { parseCandidate, validateCandidate } from '../src/guards/validate.ts'
import { BoostEngine } from '../src/core/engine.ts'

const request = (raw: string) => requestSchema.parse({ request_id: 'task-default', draft_revision: 0, raw, language: /[\u3400-\u9fff]/.test(raw) ? 'zh' : 'en' })

test('dynamic-site defaults prioritize tools and workflow within the text budget', () => {
  for (const raw of ['创建一个动态网站', 'Build a dynamic website']) {
    const input = request(raw)
    const choices = defaultChoices(input)
    assert.equal(choices[0].category, 'tech_stack')
    assert.equal(choices[1].category, 'delivery')
    assert.ok(!choices.some(choice => choice.category === 'assets'))
    assert.match(choices[0].value, /React.*Vite/)
    assert.match(choices[1].value, /原型|prototype/)
    const completed = completeDefaults(input, parseCandidate(JSON.stringify({ optimized: raw }), input))
    assert.ok([...completed.optimized].length <= textBudget(input))
    assert.deepEqual(validateCandidate(input, completed), [])
    assert.doesNotMatch(completed.optimized, /SQLite|账号|支付|subscription|payment/)
  }
})

test('explicit stack, dependency limits and plan-only stages override dynamic defaults', () => {
  const explicit = defaultChoices(request('使用 Vue 创建动态网站'))
  assert.ok(!explicit.some(choice => choice.category === 'tech_stack'))
  assert.doesNotMatch(defaultChoices(request('创建动态网站，不新增依赖')).map(choice => choice.value).join('\n'), /React|Vite/)
  const plan = request('创建动态网站，先给方案，不要改代码')
  const completed = completeDefaults(plan, parseCandidate(JSON.stringify({ optimized: plan.raw }), plan))
  assert.match(completed.optimized, /本轮不实施/)
  assert.doesNotMatch(completed.optimized, /默认实施/)
  assert.deepEqual(validateCandidate(plan, completed), [])
})

test('task defaults fill useful delivery structure without inventing facts', async () => {
  for (const [raw, match] of [
    ['写一份周报', /工作进展/], ['写一封邮件', /邮件包含主题/],
    ['排查服务报错', /复现与排查/], ['修复页面报错', /修复与验证/],
    ['调研远程协作方式', /来源与适用范围/], ['分析销售数据', /数据口径/],
    ['Write a weekly report', /progress/], ['Research remote collaboration', /cite sources/],
  ] as const) {
    const input = request(raw)
    const result = await new BoostEngine({ name: 'fixture', async generate() { return JSON.stringify({ optimized: raw }) } }).boost(input)
    assert.equal(result.status, 'ok', raw)
    assert.match(result.optimized, match)
    assert.deepEqual(result.additions.map(row => row.kind), ['default_assumption'])
    assert.deepEqual(validateCandidate(input, result), [], raw)
  }
})

test('explicit output, concise requests, translation and opt-outs keep their scope', () => {
  for (const raw of ['写一份周报，按进度和风险组织', '写一封邮件，只输出正文', '写一份周报，不要自行补充', '翻译这封邮件', '写一首诗', '写一份周报，提示词简短'])
    assert.deepEqual(defaultChoices(request(raw)), [], raw)
  assert.deepEqual(defaultChoices({ ...request('分析销售数据'), mode: 'light' }), [])
  assert.deepEqual(defaultChoices({ ...request('写一份周报'), preferences: { detail: 'auto', tone: 'auto', fillDefaults: false } }), [])
})

test('existing structured drafts avoid additional templates and have a bounded refinement budget', async () => {
  const raw = '目标：制作展示页\n要求：深色主题\n交付：可运行源码'
  const input = request(raw)
  assert.deepEqual(defaultChoices(input), [])
  assert.ok(textBudget(input) <= [...raw].length + 40)
  assert.ok(JSON.parse(modelInput(input)).refinement_guidance)
  const result = await new BoostEngine({ name: 'fixture', async generate() { return JSON.stringify({ optimized: raw }) } }).boost(input)
  assert.equal(result.status, 'skipped')
  assert.equal(result.optimized, raw)
})

test('default expansion is stable when its output becomes the next input', () => {
  const input = request('创建一个动态网站')
  const first = completeDefaults(input, parseCandidate(JSON.stringify({ optimized: input.raw }), input))
  const next = request(first.optimized)
  assert.deepEqual(defaultChoices(next), [])
  const unchanged = parseCandidate(JSON.stringify({ optimized: first.optimized }), next)
  assert.equal(completeDefaults(next, unchanged).optimized, first.optimized)
  assert.deepEqual(validateCandidate(next, unchanged), [])
})

test('rendered website choices are not appended again, while missing workflow is completed', () => {
  const input = request('创建一个动态网站')
  const body = '制作动态网站，新项目默认采用 React 与 Vite。围绕核心目标安排主要内容和必要操作，保持层次清晰；使用主题占位图。'
  const value = completeDefaults(input, parseCandidate(JSON.stringify({ optimized: body }), input))
  assert.equal(value.optimized.split('React').length - 1, 1)
  assert.equal(value.optimized.split('占位图').length - 1, 1)
  assert.match(value.optimized, /默认实施/)
  assert.deepEqual(validateCandidate(input, value, [], { allowUnusedAdditions: true }), [])
  const invalid = { ...value, optimized: value.optimized + ' 使用 Redis。' }
  assert.ok(validateCandidate(input, invalid, [], { allowUnusedAdditions: true }).includes('new_identifier'))
})

test('partial default mentions cannot conceal omitted tools or steps', () => {
  const input = request('创建一个动态网站')
  const value = completeDefaults(input, parseCandidate(JSON.stringify({ optimized: '制作动态网站，默认使用 React。' }), input))
  assert.match(value.optimized, /默认工具.*Vite/)
  assert.match(value.optimized, /默认实施/)
})

test('a complete natural-language workflow remains concise without canonical repetition', () => {
  const input = request('创建一个动态网站')
  const body = '制作动态网站，默认采用 React 与 Vite。围绕页面核心目标组织主要内容和必要操作，搭建可运行原型；按实际数据需求选择服务端。检查加载和失败反馈，交付源码与本地运行说明。'
  const completed = completeDefaults(input, parseCandidate(JSON.stringify({ optimized: body }), input))
  assert.equal(completed.optimized, body)
  assert.deepEqual(validateCandidate(input, completed, [], { allowUnusedAdditions: true }), [])
})
