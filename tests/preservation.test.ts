import { test } from 'node:test'
import assert from 'node:assert/strict'
import { BoostEngine } from '../src/core/engine.ts'
import { intentAnchors, validateCandidate } from '../src/guards/validate.ts'
import { requestSchema, type Candidate, type ModelProvider } from '../src/types.ts'

/**
 * P0 regression: a well-formed candidate must still answer the original task.
 * The guard uses coarse anchors (CJK bigrams / English content words) and only
 * rejects a rewrite when none of them survives, so legitimate paraphrases pass.
 */

const request = (raw = '实现登录页面') =>
  requestSchema.parse({ request_id: 'preservation', draft_revision: 3, raw, mode: 'standard' })
const candidate = (optimized: string): Candidate => ({
  optimized, task_type: 'other',
  slots: { goal: '', context: '', inputs: '', output_format: '', constraints: [], acceptance: [] },
  additions: [], unresolved: [],
})
const provider = (value: Candidate): ModelProvider => ({ name: 'fixture', async generate() { return JSON.stringify(value) } })

test('anchors keep the task subject and drop generic request words', () => {
  const chinese = intentAnchors('实现登录页面')
  assert.ok(chinese.includes('登录'))
  assert.ok(chinese.includes('页面'))
  assert.ok(!chinese.includes('实现'))
  const english = intentAnchors('build a login page')
  assert.ok(english.includes('login'))
  assert.ok(english.includes('page'))
  assert.ok(!english.includes('build'))
})

test('an unrelated Chinese task is rejected even when the candidate is well formed', () => {
  const errors = validateCandidate(request('实现登录页面'), candidate('写一首关于春天的诗。'))
  assert.ok(errors.includes('replaced_task'))
})

test('a shared generic preamble does not make a different task acceptable', () => {
  const errors = validateCandidate(request('实现登录页面'), candidate('实现一首关于春天的诗。'))
  assert.ok(errors.includes('replaced_task'))
})

test('an unrelated English task is rejected', () => {
  const errors = validateCandidate(request('build a login page'), candidate('Write a poem about spring.'))
  assert.ok(errors.includes('replaced_task'))
})

test('one surviving task anchor is enough for a paraphrase', () => {
  assert.deepEqual(validateCandidate(request('实现登录页面'), candidate('登录页面的实现说明。')), [])
})

test('a legitimate Chinese rewrite still passes', () => {
  assert.deepEqual(validateCandidate(request('做一个登录页面'), candidate('请实现一个登录页面。')), [])
})

test('a legitimate English rewrite still passes', () => {
  assert.deepEqual(validateCandidate(request('build a login page'), candidate('Please create a clear login page.')), [])
})

test('raw text without anchors is never reported as replaced', () => {
  assert.deepEqual(validateCandidate(request('🙂🙂'), candidate('😀😀')), [])
})

test('default completion cannot mask a whole-task replacement in the engine', async () => {
  const input = request('实现登录页面')
  const result = await new BoostEngine(provider(candidate('写一首关于春天的诗。'))).boost(input)
  assert.equal(result.status, 'fallback')
  assert.equal(result.optimized, input.raw)
  assert.ok(result.warnings.includes('replaced_task'))
})

test('English default sentences cannot mask an English whole-task replacement', async () => {
  const input = request('build a login page')
  const result = await new BoostEngine(provider(candidate('Write a poem about spring.'))).boost(input)
  assert.equal(result.status, 'fallback')
  assert.equal(result.optimized, input.raw)
  assert.ok(result.warnings.includes('replaced_task'))
})

test('unauthorized login capabilities expand scope even when the task is preserved', () => {
  const errors = validateCandidate(request('实现登录页面'),
    candidate('实现登录页面，增加微信扫码登录和手机号验证码登录。'))
  assert.ok(errors.includes('expanded_scope'))
  assert.ok(!errors.includes('replaced_task'))
})

test('a scope word already requested by the user stays authorized', () => {
  assert.deepEqual(validateCandidate(request('实现微信扫码登录页面'), candidate('请实现微信扫码登录页面。')), [])
})

test('ASCII scope terms match whole words, not fragments of unrelated prose', () => {
  const errors = validateCandidate(request('build a login page'),
    candidate('Please create a login page for associate review.'))
  assert.deepEqual(errors, [])
})

test('excluding optional capabilities does not count as adding them', () => {
  assert.deepEqual(validateCandidate(request('实现登录页面'), candidate('实现登录页面，不添加注册或支付功能。')), [])
  assert.deepEqual(validateCandidate(request('build a login page'), candidate('Build a login page. Do not add registration or payment.')), [])
})

test('a prohibited capability in raw cannot authorize adding it elsewhere', () => {
  const input = request('实现登录页面，不要注册功能')
  const errors = validateCandidate(input, candidate('实现登录页面，不要注册功能；另增加注册功能。'))
  assert.ok(errors.includes('expanded_scope'))
  assert.ok(!errors.includes('lost_constraint'))
})

test('explicit negative additions remain protected when the rewrite omits them', () => {
  for (const constraint of ['不添加注册功能', '不加入支付功能', '不使用第三方登录', '不需要验证码']) {
    const input = request(`实现登录页面，${constraint}`)
    assert.ok(validateCandidate(input, candidate('实现登录页面。')).includes('lost_constraint'), constraint)
    assert.deepEqual(validateCandidate(input, candidate(input.raw)), [])
  }
})
