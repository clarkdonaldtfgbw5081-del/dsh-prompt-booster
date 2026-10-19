import type { BoostResult } from '../src/types.ts'
import type { GoldenCase } from './cases.ts'

/** Nearest-rank percentile; never rounds a high percentile down to the fastest sample. */
export function percentile(values: readonly number[], fraction: number): number | undefined {
  if (!values.length) return undefined
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.max(0, Math.min(sorted.length - 1, Math.ceil(fraction * sorted.length) - 1))]
}
export function liveIssues(caze: GoldenCase, result: BoostResult): string[] {
  if (result.status === 'fallback' || result.status === 'cancelled') return [`无可用优化结果：${result.reason_code ?? result.status}（${result.warnings.join('、')}）`]
  if (result.status === 'skipped') return []
  const issues: string[] = []
  const missing = caze.must_preserve?.filter(part => !result.optimized.includes(part)) ?? []
  if (missing.length) issues.push(`约束丢失：${missing.join('、')}`)
  for (const banned of caze.forbidden ?? []) if (result.optimized.includes(banned)) issues.push(`无依据新增：${banned}`)
  if (caze.max_chars !== undefined && [...result.optimized].length > caze.max_chars) issues.push('超过样例长度上限')
  return issues
}
export function readOptions(args: readonly string[]): { live: boolean; limit?: number } {
  let live = false, limit: number | undefined
  for (let index = 0; index < args.length; index++) {
    const arg = args[index]
    if (arg === '--live') { live = true; continue }
    if (arg === '--limit') {
      const next = args[++index]
      if (!next || !/^\d+$/.test(next) || Number(next) < 1 || !Number.isSafeInteger(Number(next))) throw new Error('--limit 必须为正整数')
      limit = Number(next); continue
    }
    throw new Error(`未知参数：${arg}`)
  }
  if (limit !== undefined && !live) throw new Error('--limit 仅用于 --live 模式')
  return { live, limit }
}
