import { test } from 'node:test'
import assert from 'node:assert/strict'
import { canOptimizeDraft, planDraftEdit, referenceKey, type DraftReference } from '../src/client/references.ts'
import { DraftHistory, type DraftSnapshot } from '../src/client/draft.ts'
import { BoostEngine } from '../src/core/engine.ts'
import { requestSchema } from '../src/types.ts'

const reference = (offset: number, id = 1): DraftReference => ({ occurrenceId: id, source: 'files', ref: 'guide', offset, length: 6, clipboardText: '@guide', label: 'guide' })
const snapshot = (): DraftSnapshot => ({ text: '@guide 写一份周报', revision: 1, locked: false, hasReferences: true, references: [reference(0)] })
test('safe edits convert clipboard offsets into atomic-chip coordinates without replacing the chip', () => {
  const before = snapshot()
  assert.equal(canOptimizeDraft(before), true)
  const plan = planDraftEdit(before, '@guide 请写一份周报')!
  assert.deepEqual(plan, { start: 2, end: 2, text: '请' })
  assert.equal(planDraftEdit({ ...before, references: undefined }, before.text), undefined)
  assert.equal(planDraftEdit({ ...before, references: [{ ...reference(0), invalid: true }] }, before.text), undefined)
  assert.equal(planDraftEdit({ ...before, references: [reference(1)] }, before.text), undefined)
})
test('edits crossing, moving or duplicating references are refused', () => {
  const before = snapshot()
  assert.equal(planDraftEdit(before, '请按 @guide 写一份周报，保持简洁'), undefined)
  assert.equal(planDraftEdit(before, '写一份周报 @guide'), undefined)
  assert.equal(planDraftEdit(before, '@guide @guide 写一份周报'), undefined)
  const repeated = { ...before, text: '@guide @guide 周报', references: [reference(0), reference(7, 2)] }
  assert.equal(canOptimizeDraft(repeated), true)
  assert.equal(planDraftEdit(repeated, '@guide @guide 请写周报')?.start, 4)
})
test('history keeps reference identities and refuses undo after a same-text identity change', () => {
  let current = snapshot()
  const port = { read: () => current, replace(revision: number, text: string) {
    if (revision !== current.revision || !planDraftEdit(current, text)) return false
    current = { ...current, text, revision: revision + 1 }; return true
  } }
  const history = new DraftHistory()
  assert.equal(history.apply(port, current, '@guide 请写一份周报'), true)
  assert.equal(history.canUndo(current), true)
  assert.equal(history.undo(port), true)
  assert.equal(current.text, snapshot().text)
  history.apply(port, current, '@guide 请写一份周报')
  const previous = referenceKey(current)
  current = { ...current, references: [{ ...reference(0), ref: 'another-guide' }] }
  assert.notEqual(referenceKey(current), previous)
  assert.equal(history.undo(port), false)
})
test('reference occurrence count cannot be removed or duplicated by the model', async () => {
  const request = requestSchema.parse({ request_id: 'reference', draft_revision: 1, raw: '@guide 写一份周报', reference_fragments: ['@guide'] })
  for (const optimized of ['请写一份周报', '@guide @guide 写一份周报']) {
    const result = await new BoostEngine({ name: 'fixture', async generate() { return JSON.stringify({ optimized }) } }).boost(request)
    assert.equal(result.status, 'fallback')
    assert.ok(result.warnings.includes('lost_reference'))
  }
})
