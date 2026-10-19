import type { Session } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-api-session-controller/types'
import { z } from 'zod'

const selectionSchema = z.object({ provider: z.string().min(1), model: z.string().min(1), reasoningEffort: z.string().optional() })
export type ModelRoute = z.infer<typeof selectionSchema>

/** Preserve the session controller's pending selection until a matching request header consumes it. */
export function sessionRoute(session: Session): ModelRoute | undefined {
  let pending: ModelRoute | undefined
  let lastUsed: ModelRoute | undefined
  for (const event of session.snapshotEvents()) {
    if (event.type === 'model/selection') {
      const parsed = selectionSchema.safeParse(event.data)
      if (parsed.success) pending = parsed.data
    } else if (event.type === 'request/header') {
      const parsed = selectionSchema.safeParse(event.data.header.config)
      if (parsed.success) {
        lastUsed = parsed.data
        if (pending?.provider === lastUsed.provider && pending.model === lastUsed.model && pending.reasoningEffort === lastUsed.reasoningEffort) pending = undefined
      }
    }
  }
  return pending ?? lastUsed
}
