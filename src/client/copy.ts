export type ClientLocale = 'zh' | 'en'

export type Notice =
  | { key: 'cancelled' }
  | { key: 'references' }
  | { key: 'locked' }
  | { key: 'tooLong' }
  | { key: 'changed' }
  | { key: 'applied'; count?: number }
  | { key: 'failed' }
  | { key: 'restored' }
  | { key: 'undoBlocked' }
  | { key: 'noResult' }
  | { key: 'reason'; code?: string }

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
  notices: {
    cancelled: string
    references: string
    locked: string
    tooLong: string
    changed: string
    applied: string
    appliedWithSources: (count: number) => string
    failed: string
    restored: string
    undoBlocked: string
    noResult: string
  }
}

const zh: ClientCopy = {
  locale: 'zh',
  labels: {
    optimize: '优化提示词',
    cancel: '取消优化',
    undo: '还原原稿',
    busy: '优化中…',
    optimizeHint: '优化后直接填入输入框；上下文与偏好可在 DSH 设置的 prompt-booster 中调整',
    busyTitle: '正在优化，点击取消',
    referencesHint: '含结构化引用，暂不自动改写',
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
    references: '含结构化引用，暂不自动改写。',
    locked: '当前输入框不可编辑。',
    tooLong: '草稿最多 20000 字符，原稿已保留。',
    changed: '草稿已变化，未覆盖；可再次优化。',
    applied: '已优化',
    appliedWithSources: count => `已优化 · 使用 ${count} 份参考`,
    failed: '优化失败，原稿已保留，请重试。',
    restored: '已还原原稿',
    undoBlocked: '草稿已被编辑或发送，无法直接还原。',
    noResult: '本次无需替换，原稿已保留。',
  },
}

const en: ClientCopy = {
  locale: 'en',
  labels: {
    optimize: 'Optimize prompt',
    cancel: 'Cancel optimization',
    undo: 'Restore original draft',
    busy: 'Optimizing…',
    optimizeHint: 'Writes the result directly into the composer. Adjust context and preferences in DSH settings → prompt-booster.',
    busyTitle: 'Optimization in progress; click to cancel',
    referencesHint: 'Structured references are not rewritten automatically yet',
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
    references: 'Structured references are not rewritten automatically yet.',
    locked: 'The composer is not editable right now.',
    tooLong: 'The draft is limited to 20,000 characters. Your draft was kept.',
    changed: 'The draft changed, so the result was not applied. You can optimize again.',
    applied: 'Optimized',
    appliedWithSources: count => `Optimized · ${count} source${count === 1 ? '' : 's'} used`,
    failed: 'Optimization failed. Your draft was kept. Try again.',
    restored: 'Original draft restored',
    undoBlocked: 'The draft was edited or sent, so it cannot be restored directly.',
    noResult: 'Nothing needed to be replaced. Your draft was kept.',
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
    case 'locked': return copy.notices.locked
    case 'tooLong': return copy.notices.tooLong
    case 'changed': return copy.notices.changed
    case 'failed': return copy.notices.failed
    case 'restored': return copy.notices.restored
    case 'undoBlocked': return copy.notices.undoBlocked
    case 'noResult': return copy.notices.noResult
    case 'reason': return (notice.code && copy.reasons[notice.code]) || copy.notices.noResult
  }
}
