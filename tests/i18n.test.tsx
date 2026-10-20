import { test } from 'node:test'
import assert from 'node:assert/strict'
import { create, act, type ReactTestRenderer } from 'react-test-renderer'
import { Booster, type BoosterProps } from '../src/client/Booster.tsx'
import { copyFor, formatNotice, noticeTitle } from '../src/client/copy.ts'
import { baseResult } from '../src/core/engine.ts'
import type { BoostRequest, BoostResult } from '../src/types.ts'
import type { DraftSnapshot } from '../src/client/draft.ts'

test('reason notices separate skipped drafts from unknown failure codes', () => {
  const zh = copyFor('写一份周报'), en = copyFor('Write a weekly report')
  // Bare `reason` means the host skipped optimization (e.g. optimized === raw).
  assert.equal(formatNotice(zh, { key: 'reason' }), zh.notices.noResult)
  assert.equal(formatNotice(zh, { key: 'reason', code: '' }), '本次无需替换，原稿已保留。')
  // A code this client does not know is a failed optimization, not "nothing to do".
  assert.equal(formatNotice(zh, { key: 'reason', code: 'future_code' }), zh.notices.unknownReason)
  assert.equal(formatNotice(zh, { key: 'reason', code: 'future_code' }), '本次优化未完成，原稿已保留。')
  assert.equal(formatNotice(en, { key: 'reason' }), en.notices.noResult)
  assert.equal(formatNotice(en, { key: 'reason', code: 'future_code' }), en.notices.unknownReason)
  assert.equal(formatNotice(en, { key: 'reason', code: 'future_code' }), 'Optimization did not complete. Your draft was kept.')
  // Known failure codes keep their specific copy.
  assert.match(formatNotice(zh, { key: 'reason', code: 'timeout' }), /超时/)
  assert.match(formatNotice(en, { key: 'reason', code: 'guard_failed' }), /validation/)
  // Inherited Object members must not be mistaken for a known reason code.
  assert.equal(formatNotice(en, { key: 'reason', code: 'toString' }), en.notices.unknownReason)
  assert.equal(formatNotice(zh, { key: 'reason', code: 'constructor' }), zh.notices.unknownReason)
})

test('guard notices explain allowlisted failures without exposing unknown warning text', () => {
  const zh = copyFor('写周报'), en = copyFor('Write a report')
  const warnings = ['lost_constraint', 'new_number', 'lost_constraint', 'PRIVATE_MODEL_RESPONSE', 'constructor']
  assert.equal(formatNotice(zh, { key: 'reason', code: 'guard_failed', warnings }), '改写遗漏了原稿限制，原稿已保留。')
  assert.match(noticeTitle(en, { key: 'reason', code: 'guard_failed', warnings }), /constraint;.*unsupported number/)
  assert.ok(!noticeTitle(zh, { key: 'reason', code: 'guard_failed', warnings }).includes('PRIVATE_MODEL_RESPONSE'))
  assert.equal(formatNotice(en, { key: 'reason', code: 'guard_failed', warnings: ['unknown'] }), en.reasons.guard_failed)
  assert.deepEqual(Object.keys(zh.guards).sort(), Object.keys(en.guards).sort())
  assert.equal(zh.notices.appliedWithSources(2), '已优化 · 已提供 2 份参考')
  assert.equal(en.notices.appliedWithSources(1), 'Optimized · 1 source provided')
})

test('English drafts receive English labels, busy state, result and undo copy', async () => {
  assert.equal(copyFor('').locale, 'zh')
  const copy = copyFor('Write a weekly report')
  assert.equal(copy.locale, 'en')
  assert.equal(copy.labels.optimize, 'Optimize prompt')
  assert.match(formatNotice(copy, { key: 'reason', code: 'timeout' }), /timed out/i)

  let draft: DraftSnapshot = { text: 'Write a weekly report', revision: 0, locked: false, hasReferences: false }
  let pending!: { request: BoostRequest; resolve(value: BoostResult): void }
  let renderer!: ReactTestRenderer
  const props = (): BoosterProps => ({
    draft, readDraft: () => draft,
    replaceDraft(revision, text) { if (revision !== draft.revision) return false; draft = { ...draft, text, revision: revision + 1 }; return true },
    generate(request) { return new Promise(resolve => { pending = { request, resolve } }) },
  })
  const refresh = () => act(() => renderer.update(<Booster {...props()} />))
  const button = (label: string) => renderer.root.findAllByType('button').find(node => node.props['aria-label'] === label)!
  act(() => { renderer = create(<Booster {...props()} />) })
  try {
    assert.equal(button('Optimize prompt').props.disabled, false)
    act(() => { button('Optimize prompt').props.onClick() })
    assert.equal(button('Cancel optimization').props['aria-label'], 'Cancel optimization')
    const busy = renderer.root.findAll(node => node.props.role === 'status')[0]
    assert.equal(busy.children.join(''), 'Optimizing…')
    await act(async () => {
      pending.resolve({ ...baseResult(pending.request, 'fixture'), status: 'ok', optimized: 'Write a weekly report with clear sections.' })
      await Promise.resolve()
    })
    refresh()
    assert.match(draft.text, /clear sections/)
    const status = renderer.root.findAll(node => node.props.role === 'status')[0]
    assert.equal(status.children.join(''), 'Optimized')
    assert.equal(status.props.title, 'Optimized')
    act(() => { button('Restore original draft').props.onClick() })
    refresh()
    assert.equal(draft.text, 'Write a weekly report')
    assert.equal(renderer.root.findAll(node => node.props.role === 'status')[0].children.join(''), 'Original draft restored')
    const labels = renderer.root.findAllByType('button').map(node => node.props['aria-label'])
    assert.ok(labels.every(label => !/[\u3400-\u9fff]/.test(label)))
  } finally {
    act(() => renderer.unmount())
  }
})
