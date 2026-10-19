import { test } from 'node:test'
import assert from 'node:assert/strict'
import { create, act, type ReactTestRenderer } from 'react-test-renderer'
import { Booster, type BoosterProps } from '../src/client/Booster.tsx'
import { copyFor, formatNotice } from '../src/client/copy.ts'
import { baseResult } from '../src/core/engine.ts'
import type { BoostRequest, BoostResult } from '../src/types.ts'
import type { DraftSnapshot } from '../src/client/draft.ts'

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
