import type { BoostRequest } from '../types.ts'
import type { TaskIntent } from './intent.ts'
import type { DefaultChoice } from './defaults.ts'

/** Fill delivery choices, not missing facts, only for clearly identified tasks. */
export function taskDefaults(request: BoostRequest, intent: TaskIntent): DefaultChoice[] {
  const raw = request.raw
  if (intent.operation === 'explain' || (intent.steps?.length ?? 0) > 1
    || /交付|格式|按.{0,12}(?:组织|结构|分)|包含|包括|表格|列表|仅输出|只输出|\b(?:format|deliver|sections?|table|bullets?|output only)\b/i.test(raw)) return []
  const en = request.language === 'en'
  let value: string | undefined
  if (intent.task_type === 'writing' && !/润色|翻译|总结|改写|诗|小说|translate|polish|summari[sz]e|rewrite|poem|fiction/i.test(raw)) {
    if (/周报|weekly (?:report|update)/i.test(raw)) value = en
      ? 'Default delivery: organize the weekly report into progress, issues and next steps; use supplied facts and flag missing details.'
      : '默认交付：周报按工作进展、问题和下一步组织；使用已提供事实，缺失事项明确标注。'
    else if (/邮件|email/i.test(raw)) value = en
      ? 'Default delivery: an email with a subject, purpose, main message and closing; use supplied recipient details and facts.'
      : '默认交付：邮件包含主题、来意、正文和结尾；收件人资料及具体事实以已提供内容为准。'
  } else if (intent.task_type === 'debug') {
    const fix = intent.stage === 'execution' && /修复|\bfix\b/i.test(raw)
    value = en
      ? fix ? 'Default delivery: a focused fix and verification method grounded in available evidence; label unconfirmed causes as hypotheses.' : 'Default delivery: reproduction and diagnosis steps, supporting evidence and a verification method; keep unconfirmed causes as hypotheses.'
      : fix ? '默认交付：依据现有证据给出针对原问题的修复与验证方法；尚未确认的原因保持待验证。' : '默认交付：整理复现与排查步骤、证据和验证方法；尚未确认的原因保持待验证。'
  } else if (intent.task_type === 'research') value = en
    ? 'Default delivery: organize findings around the research question, cite sources, explain comparison criteria and limits, and distinguish facts from inferences.'
    : '默认交付：围绕研究问题组织结论、比较依据、来源与适用范围，区分事实与推断。'
  else if (intent.task_type === 'analysis') value = en
    ? 'Default delivery: explain data definitions, analysis method, findings and limitations; flag missing data without inventing results.'
    : '默认交付：说明数据口径、分析方法、结果与局限；标注缺失数据，不编造结论。'
  return value ? [{ category: 'delivery', value }] : []
}
