/**
 * 黄金集评测运行器。
 * - 默认离线模式：确定性断言路由分类/跳过分支，并用脚本化模型输出回归守卫层。
 *   任一断言失败即退出码 1（DESIGN.md 8.1：关键约束变更必须修复后才能发布）。
 * - --live：调用 BOOST_API_KEY 指向的真实模型，统计状态分布、约束保留率、无依据新增、
 *   长度与延迟分位数；出现约束丢失或无依据新增同样判定失败。用法见 evals/README.md。
 */
import { BoostEngine } from '../src/core/engine.ts'
import { classify, skipReason } from '../src/core/route.ts'
import { requestSchema, type Candidate, type ModelProvider } from '../src/types.ts'
import { compatibleProvider } from '../demo/provider.ts'
import { GOLDEN_CASES, type GoldenCase } from './cases.ts'
import { liveIssues, percentile, readOptions } from './metrics.ts'

interface Failure { id: string; group: string; detail: string }

function buildRequest(caze: GoldenCase) {
  return requestSchema.parse({
    request_id: `eval-${caze.id}`,
    draft_revision: 1,
    raw: caze.raw,
    mode: caze.mode ?? 'standard',
    language: /[\u3400-\u9fff]/.test(caze.raw) ? 'zh' : 'en',
    context_sources: (caze.context ?? []).map((source, index) => ({ id: `src${index}`, label: source.label, content: source.content })),
  })
}

function scriptedProvider(candidate: Candidate): ModelProvider {
  return { name: 'golden-scripted', async generate() { return JSON.stringify(candidate) } }
}

function checkRoute(caze: GoldenCase): Failure | undefined {
  const expected = caze.route!
  const request = buildRequest(caze)
  const skip = skipReason(request)
  if (expected.skip) {
    return skip === expected.skip ? undefined
      : { id: caze.id, group: caze.group, detail: `期望跳过 ${expected.skip}，实际 ${skip ?? '未跳过'}` }
  }
  if (skip) return { id: caze.id, group: caze.group, detail: `不应跳过，实际跳过原因 ${skip}` }
  const type = classify(caze.raw)
  return type === expected.task_type ? undefined
    : { id: caze.id, group: caze.group, detail: `期望分类 ${expected.task_type}，实际 ${type}` }
}

async function checkScripted(caze: GoldenCase): Promise<Failure | undefined> {
  const expected = caze.scripted!
  const engine = new BoostEngine(scriptedProvider(expected.candidate), { timeoutMs: 5000 })
  const result = await engine.boost(buildRequest(caze))
  if (result.status !== expected.expect) {
    return { id: caze.id, group: caze.group, detail: `期望状态 ${expected.expect}，实际 ${result.status}（${result.reason_code ?? '-'}，warnings: ${result.warnings.join(',') || '-'}）` }
  }
  for (const warning of expected.expect_warnings ?? []) {
    if (!result.warnings.includes(warning)) {
      return { id: caze.id, group: caze.group, detail: `期望 warnings 包含 ${warning}，实际 [${result.warnings.join(',')}]` }
    }
  }
  return undefined
}

async function runOffline(): Promise<void> {
  const failures: Failure[] = []
  let routeChecks = 0
  for (const caze of GOLDEN_CASES) {
    if (!caze.route) continue
    routeChecks++
    const failure = checkRoute(caze)
    if (failure) failures.push(failure)
  }
  const scripted = GOLDEN_CASES.filter(caze => caze.scripted)
  for (const caze of scripted) {
    const failure = await checkScripted(caze)
    if (failure) failures.push(failure)
  }
  const groups = [...new Set(GOLDEN_CASES.map(caze => caze.group))]
  console.log(`离线人工构造回归集：${GOLDEN_CASES.length} 条样例（${groups.length} 个类别），`
    + `${routeChecks} 项路由断言 + ${scripted.length} 项守卫回归。`)
  for (const group of groups) {
    const count = GOLDEN_CASES.filter(caze => caze.group === group).length
    const failed = failures.filter(failure => failure.group === group).length
    console.log(`  ${group.padEnd(16)} ${String(count).padStart(3)} 条${failed ? `，失败 ${failed}` : ''}`)
  }
  if (failures.length) {
    console.error(`\n失败 ${failures.length} 项：`)
    for (const failure of failures) console.error(`  [${failure.id}] ${failure.group}: ${failure.detail}`)
    process.exitCode = 1
  } else {
    console.log('全部通过。通过样例不等于对所有输入的绝对保证。')
  }
}

async function runLive(limit: number | undefined): Promise<void> {
  if (!process.env.BOOST_API_KEY) {
    console.error('--live 需要 BOOST_API_KEY（以及可选 BOOST_BASE_URL / BOOST_MODEL），见 evals/README.md。')
    process.exit(1)
  }
  const provider = compatibleProvider()
  const cases = GOLDEN_CASES.filter(caze => !caze.route?.skip).slice(0, limit)
  const failures: Failure[] = []
  const latencies: number[] = []
  const statusTally: Record<string, number> = {}
  let preservationTotal = 0
  let preservationKept = 0
  let constraintAttempts = 0
  let usable = 0
  let issuesChecked = 0
  console.log(`真实模型评测：${cases.length} 条样例，模型 ${provider.name}。逐条执行…`)
  for (const caze of cases) {
    const engine = new BoostEngine(provider, { timeoutMs: 60000 })
    const result = await engine.boost(buildRequest(caze))
    if (caze.must_preserve?.length) constraintAttempts++
    statusTally[result.status] = (statusTally[result.status] ?? 0) + 1
    latencies.push(result.meta.latency_ms)
    console.log(`  [${caze.id}] ${result.status}${result.status === 'ok' ? '' : ` (${result.reason_code ?? 'guard_failed'}${result.warnings.length ? `: ${result.warnings.join(',')}` : ''})`}`)
    for (const detail of liveIssues(caze, result)) failures.push({ id: caze.id, group: caze.group, detail })
    if (result.status !== 'ok') continue
    usable++
    if (caze.must_preserve?.length) {
      preservationTotal++
      const missing = caze.must_preserve.filter(part => !result.optimized.includes(part))
      if (!missing.length) preservationKept++
    }
    if (caze.forbidden?.length) issuesChecked++
  }
  console.log('\n状态分布：', JSON.stringify(statusTally))
  console.log(`可用改写覆盖：${usable}/${cases.length}；无需改写：${statusTally.skipped ?? 0}；回退与取消计入失败。`)
  console.log(`成功改写的约束保留率：${preservationTotal ? Math.round((preservationKept / preservationTotal) * 100) + '%' : 'n/a'}（${preservationKept}/${preservationTotal}）；含约束的全部尝试：${constraintAttempts}。`)
  console.log(`禁止项检查覆盖 ${issuesChecked} 条成功改写；这不等于完整语义质量评价。`)
  console.log(`延迟：P50 ${percentile(latencies, 0.5) ?? 'n/a'} ms，P90 ${percentile(latencies, 0.9) ?? 'n/a'} ms，最大 ${Math.max(0, ...latencies)} ms`)
  if (!usable) failures.push({ id: 'coverage', group: 'coverage', detail: '没有可用改写，无法评价优化质量' })
  if (failures.length) {
    console.error(`\n失败 ${failures.length} 项：`)
    for (const failure of failures) console.error(`  [${failure.id}] ${failure.group}: ${failure.detail}`)
    process.exitCode = 1
  } else {
    console.log('本轮已检查项目通过。仍需人工评估意图保真与下游任务质量；延迟目标需与实测对照。')
  }
}

try {
  const options = readOptions(process.argv.slice(2))
  if (options.live) await runLive(options.limit)
  else await runOffline()
} catch (error) {
  console.error(error instanceof Error ? error.message : '评测未能完成')
  process.exitCode = 1
}
