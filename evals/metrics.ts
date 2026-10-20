import { execFileSync } from 'node:child_process'
import type { BoostResult, BoostStatus } from '../src/types.ts'
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

/**
 * 真实模型评测的一轮观测：样例定义 + 引擎结果。
 * 工件只从这里派生结构化字段，不复制草稿或优化后正文，避免把用户内容写进评测产物。
 */
export interface LiveObservation {
  readonly caze: GoldenCase
  readonly result: BoostResult
}

export interface LiveReportOptions {
  /** --limit 实际生效的样例数量上限；写入工件用于说明抽样范围。 */
  readonly limit?: number
  /** 显式提交号；省略时尝试从 cwd 读取 git HEAD，null 表示明确不记录。 */
  readonly gitCommit?: string | null
  /** 读取 git 提交时使用的工作目录，默认 process.cwd()。 */
  readonly cwd?: string
}

export interface BuildLiveReportInput {
  readonly model: string
  readonly cases: readonly LiveObservation[]
  readonly startedAt: string
  readonly options?: LiveReportOptions
}

export interface LiveCaseReport {
  id: string
  group: string
  status: BoostStatus
  reason: string | null
  warnings: string[]
  latency_ms: number
  attempts: number
  chars: number
  preservation_ok?: boolean
  forbidden_hits?: string[]
}

export interface LiveReportSummary {
  total: number
  ok: number
  fallback: number
  skipped: number
  cancelled: number
  /** 可用改写比例（ok / total，0–1）；无样例时为 0。 */
  coverage: number
  /** 含约束的可用改写的保留比例（0–1）；没有可评价样本时为 null。 */
  preservation: number | null
  /** nearest-rank 毫秒分位数；无延迟样本时为 null。 */
  p50: number | null
  p90: number | null
  max: number | null
}

export interface LiveReport {
  schema: 1
  model: string
  created_at: string
  git_commit: string | null
  cases: LiveCaseReport[]
  summary: LiveReportSummary
  options: { limit: number | null }
}

const GIT_COMMIT_PATTERN = /^[0-9a-f]{7,64}$/

/** 读取当前 HEAD；git 不可用、目录不是仓库或没有提交时返回 null，绝不抛出。 */
export function resolveGitCommit(cwd: string = process.cwd()): string | null {
  try {
    const commit = execFileSync('git', ['rev-parse', '--verify', 'HEAD'], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 5000,
    }).trim()
    return GIT_COMMIT_PATTERN.test(commit) ? commit : null
  } catch {
    return null
  }
}

function normalizeCommit(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return GIT_COMMIT_PATTERN.test(trimmed) ? trimmed : null
}

function round4(value: number): number {
  return Math.round(value * 10000) / 10000
}

/**
 * 把一轮 --live 观测聚合为可提交/可对照的 JSON 工件（schema 1）。
 * 除读取 git HEAD（可用 options.gitCommit 覆盖；失败降级为 null）外不产生副作用：
 * 不写文件、不读环境变量，也不包含 BOOST_API_KEY 或提供方错误正文。
 */
export function buildLiveReport(input: BuildLiveReportInput): LiveReport {
  const { model, cases, startedAt, options } = input
  const rows: LiveCaseReport[] = []
  const latencies: number[] = []
  let ok = 0
  let fallback = 0
  let skipped = 0
  let cancelled = 0
  let preservationAttempts = 0
  let preservationKept = 0
  for (const { caze, result } of cases) {
    if (result.status === 'ok') ok++
    else if (result.status === 'fallback') fallback++
    else if (result.status === 'skipped') skipped++
    else cancelled++
    const row: LiveCaseReport = {
      id: caze.id,
      group: caze.group,
      status: result.status,
      reason: result.reason_code,
      warnings: [...result.warnings],
      latency_ms: result.meta.latency_ms,
      attempts: result.meta.attempts ?? 0,
      chars: [...result.optimized].length,
    }
    if (result.status === 'ok' && caze.must_preserve?.length) {
      preservationAttempts++
      const missing = caze.must_preserve.filter(part => !result.optimized.includes(part))
      row.preservation_ok = missing.length === 0
      if (row.preservation_ok) preservationKept++
    }
    if (result.status === 'ok' && caze.forbidden) {
      row.forbidden_hits = caze.forbidden.filter(banned => result.optimized.includes(banned))
    }
    rows.push(row)
    if (Number.isFinite(result.meta.latency_ms)) latencies.push(result.meta.latency_ms)
  }
  const total = rows.length
  const gitCommit = options?.gitCommit === undefined
    ? resolveGitCommit(options?.cwd)
    : normalizeCommit(options.gitCommit)
  return {
    schema: 1,
    model,
    created_at: startedAt,
    git_commit: gitCommit,
    cases: rows,
    summary: {
      total,
      ok,
      fallback,
      skipped,
      cancelled,
      coverage: total ? round4(ok / total) : 0,
      preservation: preservationAttempts ? round4(preservationKept / preservationAttempts) : null,
      p50: percentile(latencies, 0.5) ?? null,
      p90: percentile(latencies, 0.9) ?? null,
      max: latencies.length ? Math.max(...latencies) : null,
    },
    options: { limit: options?.limit ?? null },
  }
}

/** 没有任何可用改写时给出失败原因；这是 --live 退出码 1 的覆盖条件。 */
export function liveCoverageFailure(report: LiveReport): string | undefined {
  return report.summary.ok === 0 ? '没有可用改写，无法评价优化质量' : undefined
}

export interface EvalOptions {
  live: boolean
  limit?: number
  out?: string
}

export function readOptions(args: readonly string[]): EvalOptions {
  let live = false, limit: number | undefined, out: string | undefined
  for (let index = 0; index < args.length; index++) {
    const arg = args[index]
    if (arg === '--live') { live = true; continue }
    if (arg === '--limit') {
      const next = args[++index]
      if (!next || !/^\d+$/.test(next) || Number(next) < 1 || !Number.isSafeInteger(Number(next))) throw new Error('--limit 必须为正整数')
      limit = Number(next); continue
    }
    if (arg === '--out') {
      const next = args[++index]
      if (!next || next.startsWith('-')) throw new Error('--out 需要输出文件路径')
      out = next; continue
    }
    throw new Error(`未知参数：${arg}`)
  }
  if (limit !== undefined && !live) throw new Error('--limit 仅用于 --live 模式')
  if (out !== undefined && !live) throw new Error('--out 仅用于 --live 模式')
  const options: EvalOptions = { live }
  if (limit !== undefined) options.limit = limit
  if (out !== undefined) options.out = out
  return options
}
