import { test } from 'node:test'
import assert from 'node:assert/strict'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  buildLiveReport,
  liveCoverageFailure,
  liveIssues,
  percentile,
  readOptions,
  resolveGitCommit,
  type LiveObservation,
} from '../evals/metrics.ts'
import { baseResult } from '../src/core/engine.ts'
import { requestSchema, type BoostResult } from '../src/types.ts'
import type { GoldenCase } from '../evals/cases.ts'

const request = requestSchema.parse({ raw: '写周报', request_id: 'r', draft_revision: 0 })

function result(overrides: Partial<BoostResult> = {}): BoostResult {
  return Object.assign(baseResult(request, 'fixture-model'), overrides)
}

function golden(partial: Partial<GoldenCase> & { id: string }): GoldenCase {
  return { group: 'writing', raw: '写周报', ...partial }
}

function observation(caze: GoldenCase, overrides: Partial<BoostResult> = {}): LiveObservation {
  return { caze, result: result(overrides) }
}

function meta(latency_ms: number, attempts?: number) {
  return { model: 'fixture-model', latency_ms, ...(attempts === undefined ? {} : { attempts }) }
}

test('live evaluation cannot pass on failures or cancelled requests', () => {
  const failed = baseResult(requestSchema.parse({ raw: '写周报', request_id: 'r', draft_revision: 0 }), 'fixture')
  assert.equal(liveIssues({ id: 'e', group: 'writing', raw: '写周报' }, failed).length, 1)
  failed.status = 'cancelled'
  assert.equal(liveIssues({ id: 'e', group: 'writing', raw: '写周报' }, failed).length, 1)
})
test('small-sample high percentiles include the slowest tail', () => {
  assert.equal(percentile([10, 1000], 0.9), 1000)
  assert.equal(percentile([], 0.9), undefined)
})
test('evaluation rejects invalid or misspelled cost controls', () => {
  for (const args of [['--live', '--limit'], ['--live', '--limit', '-1'], ['--live', '--limit', '0'], ['--live', '--limit', '2.5'], ['--limt', '2']]) assert.throws(() => readOptions(args))
  assert.deepEqual(readOptions(['--live', '--limit', '2']), { live: true, limit: 2 })
})
test('--live --out writes an opt-in artifact path and is rejected without --live', () => {
  assert.deepEqual(readOptions(['--live', '--out', 'evals/results/live.json']), { live: true, out: 'evals/results/live.json' })
  assert.deepEqual(readOptions(['--live', '--limit', '2', '--out', 'a/b.json']), { live: true, limit: 2, out: 'a/b.json' })
  for (const args of [['--out', 'x.json'], ['--live', '--out'], ['--live', '--out', ''], ['--live', '--out', '-x'], ['--live', '--out=']]) {
    assert.throws(() => readOptions(args))
  }
})
test('live report records schema, per-case fields and summary statistics', () => {
  const cases = [
    observation(golden({ id: 'ok-kept', must_preserve: ['周报'], forbidden: ['机密'] }), {
      status: 'ok', optimized: '写周报并保留结构', meta: meta(10, 1),
    }),
    observation(golden({ id: 'ok-missing', must_preserve: ['关键'], forbidden: ['React'] }), {
      status: 'ok', optimized: '写周报 React', meta: meta(20, 2),
    }),
    observation(golden({ id: 'fallback' }), {
      status: 'fallback', reason_code: 'model_request_failed', warnings: ['lost_constraint'], meta: meta(30),
    }),
    observation(golden({ id: 'skipped' }), { status: 'skipped', reason_code: 'greeting', meta: meta(40) }),
    observation(golden({ id: 'cancelled' }), { status: 'cancelled', reason_code: 'cancelled', meta: meta(50) }),
  ]
  const report = buildLiveReport({
    model: 'fixture-model',
    cases,
    startedAt: '2026-10-20T04:00:00.000Z',
    options: { limit: 5, gitCommit: null },
  })
  assert.equal(report.schema, 1)
  assert.equal(report.model, 'fixture-model')
  assert.equal(report.created_at, '2026-10-20T04:00:00.000Z')
  assert.equal(report.git_commit, null)
  assert.deepEqual(report.options, { limit: 5 })
  assert.deepEqual(report.summary, {
    total: 5, ok: 2, fallback: 1, skipped: 1, cancelled: 1,
    coverage: 0.4, preservation: 0.5, p50: 30, p90: 50, max: 50,
  })
  const kept = report.cases[0]
  assert.equal(kept.id, 'ok-kept')
  assert.equal(kept.status, 'ok')
  assert.equal(kept.reason, null)
  assert.deepEqual(kept.warnings, [])
  assert.equal(kept.latency_ms, 10)
  assert.equal(kept.attempts, 1)
  assert.equal(kept.chars, [...'写周报并保留结构'].length)
  assert.equal(kept.preservation_ok, true)
  assert.deepEqual(kept.forbidden_hits, [])
  assert.equal(report.cases[1].preservation_ok, false)
  assert.deepEqual(report.cases[1].forbidden_hits, ['React'])
  assert.equal(report.cases[2].reason, 'model_request_failed')
  assert.equal(report.cases[2].preservation_ok, undefined)
  assert.deepEqual(report.cases[2].warnings, ['lost_constraint'])
  assert.equal(report.cases[3].attempts, 0)
})
test('live report flags zero usable rewrites and tolerates missing git metadata', () => {
  const noUsable = buildLiveReport({
    model: 'm',
    cases: [observation(golden({ id: 'f' }), { status: 'fallback', reason_code: 'model_request_failed', meta: meta(30) })],
    startedAt: '2026-10-20T04:00:00.000Z',
    options: { gitCommit: null },
  })
  assert.equal(noUsable.summary.coverage, 0)
  assert.match(liveCoverageFailure(noUsable) ?? '', /没有可用改写/)
  const usable = buildLiveReport({
    model: 'm',
    cases: [observation(golden({ id: 'ok' }), { status: 'ok', optimized: '写周报', meta: meta(1) })],
    startedAt: '2026-10-20T04:00:00.000Z',
    options: { gitCommit: null },
  })
  assert.equal(liveCoverageFailure(usable), undefined)
  assert.equal(resolveGitCommit(join(tmpdir(), `dsh-pb-missing-${process.pid}-${Date.now()}`)), null)
  const overridden = buildLiveReport({
    model: 'm', cases: [], startedAt: '2026-10-20T04:00:00.000Z',
    options: { gitCommit: '0123456789abcdef0123456789abcdef01234567' },
  })
  assert.equal(overridden.git_commit, '0123456789abcdef0123456789abcdef01234567')
  const invalid = buildLiveReport({ model: 'm', cases: [], startedAt: '2026-10-20T04:00:00.000Z', options: { gitCommit: 'not-a-commit' } })
  assert.equal(invalid.git_commit, null)
  const empty = buildLiveReport({ model: 'm', cases: [], startedAt: '2026-10-20T04:00:00.000Z', options: { gitCommit: null } })
  assert.deepEqual(empty.summary, {
    total: 0, ok: 0, fallback: 0, skipped: 0, cancelled: 0,
    coverage: 0, preservation: null, p50: null, p90: null, max: null,
  })
  assert.deepEqual(empty.options, { limit: null })
})
test('live report never copies draft text or provider error content', () => {
  const caze = golden({ id: 'privacy', raw: 'SECRET_DRAFT_TEXT', must_preserve: ['SECRET_DRAFT_TEXT'] })
  const report = buildLiveReport({
    model: 'm',
    cases: [observation(caze, {
      status: 'fallback', reason_code: 'model_request_failed', warnings: ['lost_constraint'],
      optimized: 'SECRET_DRAFT_TEXT', meta: meta(12),
    })],
    startedAt: '2026-10-20T04:00:00.000Z',
    options: { gitCommit: null },
  })
  const serialized = JSON.stringify(report)
  assert.ok(!serialized.includes('SECRET_DRAFT_TEXT'))
  assert.ok(!serialized.includes('provider_error'))
  assert.equal(report.cases[0].chars, [...'SECRET_DRAFT_TEXT'].length)
})
