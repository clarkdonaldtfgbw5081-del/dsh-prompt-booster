import { test } from 'node:test'
import assert from 'node:assert/strict'
import { FeedbackTracker } from '../src/core/feedback.ts'
import { createEventLog } from '../src/client/events.ts'
import type { BoostEvent } from '../src/types.ts'

test('real admissions correlate with applied content, not manual clearing', () => {
  const events: BoostEvent[] = [], tracker = new FeedbackTracker(e => events.push(e))
  tracker.remember('s', 'r')
  tracker.accept({ session_id: 's', event: { name: 'boost_applied', request_id: 'r', ok: true, content_hash: 'hash' } })
  assert.equal(events.filter(e => e.name === 'prompt_sent').length, 0)
  tracker.admitted('s', 'other'); tracker.admitted('another-session', 'hash')
  assert.equal(events.filter(e => e.name === 'prompt_sent').length, 0)
  tracker.admitted('s', 'hash'); tracker.admitted('s', 'hash')
  assert.equal(events.filter(e => e.name === 'prompt_sent').length, 1)
})
test('fast sends are recognized even when feedback arrives later', () => {
  const events: BoostEvent[] = [], tracker = new FeedbackTracker(e => events.push(e))
  tracker.remember('s', 'r'); tracker.admitted('s', 'hash')
  tracker.accept({ session_id: 's', event: { name: 'boost_applied', request_id: 'r', ok: true, content_hash: 'hash' } })
  assert.equal(events.at(-1)?.name, 'prompt_sent')
})
test('undo and unrelated history cannot count as a sent optimization', () => {
  const events: BoostEvent[] = [], tracker = new FeedbackTracker(e => events.push(e))
  tracker.admitted('s', 'hash'); tracker.remember('s', 'r')
  tracker.accept({ session_id: 's', event: { name: 'boost_applied', request_id: 'r', ok: true, content_hash: 'hash' } })
  tracker.accept({ session_id: 's', event: { name: 'boost_undone', request_id: 'r', ok: true } })
  tracker.admitted('s', 'hash')
  assert.equal(events.filter(e => e.name === 'prompt_sent').length, 0)
})
test('feedback cannot claim a request belonging to another session', () => {
  const tracker = new FeedbackTracker(() => {})
  tracker.remember('s', 'r')
  assert.equal(tracker.accept({ session_id: 'other', event: { name: 'boost_edited', request_id: 'r' } }), false)
})
test('bounded event snapshots are detached from caller mutations', () => {
  const log = createEventLog(1), event: BoostEvent = { name: 'boost_clicked' }
  log.record(event); event.name = 'prompt_sent'
  assert.equal(log.snapshot()[0].name, 'boost_clicked')
  log.snapshot()[0].name = 'boost_undone'
  assert.equal(log.snapshot()[0].name, 'boost_clicked')
  log.record({ name: 'boost_completed' }); assert.equal(log.snapshot().length, 1)
})
test('replayed feedback cannot double count a sent request', () => {
  const events: BoostEvent[] = [], tracker = new FeedbackTracker(e => events.push(e))
  tracker.remember('s', 'r'); tracker.admitted('s', 'hash')
  for (let i = 0; i < 2; i++) tracker.accept({ session_id: 's', event: { name: 'boost_applied', request_id: 'r', ok: true, content_hash: 'hash' } })
  assert.equal(events.filter(e => e.name === 'prompt_sent').length, 1)
})
test('evicted requests cannot retain pending send attribution', () => {
  const events: BoostEvent[] = [], tracker = new FeedbackTracker(e => events.push(e), 1)
  tracker.remember('s1', 'r1')
  tracker.accept({ session_id: 's1', event: { name: 'boost_applied', request_id: 'r1', ok: true, content_hash: 'hash' } })
  tracker.remember('s2', 'r2'); tracker.admitted('s1', 'hash')
  assert.equal(events.filter(e => e.name === 'prompt_sent').length, 0)
})
