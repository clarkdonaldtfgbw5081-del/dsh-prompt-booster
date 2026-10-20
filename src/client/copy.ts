export type ClientLocale = 'zh' | 'en'

export type Notice =
  | { key: 'cancelled' }
  | { key: 'references' }
  | { key: 'referenceConflict' }
  | { key: 'locked' }
  | { key: 'composing' }
  | { key: 'tooLong' }
  | { key: 'changed' }
  | { key: 'applied'; count?: number }
  | { key: 'failed' }
  | { key: 'restored' }
  | { key: 'undoBlocked' }
  | { key: 'noResult' }
  | { key: 'reason'; code?: string; warnings?: readonly string[] }

export interface ClientCopy {
  locale: ClientLocale
  labels: {
    optimize: string
    cancel: string
    undo: string
    busy: string
    optimizeHint: string
    busyTitle: string
    referencesHint: string
    undoTitle: string
    statusBusyTitle: string
  }
  reasons: Record<string, string>
  guards: Record<string, string>
  guardKept: string
  notices: {
    cancelled: string
    references: string
    referenceConflict: string
    locked: string
    composing: string
    tooLong: string
    changed: string
    applied: string
    appliedWithSources: (count: number) => string
    failed: string
    restored: string
    undoBlocked: string
    noResult: string
    unknownReason: string
  }
}

const zh: ClientCopy = {
  locale: 'zh',
  guardKept: '原稿已保留。',
  guards: {
    lost_constraint: '改写遗漏了原稿限制', lost_reference: '改写改变了原有引用', lost_preference: '改写遗漏了风格或受众要求',
    lost_number: '改写遗漏了原有数字', lost_identifier: '改写遗漏了技术名称、路径或标识符',
    changed_stage: '改写改变了交付阶段', changed_intent: '改写改变了任务动作',
    replaced_task: '改写偏离了原任务', lost_task_part: '改写遗漏了部分任务',
    expanded_scope: '改写加入了未要求的功能', new_number: '改写加入了无依据的数字',
    new_identifier: '改写加入了无依据的技术或标识符', too_long: '改写超过长度限制',
    unverifiable_source: '补充内容无法核对来源', unapproved_default: '改写采用了未允许的默认方案',
    fact_not_in_body: '补充记录与正文不一致', empty_output: '改写正文为空',
    pending_suggestion_in_body: '改写加入了未采纳的建议', unapproved_suggestion: '建议未经采纳',
    duplicate_addition: '补充记录重复', unknown_suggestion: '建议记录无效',
  },
  labels: {
    optimize: '优化提示词',
    cancel: '取消优化',
    undo: '还原原稿',
    busy: '优化中…',
    optimizeHint: '优化后直接填入输入框；上下文与偏好可在 DSH 设置的 prompt-booster 中调整',
    busyTitle: '正在优化，点击取消',
    referencesHint: '保留引用身份，仅优化可安全替换的文字；跨引用改写会保留原稿',
    undoTitle: '还原优化前的原稿',
    statusBusyTitle: '正在优化，点击图标可取消',
  },
  reasons: {
    timeout: '优化超时，原稿已保留，请重试。',
    guard_failed: '改写未通过检查，原稿已保留。',
    conversational_input: '这条消息无需优化。',
    empty_input: '请先写下你的任务。',
    host_command: 'DSH 命令保持原文。',
    model_or_format_error: '模型未返回可用结果，原稿已保留。',
    model_request_failed: '模型调用失败，原稿已保留，请检查模型连接。',
    model_output_truncated: '模型输出被截断，原稿已保留，请重试。',
    model_empty_response: '模型未返回正文，原稿已保留，请重试。',
    model_response_invalid: '模型返回内容异常，原稿已保留。',
    model_format_error: '模型返回格式不符，原稿已保留，请重试。',
    model_unavailable: '当前模型不可用，请检查模型选择。',
    context_unavailable: '参考资料暂不可用，原稿已保留。',
    session_not_open: '请先打开一个会话。',
    cancelled: '已取消，原稿已保留。',
  },
  notices: {
    cancelled: '已取消，原稿已保留。',
    references: '引用信息不完整或已失效，原稿已保留。',
    referenceConflict: '改写跨越了引用，原稿已保留；请集中改写一个文字段。',
    locked: '当前输入框不可编辑。',
    composing: '输入法正在输入，原稿已保留；确认文字后可再优化。',
    tooLong: '草稿最多 20000 字符，原稿已保留。',
    changed: '草稿已变化，未覆盖；可再次优化。',
    applied: '已优化',
    appliedWithSources: count => `已优化 · 已提供 ${count} 份参考`,
    failed: '优化失败，原稿已保留，请重试。',
    restored: '已还原原稿',
    undoBlocked: '草稿已被编辑或发送，无法直接还原。',
    noResult: '本次无需替换，原稿已保留。',
    unknownReason: '本次优化未完成，原稿已保留。',
  },
}

const en: ClientCopy = {
  locale: 'en',
  guardKept: 'Your draft was kept.',
  guards: {
    lost_constraint: 'The rewrite omitted a constraint', lost_reference: 'The rewrite changed an existing reference', lost_preference: 'The rewrite omitted a style or audience requirement',
    lost_number: 'The rewrite omitted an original number', lost_identifier: 'The rewrite omitted a technology, path or identifier',
    changed_stage: 'The rewrite changed the delivery stage', changed_intent: 'The rewrite changed the requested action',
    replaced_task: 'The rewrite drifted from the task', lost_task_part: 'The rewrite omitted part of the task',
    expanded_scope: 'The rewrite added an unrequested feature', new_number: 'The rewrite added an unsupported number',
    new_identifier: 'The rewrite added an unsupported technology or identifier', too_long: 'The rewrite exceeded the length limit',
    unverifiable_source: 'An addition could not be verified against its source', unapproved_default: 'The rewrite used an unapproved default',
    fact_not_in_body: 'Addition records did not match the text', empty_output: 'The rewrite was empty',
    pending_suggestion_in_body: 'The rewrite included an unaccepted suggestion', unapproved_suggestion: 'A suggestion was not accepted',
    duplicate_addition: 'Addition records were duplicated', unknown_suggestion: 'A suggestion record was invalid',
  },
  labels: {
    optimize: 'Optimize prompt',
    cancel: 'Cancel optimization',
    undo: 'Restore original draft',
    busy: 'Optimizing…',
    optimizeHint: 'Writes the result directly into the composer. Adjust context and preferences in DSH settings → prompt-booster.',
    busyTitle: 'Optimization in progress; click to cancel',
    referencesHint: 'Preserves reference identity and rewrites only a safe text range. Edits crossing references keep the draft.',
    undoTitle: 'Restore the draft from before optimization',
    statusBusyTitle: 'Optimization in progress; click the icon to cancel',
  },
  reasons: {
    timeout: 'Optimization timed out. Your draft was kept. Try again.',
    guard_failed: 'The rewrite did not pass validation. Your draft was kept.',
    conversational_input: 'This message does not need optimization.',
    empty_input: 'Write a task first.',
    host_command: 'DSH commands are left unchanged.',
    model_or_format_error: 'The model returned no usable result. Your draft was kept.',
    model_request_failed: 'The model call failed. Your draft was kept. Check the model connection.',
    model_output_truncated: 'The model output was truncated. Your draft was kept. Try again.',
    model_empty_response: 'The model returned no text. Your draft was kept. Try again.',
    model_response_invalid: 'The model returned an invalid response. Your draft was kept.',
    model_format_error: 'The model response format was invalid. Your draft was kept. Try again.',
    model_unavailable: 'The selected model is unavailable. Check your model settings.',
    context_unavailable: 'Context was unavailable. Your draft was kept.',
    session_not_open: 'Open a session first.',
    cancelled: 'Optimization cancelled. Your draft was kept.',
  },
  notices: {
    cancelled: 'Optimization cancelled. Your draft was kept.',
    references: 'Reference metadata is incomplete or invalid. Your draft was kept.',
    referenceConflict: 'The rewrite crossed a reference. Your draft was kept. Focus the rewrite on one text segment.',
    locked: 'The composer is not editable right now.',
    composing: 'Text composition is active. Your draft was kept. Finish composing before optimizing.',
    tooLong: 'The draft is limited to 20,000 characters. Your draft was kept.',
    changed: 'The draft changed, so the result was not applied. You can optimize again.',
    applied: 'Optimized',
    appliedWithSources: count => `Optimized · ${count} source${count === 1 ? '' : 's'} provided`,
    failed: 'Optimization failed. Your draft was kept. Try again.',
    restored: 'Original draft restored',
    undoBlocked: 'The draft was edited or sent, so it cannot be restored directly.',
    noResult: 'Nothing needed to be replaced. Your draft was kept.',
    unknownReason: 'Optimization did not complete. Your draft was kept.',
  },
}

const cjk = /[\u3400-\u9fff]/
const latin = /[A-Za-z]/

/** Follow the draft's language for composer UI copy; empty drafts default to Chinese. */
export function copyFor(text: string): ClientCopy {
  if (cjk.test(text)) return zh
  return latin.test(text) ? en : zh
}

export function formatNotice(copy: ClientCopy, notice: Notice): string {
  switch (notice.key) {
    case 'applied': return notice.count ? copy.notices.appliedWithSources(notice.count) : copy.notices.applied
    case 'cancelled': return copy.notices.cancelled
    case 'references': return copy.notices.references
    case 'referenceConflict': return copy.notices.referenceConflict
    case 'locked': return copy.notices.locked
    case 'composing': return copy.notices.composing
    case 'tooLong': return copy.notices.tooLong
    case 'changed': return copy.notices.changed
    case 'failed': return copy.notices.failed
    case 'restored': return copy.notices.restored
    case 'undoBlocked': return copy.notices.undoBlocked
    case 'noResult': return copy.notices.noResult
    case 'reason':
      if (notice.code === 'guard_failed') {
        const detail = guardDetails(copy, notice)[0]
        if (detail) return copy.locale === 'zh' ? `${detail}，${copy.guardKept}` : `${detail}. ${copy.guardKept}`
      }
      // No code means the host skipped optimization (nothing to replace). An unknown
      // code means the rewrite did not complete: never claim nothing needed changing.
      if (!notice.code) return copy.notices.noResult
      return Object.hasOwn(copy.reasons, notice.code) ? copy.reasons[notice.code] : copy.notices.unknownReason
  }
}

/** Only static, allowlisted labels reach the UI; unknown codes never echo model data. */
function guardDetails(copy: ClientCopy, notice: Notice): string[] {
  if (notice.key !== 'reason' || notice.code !== 'guard_failed') return []
  return [...new Set(notice.warnings ?? [])].filter(code => Object.hasOwn(copy.guards, code)).slice(0, 4).map(code => copy.guards[code])
}

export function noticeTitle(copy: ClientCopy, notice: Notice): string {
  const details = guardDetails(copy, notice)
  return details.length ? `${details.join(copy.locale === 'zh' ? '；' : '; ')}${copy.locale === 'zh' ? '。' : '.'} ${copy.guardKept}` : formatNotice(copy, notice)
}
