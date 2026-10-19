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
    const after = port.read()
    this.saved = { original: snapshot.text, applied: text, revision: after.revision }
    return true
  }
  canUndo(now: DraftSnapshot): boolean {
    return !!this.saved && !now.locked && !now.hasReferences && now.revision === this.saved.revision && now.text === this.saved.applied
  }
  undo(port: DraftPort): boolean {
    const saved = this.saved
    if (!saved || !this.canUndo(port.read()) || !port.replace(saved.revision, saved.original)) return false
    this.saved = undefined
    return true
  }
}
