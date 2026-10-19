import type { BoostEvent } from '../types.ts'

/** Bounded in-memory event log for the evaluation layer. Never persisted; carries no draft text. */
export interface EventLog {
  record(event: BoostEvent): void
  snapshot(): readonly BoostEvent[]
}

export function createEventLog(limit = 200): EventLog {
  if (!Number.isInteger(limit) || limit < 1) throw new Error('Invalid event log limit')
  const entries: BoostEvent[] = []
  return {
    record(event) {
      entries.push({ ...event })
      if (entries.length > limit) entries.splice(0, entries.length - limit)
    },
    snapshot() {
      return entries.map(event => ({ ...event }))
    },
  }
}
