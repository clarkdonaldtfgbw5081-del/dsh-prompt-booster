import { test } from 'node:test'
import assert from 'node:assert/strict'
import { liveIssues, percentile, readOptions } from '../evals/metrics.ts'
import { baseResult } from '../src/core/engine.ts'
import { requestSchema } from '../src/types.ts'

test('live evaluation cannot pass on failures or cancelled requests', () => {
  const result = baseResult(requestSchema.parse({ raw: '写周报', request_id: 'r', draft_revision: 0 }), 'fixture')
  assert.equal(liveIssues({ id: 'e', group: 'writing', raw: '写周报' }, result).length, 1)
  result.status = 'cancelled'
  assert.equal(liveIssues({ id: 'e', group: 'writing', raw: '写周报' }, result).length, 1)
})
test('small-sample high percentiles include the slowest tail', () => {
  assert.equal(percentile([10, 1000], 0.9), 1000)
  assert.equal(percentile([], 0.9), undefined)
})
test('evaluation rejects invalid or misspelled cost controls', () => {
  for (const args of [['--live', '--limit'], ['--live', '--limit', '-1'], ['--live', '--limit', '0'], ['--live', '--limit', '2.5'], ['--limt', '2']]) assert.throws(() => readOptions(args))
  assert.deepEqual(readOptions(['--live', '--limit', '2']), { live: true, limit: 2 })
})
