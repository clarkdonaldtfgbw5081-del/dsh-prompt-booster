import { useEffect, useRef, useState } from 'react'
import { requestSchema, resultSchema, type BoostEvent, type BoostRequest, type BoostResult } from '../types.ts'
import { validateCandidate } from '../guards/validate.ts'
import { DraftHistory, type DraftSnapshot } from './draft.ts'
import { formatNotice, noticeTitle, copyFor, type Notice } from './copy.ts'
import { styles } from './styles.ts'
import { OptimizeGlyph } from './OptimizeGlyph.tsx'

export interface BoosterProps {
  draft: DraftSnapshot
  readDraft(): DraftSnapshot
  replaceDraft(revision: number, text: string): boolean
  generate(request: BoostRequest, signal: AbortSignal): Promise<BoostResult>
  focusDraft?(): void
  /** Evaluation events; failures here must never interrupt editing. */
  onEvent?: (event: BoostEvent) => void
}

/** Some embedded/older hosts lack crypto.randomUUID; a local id keeps the request usable. */
function newRequestId(): string {
  try {
    return globalThis.crypto.randomUUID()
  } catch {
    return `pb-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
  }
}

/** One click optimizes and replaces the unchanged draft without opening a panel. */
export function Booster(props: BoosterProps) {
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [composing, setComposing] = useState(false)
  const compositionActive = useRef(false)
  const operation = useRef<{ id: number; controller: AbortController }>()
  const sequence = useRef(0)
  const history = useRef(new DraftHistory())
  const lastAppliedRequest = useRef<string>()
  const copy = copyFor(props.draft.text)
  const noticeText = notice ? formatNotice(copy, notice) : ''
  const emitEvent = (event: BoostEvent): void => { try { props.onEvent?.(event) } catch { /* Metrics cannot interrupt editing. */ } }
  useEffect(() => () => { operation.current?.controller.abort(); operation.current = undefined }, [])
  useEffect(() => {
    if (typeof document === 'undefined') return
    const start = (event: CompositionEvent) => {
      const target = event.target
      if (!(target instanceof HTMLElement) || !target.closest('textarea,input,[contenteditable="true"]')) return
      compositionActive.current = true; setComposing(true)
    }
    const end = () => {
      compositionActive.current = false; setComposing(false)
      setNotice(current => current?.key === 'composing' ? null : current)
    }
    document.addEventListener('compositionstart', start, true)
    document.addEventListener('compositionend', end, true)
    return () => {
      document.removeEventListener('compositionstart', start, true)
      document.removeEventListener('compositionend', end, true)
    }
  }, [])
  useEffect(() => {
    if (!notice || busy) return
    const timer = setTimeout(() => setNotice(null), 5000)
    return () => clearTimeout(timer)
  }, [notice, busy])

  function cancel() {
    operation.current?.controller.abort()
    operation.current = undefined
    setBusy(false); setNotice({ key: 'cancelled' })
  }
  async function optimize() {
    if (operation.current) return
    if (compositionActive.current) { setNotice({ key: 'composing' }); return }
    const draft = props.readDraft()
    if (draft.locked || draft.hasReferences) {
      setNotice({ key: draft.hasReferences ? 'references' : 'locked' })
      return
    }
    const payload: BoostRequest = {
      request_id: newRequestId(), draft_revision: draft.revision, raw: draft.text,
      mode: 'standard', language: /[\u3400-\u9fff]/.test(draft.text) ? 'zh' : 'en', context_sources: [],
    }
    if (!requestSchema.safeParse(payload).success) { setNotice({ key: 'tooLong' }); return }
    const controller = new AbortController(), id = ++sequence.current
    operation.current = { controller, id }
    setNotice(null); setBusy(true)
    try {
      const value = resultSchema.parse(await props.generate(payload, controller.signal))
      if (operation.current?.id !== id || controller.signal.aborted) return
      if (value.request_id !== payload.request_id || value.draft_revision !== payload.draft_revision || value.raw !== payload.raw || value.mode !== payload.mode) throw new Error('mismatched_result')
      if (compositionActive.current) { setNotice({ key: 'composing' }); return }
      if (value.status !== 'ok') {
        setNotice({ key: 'reason', code: value.reason_code ?? '', warnings: value.warnings })
        return
      }
      // No optional suggestions are selected implicitly, even in direct mode. The host
      // already verified sources/defaults, so tolerate bookkeeping entries whose text
      // was paraphrased out of the body (see ValidationOptions.allowUnusedAdditions).
      const validation = validateCandidate({ ...payload, context_sources: value.sources, preferences: value.preferences ?? payload.preferences }, value, [], { allowUnusedAdditions: true })
      if (validation.length) { setNotice({ key: 'reason', code: 'guard_failed', warnings: validation }); return }
      const applied = history.current.apply({ read: props.readDraft, replace: props.replaceDraft }, draft, value.optimized)
      emitEvent({ name: 'boost_applied', request_id: payload.request_id, ok: applied })
      if (!applied) { setNotice({ key: 'changed' }); return }
      lastAppliedRequest.current = payload.request_id
      try { props.focusDraft?.() } catch { /* Focus cannot invalidate an applied draft. */ }
      setNotice({ key: 'applied', count: value.sources.length })
    } catch {
      if (operation.current?.id === id && !controller.signal.aborted) setNotice({ key: 'failed' })
    } finally {
      if (operation.current?.id === id) { operation.current = undefined; setBusy(false) }
    }
  }
  function undo() {
    if (compositionActive.current) { setNotice({ key: 'composing' }); return }
    let restored = false
    try { restored = history.current.undo({ read: props.readDraft, replace: props.replaceDraft }) }
    catch { restored = false }
    emitEvent({ name: 'boost_undone', request_id: lastAppliedRequest.current, ok: restored })
    if (restored) lastAppliedRequest.current = undefined
    if (restored) { try { props.focusDraft?.() } catch { /* Restoration already succeeded. */ } }
    setNotice({ key: restored ? 'restored' : 'undoBlocked' })
  }

  return <span className="pb pb-inline" aria-busy={busy}>
    <style>{styles}</style>
    <button type="button" className={`pb-icon pb-main${busy ? ' pb-working' : ''}`} aria-label={busy ? copy.labels.cancel : copy.labels.optimize}
      title={busy ? copy.labels.busyTitle : composing ? copy.notices.composing : props.draft.hasReferences ? copy.labels.referencesHint : copy.labels.optimizeHint}
      onMouseDown={event => event.preventDefault()}
      onClick={busy ? cancel : optimize} disabled={!busy && (composing || props.draft.locked || props.draft.hasReferences || !props.draft.text.trim())}>
      <OptimizeGlyph busy={busy} />
    </button>
    {history.current.canUndo(props.draft) && <button type="button" className="pb-icon" aria-label={copy.labels.undo} title={copy.labels.undoTitle} onClick={undo} disabled={busy || composing}>↶</button>}
    <span className="pb-note pb-status" role="status" aria-live="polite" aria-atomic="true" title={busy ? copy.labels.statusBusyTitle : notice ? noticeTitle(copy, notice) : ''}>{busy ? copy.labels.busy : noticeText}</span>
  </span>
}
