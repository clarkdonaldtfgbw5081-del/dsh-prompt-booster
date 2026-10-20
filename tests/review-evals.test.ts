import { test } from 'node:test'
import assert from 'node:assert/strict'
import { prepareReview, summarizeReview } from '../evals/review.ts'

const dataset = () => ({ schema: 1, provenance: 'synthetic', consent_to_evaluate: true,
  baseline: 'old', candidate: 'new', cases: [{ id: 'case-1', raw: '写一份周报，不超过500字', must_preserve: ['500'], forbidden: ['支付'],
    baseline: { status: 'fallback', text: '写一份周报，不超过500字', latency_ms: 8 },
    candidate: { status: 'ok', text: '撰写本周工作总结，不超过500字', latency_ms: 10 } }] })
const scores = [{ id: 'case-1', preferred: 'A', A: { intent: 2, completeness: 2, usefulness: 2 }, B: { intent: 2, completeness: 2, usefulness: 0 } }]
test('blind review hides labels, includes failed attempts and emits a text-free summary', () => {
  const input = dataset(), prepared = prepareReview(input, () => true)
  assert.ok(!JSON.stringify(prepared.packet).includes('candidate'))
  assert.equal(prepared.packet.cases[0].A, input.cases[0].candidate.text)
  const report = summarizeReview(input, prepared.key, scores)
  assert.equal(report.baseline.coverage, 0)
  assert.equal(report.candidate.coverage, 1)
  assert.equal(report.candidate.wins, 1)
  assert.equal(report.candidate.exactChecks.passed, 1)
  assert.ok(!JSON.stringify(report).includes('周报'))
  assert.equal(report.provenance, 'synthetic')
})
test('blind reviews reject unapproved data, changed datasets, duplicate ids and incomplete scores', () => {
  assert.throws(() => prepareReview({ ...dataset(), consent_to_evaluate: false }))
  const input = dataset(), prepared = prepareReview(input)
  assert.throws(() => summarizeReview(input, prepared.key, prepared.scores))
  assert.throws(() => summarizeReview(input, prepared.key, [...scores, ...scores]))
  input.cases[0].raw += '修改'
  assert.throws(() => summarizeReview(input, prepared.key, scores))
})
