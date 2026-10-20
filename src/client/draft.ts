export interface DraftSnapshot {
  text: string
  revision: number
  locked: boolean
  hasReferences: boolean
}
export interface DraftPort {
  read(): DraftSnapshot
  replace(expectedRevision: number, text: string): boolean
}

/** One-level undo with revision checks. Editing or sending invalidates destructive restoration. */
export class DraftHistory {
  private saved?: { original: string; applied: string; revision: number }
  apply(port: DraftPort, snapshot: DraftSnapshot, text: string): boolean {
    const now = port.read()
    if (now.locked || now.hasReferences || snapshot.hasReferences || now.revision !== snapshot.revision || now.text !== snapshot.text) return false
    if (!port.replace(snapshot.revision, text)) return false
    // Editors may silently sanitize the text we wrote (trim, whitespace, chips), so read
    // back what actually landed; undo must be checked against the composer, not the request.
    let applied = text, revision = snapshot.revision
    try {
      const after = port.read()
      applied = after.text; revision = after.revision
    } catch { /* A failed read-back only disables undo; the write already happened. */ }
    this.saved = { original: snapshot.text, applied, revision }
    return true
  }
  canUndo(now: DraftSnapshot): boolean {
    return !!this.saved && !now.locked && !now.hasReferences && now.revision === this.saved.revision && now.text === this.saved.applied
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
