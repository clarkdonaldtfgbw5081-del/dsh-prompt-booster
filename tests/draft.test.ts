import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DraftHistory, type DraftPort, type DraftSnapshot } from '../src/client/draft.ts'
import { diffText } from '../src/client/diff.ts'

function port() {
  let draft: DraftSnapshot = { text: '原稿', revision: 0, locked: false, hasReferences: false }
  return {
    read: () => draft,
    replace(revision: number, text: string) { if (draft.revision !== revision || draft.locked) return false; draft = { ...draft, text, revision: revision + 1 }; return true },
    edit(next: Partial<DraftSnapshot>) { draft = { ...draft, ...next, revision: draft.revision + 1 } },
  } satisfies DraftPort & { edit(next: Partial<DraftSnapshot>): void }
}
test('apply and guarded undo restore the original', () => {
  const draft = port(), history = new DraftHistory()
  assert.equal(history.apply(draft, draft.read(), '优化稿'), true)
  assert.equal(draft.read().text, '优化稿'); assert.equal(history.canUndo(draft.read()), true)
  assert.equal(history.undo(draft), true); assert.equal(draft.read().text, '原稿')
})
test('late result cannot replace a newer draft, even if its text is later restored', () => {
  const draft = port(), history = new DraftHistory(), snapshot = draft.read()
  draft.edit({ text: '新稿' }); draft.edit({ text: '原稿' })
  assert.equal(history.apply(draft, snapshot, '旧请求结果'), false)
})
test('undo cannot erase edits made after applying', () => {
  const draft = port(), history = new DraftHistory()
  history.apply(draft, draft.read(), '优化稿'); draft.edit({ text: '用户继续编辑' })
  assert.equal(history.undo(draft), false); assert.equal(draft.read().text, '用户继续编辑')
})
test('reference chips and submission locks are preserved', () => {
  for (const blocked of [{ locked: true }, { hasReferences: true }]) {
    const draft = port(); draft.edit(blocked)
    assert.equal(new DraftHistory().apply(draft, draft.read(), '新稿'), false)
  }
})
test('apply records the editor-sanitized text so a silent cleanup can still be undone', () => {
  let draft: DraftSnapshot = { text: '原稿', revision: 0, locked: false, hasReferences: false }
  const cleaning: DraftPort = {
    read: () => draft,
    replace(revision, text) {
      if (draft.revision !== revision || draft.locked) return false
      // The composer trims and collapses whitespace instead of storing the exact request.
      draft = { ...draft, text: text.replace(/\s+/g, ' ').trim(), revision: revision + 1 }
      return true
    },
  }
  const history = new DraftHistory()
  assert.equal(history.apply(cleaning, cleaning.read(), '  优化   稿  '), true)
  assert.equal(cleaning.read().text, '优化 稿')
  // Undo must be checked against what the editor actually stored, not the requested text.
  assert.equal(history.canUndo(cleaning.read()), true)
  assert.equal(history.undo(cleaning), true)
  assert.equal(cleaning.read().text, '原稿')
  assert.equal(history.undo(cleaning), false)
})
test('a throwing editor write propagates from apply so the UI reports failure', () => {
  const history = new DraftHistory(), draft = port(), snapshot = draft.read()
  const refusing: DraftPort = { read: draft.read, replace() { throw new Error('editor unavailable') } }
  assert.throws(() => history.apply(refusing, snapshot, '优化稿'), /editor unavailable/)
  assert.equal(draft.read().text, '原稿')
})
test('undo reports failure instead of escaping when the editor throws', () => {
  const applying = port(), history = new DraftHistory()
  assert.equal(history.apply(applying, applying.read(), '优化稿'), true)
  assert.equal(history.undo({ read: applying.read, replace() { throw new Error('editor unavailable') } }), false)
  assert.equal(applying.read().text, '优化稿')
})
test('diff reconstructs both versions with Unicode and long documents', () => {
  for (const [before, after] of [['原稿🙂', '新原稿🙂！'], ['', '新增'], ['删除', ''], ['甲'.repeat(1600), '乙'.repeat(1600)]]) {
    const parts = diffText(before, after)
    assert.equal(parts.filter(p => p.kind !== 'add').map(p => p.text).join(''), before)
    assert.equal(parts.filter(p => p.kind !== 'remove').map(p => p.text).join(''), after)
  }
})
