import { z } from 'zod'

export const sourceSchema = z.object({
  id: z.string().min(1).max(80),
  label: z.string().min(1).max(160),
  content: z.string().max(12000),
}).strict()
export const preferencesSchema = z.object({
  detail: z.enum(['auto', 'concise', 'detailed']).default('auto'),
  tone: z.enum(['auto', 'natural', 'formal']).default('auto'),
  fillDefaults: z.boolean().default(true),
}).strict()
export type Preferences = z.infer<typeof preferencesSchema>
export const requestSchema = z.object({
  request_id: z.string().min(1).max(100),
  draft_revision: z.number().int().nonnegative(),
  raw: z.string().max(20000),
  mode: z.enum(['light', 'standard']).default('standard'),
  language: z.enum(['zh', 'en']).default('zh'),
  context_sources: z.array(sourceSchema).max(8).default([]),
  preferences: preferencesSchema.optional(),
}).strict().superRefine((request, ctx) => {
  if (new Set(request.context_sources.map(s => s.id)).size !== request.context_sources.length)
    ctx.addIssue({ code: 'custom', message: '资料 ID 不可重复' })
  if (request.context_sources.reduce((n, s) => n + s.content.length, 0) > 24000)
    ctx.addIssue({ code: 'custom', message: '资料总长度超过 24000 字符' })
})
export const taskTypes = ['code_gen', 'debug', 'research', 'writing', 'analysis', 'casual', 'other'] as const
export const additionSchema = z.object({
  id: z.string().min(1).max(80),
  value: z.string().min(1).max(400),
  kind: z.enum(['sourced_fact', 'suggestion', 'default_assumption']),
  category: z.enum(['tech_stack', 'page_modules', 'assets', 'delivery']).optional(),
  source_id: z.string().max(80).optional(),
  evidence_quote: z.string().max(1000).optional(),
  action: z.enum(['included', 'pending']),
}).strict()
export const candidateSchema = z.object({
  optimized: z.string().min(1).max(30000),
  task_type: z.enum(taskTypes),
  slots: z.object({
    goal: z.string().max(1000), context: z.string().max(2000), inputs: z.string().max(2000),
    output_format: z.string().max(1000), constraints: z.array(z.string().max(1000)).max(30),
    acceptance: z.array(z.string().max(1000)).max(20),
  }).strict(),
  additions: z.array(additionSchema).max(20),
  unresolved: z.array(z.string().max(300)).max(8),
}).strict()

export type BoostRequest = z.infer<typeof requestSchema>
export type ContextSource = z.infer<typeof sourceSchema>
export type Candidate = z.infer<typeof candidateSchema>
export type Addition = z.infer<typeof additionSchema>
export type TaskType = typeof taskTypes[number]
export type BoostStatus = 'ok' | 'skipped' | 'fallback' | 'cancelled'
export interface BoostResult extends Candidate {
  preferences?: Preferences
  request_id: string
  draft_revision: number
  raw: string
  mode: BoostRequest['mode']
  status: BoostStatus
  sources: ContextSource[]
  warnings: string[]
  reason_code: string | null
  meta: { model: string; latency_ms: number; attempts?: number }
}
export const resultSchema = candidateSchema.extend({
  preferences: preferencesSchema.optional(),
  request_id: z.string(), draft_revision: z.number().int().nonnegative(), raw: z.string(),
  mode: z.enum(['light', 'standard']), status: z.enum(['ok', 'skipped', 'fallback', 'cancelled']),
  sources: z.array(sourceSchema), warnings: z.array(z.string()), reason_code: z.string().nullable(),
  meta: z.object({ model: z.string(), latency_ms: z.number(), attempts: z.number().int().min(0).max(2).optional() }).strict(),
})
export interface ModelInput { system: string; input: string; signal: AbortSignal }
export interface ModelProvider {
  readonly name: string
  generate(input: ModelInput): Promise<string>
}
export type BoostEventName = 'boost_clicked' | 'boost_completed' | 'boost_applied' | 'boost_edited' | 'boost_undone' | 'prompt_sent'
/** Evaluation events carry no draft text: only names, correlation ids, status and latency. */
export interface BoostEvent {
  name: BoostEventName
  request_id?: string
  status?: BoostStatus
  latency_ms?: number
  ok?: boolean
}
export interface EngineConfig {
  timeoutMs: number
  repairAttempts?: number
  onEvent?: (event: BoostEvent) => void
}

export const feedbackSchema = z.object({
  session_id: z.string().min(1).max(160),
  event: z.object({
    name: z.enum(['boost_applied', 'boost_edited', 'boost_undone']),
    request_id: z.string().min(1).max(100),
    ok: z.boolean().optional(),
    content_hash: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  }).strict(),
}).strict()
export type FeedbackRequest = z.infer<typeof feedbackSchema>
