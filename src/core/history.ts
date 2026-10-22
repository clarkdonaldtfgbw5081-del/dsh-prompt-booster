export const refersToHistory = /这个|这些|上面|上述|刚才|之前|根据|照着|同样|此项目|当前项目|based on|as above|the above|previous (?:message|request|task|answer|reply)|this (?:project|page|app|site|file|code|task|repo)/i
const newTopic = /^(?:请)?\s*(?:换个话题|换一个话题|新任务[：:]|另一个任务[：:]|与前面无关|不要参考(?:之前|上面|历史)|忽略(?:之前|上面)的需求|new task\s*:|change (?:the )?topic\b|ignore (?:the )?previous (?:task|request)s?\b)/i

/** Only explicit topic resets cut history; ambiguous references keep bounded context. */
export function resetsHistory(raw: string): boolean { return newTopic.test(raw.trim()) }

export function recentRequirements<T extends { text: string }>(messages: readonly T[], raw: string, limit: number): T[] {
  if (resetsHistory(raw)) return []
  const bounded = messages.slice(-limit)
  const reset = bounded.findLastIndex(message => resetsHistory(message.text))
  return bounded.slice(Math.max(0, reset)).filter(message => message.text.trim() !== raw.trim()).reverse()
}
