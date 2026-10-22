import type { RpcRequest } from '../adapters/wire.ts'
import { capabilitiesSchema, type CapabilitiesInput, type BoostRequest, type BoostResult } from '../types.ts'

type FailureCode = 'host_update_required' | 'host_connection_failed' | 'host_check_timeout' | 'client_result_invalid'
export class ClientFailure extends Error {
  constructor(readonly code: FailureCode) { super(code) }
}

interface Remote {
  capabilities(input: CapabilitiesInput): Promise<{ ok: true; value: unknown } | { ok: false; error: unknown }>
  boost(input: RpcRequest): AsyncIterable<BoostResult> & { dispose(): void }
}

function errorCode(error: unknown): string | undefined {
  return error && typeof error === 'object' && 'code' in error && typeof error.code === 'string' ? error.code : undefined
}

function transportFailure(error: unknown): ClientFailure {
  if (error instanceof ClientFailure) return error
  const code = errorCode(error)
  return new ClientFailure(code === 'gateway/input-invalid' || code === 'gateway/protocol' ? 'host_update_required'
    : code === 'gateway/result-invalid' ? 'client_result_invalid' : 'host_connection_failed')
}

/** Bound metadata calls and release abort listeners even if the carrier never settles. */
function checkWithin<T>(check: () => Promise<T>, signal: AbortSignal, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    signal.throwIfAborted()
    const abort = () => { cleanup(); reject(signal.reason) }
    const timer = setTimeout(() => { cleanup(); reject(new ClientFailure('host_check_timeout')) }, timeoutMs)
    const cleanup = () => { clearTimeout(timer); signal.removeEventListener('abort', abort) }
    signal.addEventListener('abort', abort, { once: true })
    Promise.resolve().then(() => { signal.throwIfAborted(); return check() }).then(value => { cleanup(); resolve(value) }, error => { cleanup(); reject(error) })
  })
}

/** Negotiate each click so a reloaded host cannot leave cached feature flags stale.
 * No draft enters the handshake; only an explicitly missing method permits legacy mode.
 */
export async function generateWithCompatibility(remote: Remote, sessionId: string, request: BoostRequest, signal: AbortSignal, checkTimeoutMs = 5000): Promise<BoostResult> {
  signal.throwIfAborted()
  try {
    let capabilities
    try {
      const result = await checkWithin(() => remote.capabilities({ session_id: sessionId }), signal, checkTimeoutMs)
      if (!result.ok) throw result.error
      const parsed = capabilitiesSchema.safeParse(result.value)
      if (!parsed.success) throw new ClientFailure('host_update_required')
      capabilities = parsed.data
    } catch (error) {
      signal.throwIfAborted()
      if (errorCode(error) !== 'gateway/invocation-unavailable') throw error
      capabilities = { protocol: 1 as const, configured_mode: false, reference_fragments: false }
    }
    signal.throwIfAborted()
    // Older hosts cannot validate reference identity: never silently drop that protection.
    if (request.reference_fragments?.length && !capabilities.reference_fragments) throw new ClientFailure('host_update_required')
    const adapted = { ...request }
    if (!capabilities.configured_mode) delete adapted.use_configured_mode
    if (!capabilities.reference_fragments) delete adapted.reference_fragments
    const stream = remote.boost({ session_id: sessionId, request: adapted })
    const abort = () => stream.dispose()
    signal.addEventListener('abort', abort, { once: true })
    try {
      signal.throwIfAborted()
      for await (const result of stream) {
        signal.throwIfAborted()
        if (!capabilities.configured_mode && result.mode !== request.mode) throw new ClientFailure('client_result_invalid')
        return !capabilities.configured_mode ? { ...result, warnings: [...result.warnings, 'host_legacy_compat'] } : result
      }
      throw new ClientFailure('client_result_invalid')
    } finally { signal.removeEventListener('abort', abort); stream.dispose() }
  } catch (error) {
    signal.throwIfAborted()
    throw transportFailure(error)
  }
}
