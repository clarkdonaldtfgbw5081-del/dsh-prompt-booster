export type FailureCode = 'model_request_failed' | 'model_output_truncated' | 'model_empty_response' | 'model_response_invalid' | 'model_format_error' | 'model_unavailable'

/** Safe categories only: never return provider exception text to the client. */
export class BoostFailure extends Error {
  constructor(readonly code: FailureCode) { super(code); this.name = 'BoostFailure' }
}
