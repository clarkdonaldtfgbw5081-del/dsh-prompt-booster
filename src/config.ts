import { z } from 'zod'
import Schema from '@deepseek-ai/schemastery'
import { preferencesSchema } from './types.ts'

export const contextPolicySchema = z.object({
  recentMessages: z.enum(['off', 'referenced', 'always']).default('referenced'),
  recentLimit: z.number().int().min(1).max(5).default(3),
  files: z.array(z.string().min(1).max(500)).max(6).default([]),
}).strict()
export type ContextPolicy = z.infer<typeof contextPolicySchema>

export const configSchema = z.object({
  mode: z.enum(['light', 'standard']).default('standard'),
  timeoutMs: z.number().int().min(100).max(120000).default(15000),
  maxOutputTokens: z.number().int().min(256).max(8192).default(4096),
  provider: z.string().min(1).optional(),
  model: z.string().min(1).optional(),
  context: contextPolicySchema.prefault({}),
  preferences: preferencesSchema.prefault({}),
  repairAttempts: z.number().int().min(0).max(1).default(1),
}).strict().refine(value => Boolean(value.provider) === Boolean(value.model), 'provider 和 model 必须同时配置')
export type BoosterConfig = z.input<typeof configSchema>

/** DSH's native Settings form persists only explicit user edits in the profile. */
export const Config = Schema.object({
  mode: Schema.union(['light', 'standard']).default('standard').description('优化模式：light 仅理顺表达；standard 可补充必要细节'),
  timeoutMs: Schema.number().min(100).max(120000).default(15000).description('整个优化过程的超时（毫秒）'),
  maxOutputTokens: Schema.number().min(256).max(8192).default(4096).description('每次模型输出上限'),
  provider: Schema.string().description('可选：与 model 一同指定优化模型'),
  model: Schema.string().description('可选：与 provider 一同指定'),
  context: Schema.object({
    recentMessages: Schema.union(['off', 'referenced', 'always']).default('referenced').description('最近需求：关闭 / 仅有“这个、上面”等指代时 / 总是'),
    recentLimit: Schema.number().min(1).max(5).step(1).default(3).description('当前会话最多读取的近期用户消息数'),
    files: Schema.array(Schema.string()).max(6).default([]).description('明确选中的工作区文件路径；不自动扫描目录'),
  }),
  preferences: Schema.object({
    detail: Schema.union(['auto', 'concise', 'detailed']).default('auto').description('表述详细度；原稿的明确要求优先'),
    tone: Schema.union(['auto', 'natural', 'formal']).default('auto').description('默认语气；原稿的明确要求优先'),
    fillDefaults: Schema.boolean().default(true).description('为新任务补齐合理默认方案'),
  }),
  repairAttempts: Schema.number().min(0).max(1).step(1).default(1).description('仅格式或约束错误最多修复一次；总调用不超过两次'),
}).volatile()
