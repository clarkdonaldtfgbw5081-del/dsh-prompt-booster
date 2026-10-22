import { z } from 'zod'
import { createTypertRemoteInfo, type RemoteStreamHandle, type RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import { requestSchema, resultSchema, feedbackSchema, capabilitiesSchema, capabilitiesInputSchema, type Capabilities, type CapabilitiesInput, type BoostResult, type FeedbackRequest } from '../types.ts'

export const rpcRequestSchema = z.object({ session_id: z.string().min(1).max(160), request: requestSchema }).strict()
export type RpcRequest = z.infer<typeof rpcRequestSchema>

// Explicit, version-pinned Typert descriptors; no undocumented HTTP endpoint.
const inputCodec = { mode: 'strict' as const, typeSymbol: 'dsh-prompt-booster#RpcRequest', create: () => rpcRequestSchema }
const feedbackCodec = { mode: 'strict' as const, typeSymbol: 'dsh-prompt-booster#FeedbackRequest', create: () => feedbackSchema }
const capabilitiesCodec = { mode: 'strict' as const, typeSymbol: 'dsh-prompt-booster#CapabilitiesInput', create: () => capabilitiesInputSchema }
export const remoteInfo = createTypertRemoteInfo({
  package: 'dsh-prompt-booster',
  methods: {
    'promptBooster/boost': {
      service: 'promptBooster', invocation: { kind: 'direct' }, mode: 'stream',
      parameters: [{ name: 'input', wire: 'input', source: 'json', codec: inputCodec, strictCodec: inputCodec }],
      cancellation: { parameter: 'signal' },
      result: { mode: 'strict', typeSymbol: 'dsh-prompt-booster#BoostResult', create: () => resultSchema },
    },
    'promptBooster/feedback': {
      service: 'promptBooster', invocation: { kind: 'direct' },
      parameters: [{ name: 'input', wire: 'input', source: 'json', codec: feedbackCodec, strictCodec: feedbackCodec }],
      result: { mode: 'strict', typeSymbol: 'dsh-prompt-booster#FeedbackAccepted', create: () => z.object({ accepted: z.boolean() }).strict() },
    },
    'promptBooster/capabilities': {
      service: 'promptBooster', invocation: { kind: 'direct' },
      parameters: [{ name: 'input', wire: 'input', source: 'json', codec: capabilitiesCodec, strictCodec: capabilitiesCodec }],
      result: { mode: 'strict', typeSymbol: 'dsh-prompt-booster#Capabilities', create: () => capabilitiesSchema },
    },
  },
}, z)

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface TypertRemoteMap {
    'promptBooster/boost': (input: RpcRequest) => RemoteStreamHandle<BoostResult, never>
    'promptBooster/feedback': (input: FeedbackRequest) => Promise<RemoteResult<{ accepted: boolean }>>
    'promptBooster/capabilities': (input: CapabilitiesInput) => Promise<RemoteResult<Capabilities>>
  }
  interface TypertRemoteNamespaceMap {
    promptBooster: {
      boost(input: RpcRequest): RemoteStreamHandle<BoostResult, never>
      feedback(input: FeedbackRequest): Promise<RemoteResult<{ accepted: boolean }>>
      capabilities(input: CapabilitiesInput): Promise<RemoteResult<Capabilities>>
    }
  }
}
