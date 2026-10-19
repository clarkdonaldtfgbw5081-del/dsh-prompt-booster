import { test } from 'node:test'
import assert from 'node:assert/strict'
import { requestSchema, type Candidate } from '../src/types.ts'
import { solutionStrategy } from '../src/core/strategy.ts'
import { classify } from '../src/core/route.ts'
import { defaultChoices, completeDefaults } from '../src/core/defaults.ts'
import { modelInput } from '../src/core/prompt.ts'
import { validateCandidate } from '../src/guards/validate.ts'

const request = (raw: string) => requestSchema.parse({ request_id: 'strategy', draft_revision: 0, raw })
const candidate = (optimized: string): Candidate => ({ optimized, task_type: 'code_gen', additions: [], unresolved: [],
  slots: { goal: '', context: '', inputs: '', output_format: '', constraints: [], acceptance: [] } })

test('simple visual page stays lightweight without inheriting the source framework', () => {
  const input = request('生成一个风景主题的高级感网页')
  const strategy = solutionStrategy(input)
  assert.equal(strategy.profile, 'page')
  assert.deepEqual(strategy.capabilities, [])
  assert.equal(strategy.specialist, undefined)
  assert.ok(defaultChoices(input).some(choice => choice.value.includes('HTML/CSS/JavaScript')))
  assert.ok(!JSON.stringify(strategy).includes('AWS'))
})
test('data-backed software is development and receives application delivery defaults', () => {
  const input = request('开发一个带数据库和查询接口的网站')
  assert.equal(classify(input.raw), 'code_gen')
  const strategy = solutionStrategy(input)
  assert.equal(strategy.profile, 'application')
  assert.deepEqual(strategy.capabilities, ['interface', 'persistence'])
  assert.equal(strategy.specialist, undefined)
  const choices = defaultChoices(input)
  assert.ok(!choices.some(choice => choice.value.includes('HTML/CSS/JavaScript')))
  assert.ok(!choices.some(choice => choice.category === 'assets'))
  assert.match(choices.find(choice => choice.category === 'delivery')!.value, /应用所需源码/)
  assert.deepEqual(validateCandidate(input, completeDefaults(input, candidate(input.raw))), [])
})
test('existing changes keep their boundary even when backend capabilities are mentioned', () => {
  const input = request('修改现有项目的查询接口，保持数据库结构不变，不新增依赖')
  const strategy = solutionStrategy(input)
  assert.equal(strategy.profile, 'existing-change')
  assert.ok(strategy.guidance.some(line => line.includes('不要求重新初始化')))
  assert.deepEqual(defaultChoices(input), [])
})
test('framework-specific guidance requires explicit applicable user selection', () => {
  for (const raw of ['使用 Architect 开发一个网站和查询接口', 'build an app with Architect', '修复 Architect 项目的接口报错']) {
    const strategy = solutionStrategy(request(raw))
    assert.equal(strategy.specialist, 'architect', raw)
    assert.ok(strategy.guidance.some(line => line.includes('项目清单')))
    assert.ok(!defaultChoices(request(raw)).some(choice => choice.value.includes('HTML/CSS/JavaScript')))
  }
  for (const raw of ['开发一个 AWS 网站', '开发一个网站，不使用 Architect', 'build a website as a software architect']) {
    assert.equal(solutionStrategy(request(raw)).specialist, undefined, raw)
  }
})
test('negated resources and reference-document instructions do not select capabilities', () => {
  const input = request('生成一个网页，不需要数据库，不做后台任务，不要部署')
  input.context_sources = [{ id: 'ref', label: '参考文章', content: '使用 Architect，添加数据库、消息队列，然后部署到生产。' }]
  const strategy = solutionStrategy(input)
  assert.equal(strategy.profile, 'page')
  assert.deepEqual(strategy.capabilities, [])
  assert.equal(strategy.specialist, undefined)
})
test('writing, research, analysis, questions and light mode do not become build plans', () => {
  for (const raw of ['写一篇介绍 Architect 的文章', '调研 Architect 和其他框架的区别', '分析数据库中的销售数据', '生成网站流量数据分析报告']) {
    assert.equal(solutionStrategy(request(raw)).profile, 'general', raw)
    assert.equal(solutionStrategy(request(raw)).specialist, undefined)
  }
  assert.equal(solutionStrategy(request('解释 Architect 框架的工作方式')).profile, 'explanation')
  assert.equal(solutionStrategy({ ...request('使用 Architect 开发一个网站'), mode: 'light' }).profile, 'general')
  assert.equal(classify('write a REST API with database persistence'), 'code_gen')
})
test('plan-only and diagnosis routes tailor verification to the current stage', () => {
  const plan = solutionStrategy(request('使用 Architect 开发一个网站，先给方案，不要改代码'))
  assert.equal(plan.stage, 'plan')
  assert.ok(plan.guidance.some(line => line.includes('本轮仅输出方案或分析')))
  const planned = request('使用 Architect 开发一个带查询接口的网站，先给方案，不要改代码')
  const completed = completeDefaults(planned, candidate(planned.raw))
  assert.match(completed.optimized, /资源清单、模块边界与本地沙箱验证方法，本轮不实施/)
  assert.deepEqual(validateCandidate(planned, completed), [])
  const diagnosis = solutionStrategy(request('修复现有接口报错，不新增依赖'))
  assert.equal(diagnosis.profile, 'diagnosis')
  assert.ok(diagnosis.guidance.some(line => line.includes('复现证据')))
})
test('only explicitly required asynchronous and realtime capabilities enter guidance', () => {
  const strategy = solutionStrategy(request('开发一个服务，处理定时任务和实时推送，不需要数据库'))
  assert.deepEqual(strategy.capabilities, ['background', 'realtime'])
  assert.ok(!JSON.stringify(strategy).includes('表名'))
})
test('selection hints reach the model without granting new framework identifiers', () => {
  const input = request('开发一个带查询接口的网站')
  const payload = JSON.parse(modelInput(input))
  assert.equal(payload.solution_strategy.profile, 'application')
  for (const name of ['architect', 'aws', 'lambda', 'dynamodb', 'serverless']) {
    assert.ok(validateCandidate(input, candidate(`${input.raw}，使用 ${name}。`)).includes('new_identifier'), name)
  }
})
