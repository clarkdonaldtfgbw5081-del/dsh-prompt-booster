import type { DraftSnapshot } from './draft.ts'

/** Public InputState occurrence projection; runtime identities never go to the model. */
export interface DraftReference {
  occurrenceId: number
  source: string
  ref: string
  offset: number
  length: number
  clipboardText: string
  label: string
  appearance?: 'session' | 'file' | 'folder'
  invalid?: boolean
}

export function referenceKey(snapshot: DraftSnapshot): string {
  return JSON.stringify((snapshot.references ?? []).map(row => [row.occurrenceId, row.source, row.ref, row.offset, row.length, row.clipboardText, row.label, row.appearance, row.invalid]))
}

export function canOptimizeDraft(snapshot: DraftSnapshot): boolean {
  if (snapshot.locked) return false
  const refs = snapshot.references ?? []
  if (!snapshot.hasReferences) return refs.length === 0
  if (!refs.length || refs.length > 32 || new Set(refs.map(row => row.occurrenceId)).size !== refs.length) return false
  let end = 0
  return refs.every(row => {
    const valid = Number.isSafeInteger(row.occurrenceId) && Number.isSafeInteger(row.offset) && Number.isSafeInteger(row.length)
      && row.offset >= end && row.length > 0 && row.length <= 2000 && !row.invalid
      && typeof row.source === 'string' && !!row.source && typeof row.ref === 'string' && !!row.ref
      && row.length === row.clipboardText?.length && snapshot.text.slice(row.offset, row.offset + row.length) === row.clipboardText
    end = row.offset + row.length
    return valid
  })
}

/** One public insertText transaction. Its coordinates count each chip as one atomic character. */
export function planDraftEdit(snapshot: DraftSnapshot, next: string): { start: number; end: number; text: string } | undefined {
  if (!canOptimizeDraft(snapshot)) return
  if (!snapshot.hasReferences) return { start: 0, end: snapshot.text.length, text: next }
  const before = snapshot.text
  let start = 0
  while (start < before.length && start < next.length && before[start] === next[start]) start++
  // A replacement must not divide a UTF-16 surrogate pair.
  if (start > 0 && /[\uD800-\uDBFF]/.test(before[start - 1])) start--
  let end = before.length, nextEnd = next.length
  while (end > start && nextEnd > start && before[end - 1] === next[nextEnd - 1]) { end--; nextEnd-- }
  if (/[\uDC00-\uDFFF]/.test(before[end] ?? '')) { end++; nextEnd++ }
  const refs = snapshot.references!
  if (refs.some(row => next.split(row.clipboardText).length !== before.split(row.clipboardText).length)) return
  if (refs.some(row => start < row.offset + row.length && end > row.offset
    || start === end && start > row.offset && start < row.offset + row.length)) return
  const detect = (offset: number) => offset - refs.filter(row => row.offset + row.length <= offset).reduce((sum, row) => sum + row.length - 1, 0)
  return { start: detect(start), end: detect(end), text: next.slice(start, nextEnd) }
}
