import type { BoostEvent, FeedbackRequest } from '../types.ts'

/** Correlates actual admitted messages with applied drafts, retaining hashes and metadata only. */
export class FeedbackTracker {
  private readonly requests = new Map<string, { session: string; floor: number; sent: boolean }>()
  private readonly pending = new Map<string, { request: string; hash: string; floor: number }>()
  private readonly admissions: { session: string; hash: string; sequence: number }[] = []
  private sequence = 0
  constructor(private readonly record: (event: BoostEvent) => void, private readonly limit = 200) {}
  remember(session: string, request: string): void {
    this.requests.set(request, { session, floor: this.sequence, sent: false })
    while (this.requests.size > this.limit) {
      const oldest = this.requests.keys().next().value!
      const session = this.requests.get(oldest)!.session
      this.requests.delete(oldest)
      if (this.pending.get(session)?.request === oldest) this.pending.delete(session)
    }
  }
  accept(input: FeedbackRequest): boolean {
    const { session_id: session, event } = input
    const known = this.requests.get(event.request_id)
    if (!known || known.session !== session) return false
    this.record({ name: event.name, request_id: event.request_id, ...(event.ok === undefined ? {} : { ok: event.ok }) })
    if (event.name === 'boost_undone' && event.ok && this.pending.get(session)?.request === event.request_id) this.pending.delete(session)
    if (event.name === 'boost_applied' && event.ok && !known.sent) {
      this.pending.delete(session)
      if (event.content_hash) {
        const pending = { request: event.request_id, hash: event.content_hash, floor: known.floor }
        this.pending.set(session, pending)
        // A quick Send can reach the host before the browser finishes hashing its feedback.
        if (this.admissions.some(a => a.session === session && a.hash === pending.hash && a.sequence > pending.floor)) this.sent(session)
      }
    }
    return true
  }
  admitted(session: string, hash: string): void {
    const sequence = ++this.sequence
    this.admissions.push({ session, hash, sequence })
    if (this.admissions.length > this.limit) this.admissions.shift()
    const pending = this.pending.get(session)
    if (pending?.hash === hash && sequence > pending.floor) this.sent(session)
  }
  private sent(session: string): void {
    const pending = this.pending.get(session)
    if (!pending) return
    this.pending.delete(session)
    const request = this.requests.get(pending.request)
    if (!request || request.sent) return
    request.sent = true
    this.record({ name: 'prompt_sent', request_id: pending.request })
  }
}
