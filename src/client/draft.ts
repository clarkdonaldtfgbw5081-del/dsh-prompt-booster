import { canOptimizeDraft, referenceKey, type DraftReference } from './references.ts'

export interface DraftSnapshot {
  text: string
  revision: number
  locked: boolean
  hasReferences: boolean
  references?: readonly DraftReference[]
}
export interface DraftPort {
  read(): DraftSnapshot
  replace(expectedRevision: number, text: string): boolean
}

/** One-level undo with revision checks. Editing or sending invalidates destructive restoration. */
export class DraftHistory {
  private saved?: { original: string; applied: string; revision: number; references: string }
  apply(port: DraftPort, snapshot: DraftSnapshot, text: string): boolean {
    const now = port.read()
    if (!canOptimizeDraft(now) || !canOptimizeDraft(snapshot) || referenceKey(now) !== referenceKey(snapshot)
      || now.revision !== snapshot.revision || now.text !== snapshot.text) return false
    const original = this.canUndo(snapshot) ? this.saved!.original : snapshot.text
    if (!port.replace(snapshot.revision, text)) return false
    // Editors may silently sanitize the text we wrote (trim, whitespace, chips), so read
    // back what actually landed; undo must be checked against the composer, not the request.
    let applied = text, revision = snapshot.revision, references = referenceKey(snapshot)
    try {
      const after = port.read()
      applied = after.text; revision = after.revision; references = referenceKey(after)
    } catch { /* A failed read-back only disables undo; the write already happened. */ }
    this.saved = { original, applied, revision, references }
    return true
  }
  canUndo(now: DraftSnapshot): boolean {
    return !!this.saved && canOptimizeDraft(now) && referenceKey(now) === this.saved.references
      && now.revision === this.saved.revision && now.text === this.saved.applied
  }
  undo(port: DraftPort): boolean {
    const saved = this.saved
    if (!saved) return false
    try {
      if (!this.canUndo(port.read()) || !port.replace(saved.revision, saved.original)) return false
    } catch { return false }
    this.saved = undefined
    return true
  }
}
