import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type { PropsRuntime, InjectFace } from '@deepseek-ai/dsh-client-ui-slots'
import { remoteInfo } from '../adapters/wire.ts'
import type { BoostEvent, BoostRequest, BoostResult } from '../types.ts'
import { Booster } from './Booster.tsx'
import { createEventLog } from './events.ts'
import { planDraftEdit, type DraftReference } from './references.ts'
import { generateWithCompatibility } from './transport.ts'

interface Injected {
  sessionId: string
  generate(request: BoostRequest, signal: AbortSignal): Promise<BoostResult>
  readDraft(): { text: string; revision: number; locked: boolean; hasReferences: boolean; references?: readonly DraftReference[] }
  focusDraft(): void
  trackEvent(event: BoostEvent): void
}
type Props = PropsRuntime<'conversation.input.left'> & InjectFace<Injected>
/** Named export so the real slot wiring can be rendered directly by tests. */
export function ComposerBooster(props: Props) {
  const input = props.useInput(state => state)
  return <Booster
    key={props.sessionId}
    draft={{ text: input.draft, revision: input.draftRev, locked: input.phase !== 'plain', hasReferences: input.occurrences.length > 0, references: input.occurrences }}
    readDraft={props.readDraft}
    replaceDraft={(revision, text) => {
      const now = props.readDraft()
      if (now.revision !== revision) return false
      const edit = planDraftEdit(now, text)
      if (!edit) return false
      let replaced: boolean
      try {
        replaced = props.inputActions.insertText(edit.text, { start: edit.start, end: edit.end, draftRev: revision })
      } catch {
        // An editor write failure is a draft conflict, not an applied result.
        return false
      }
      if (replaced) {
        try {
          props.inputActions.persistDraft()
        } catch {
          // The text is already in the editor; a persistence fault must not report a failed write.
        }
      }
      return replaced
    }}
    generate={props.generate}
    focusDraft={props.focusDraft}
    onEvent={props.trackEvent}
  />
}

export const inject = ['slots', 'remote', 'sessions', 'conversation']
export async function apply(ctx: Context): Promise<void> {
  const clientEventLog = createEventLog()
  const unmount = await ctx.remote.$mount(remoteInfo)
  ctx.effect(() => unmount, 'prompt-booster: remote assembly')
  // This namespace is provided by $mount above, so it cannot be a startup
  // dependency of the parent. Bind every UI callback to the injected child.
  ctx.inject(['slots', 'remote', 'remote.promptBooster', 'sessions', 'conversation'], scope => {
    scope.slots.inject('conversation.input.left', () => scope.slots.register({
      name: 'conversation.input.left', id: 'prompt-booster', order: 50,
      inject: (sessionId): Injected => {
        let feedbackQueue = Promise.resolve()
        function readDraft() {
          const binding = scope.sessions.binding(sessionId)
          if (!binding) return { text: '', revision: -1, locked: true, hasReferences: false }
          const input = scope.conversation.input.for(binding.ctx).state.getSnapshot()
          return { text: input.draft, revision: input.draftRev, locked: input.phase !== 'plain', hasReferences: input.occurrences.length > 0,
            references: input.occurrences.map(row => ({ ...row })) }
        }
        return {
          sessionId,
          readDraft,
          focusDraft() {
            const binding = scope.sessions.binding(sessionId)
            if (binding) scope.conversation.input.for(binding.ctx).focus()
          },
          trackEvent(event) {
            clientEventLog.record(event)
            if (!event.request_id || !['boost_applied', 'boost_edited', 'boost_undone'].includes(event.name)) return
            const text = event.name === 'boost_applied' && event.ok ? readDraft().text : undefined
            // Capture synchronously, then serialize hashing and feedback to preserve Apply/Undo ordering.
            feedbackQueue = feedbackQueue.then(async () => {
              let content_hash: string | undefined
              if (text !== undefined && globalThis.crypto?.subtle) {
                const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
                content_hash = [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, '0')).join('')
              }
              await scope.remote.promptBooster.feedback({ session_id: sessionId, event: {
                name: event.name as 'boost_applied' | 'boost_edited' | 'boost_undone', request_id: event.request_id!,
                ...(event.ok === undefined ? {} : { ok: event.ok }), ...(content_hash ? { content_hash } : {}),
              } })
            }).catch(() => { /* Feedback failures cannot affect the draft. */ })
          },
          async generate(request, signal) {
            return generateWithCompatibility(scope.remote.promptBooster, sessionId, request, signal)
          },
        }
      },
    }, ComposerBooster))
  })
}
