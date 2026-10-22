import { open, realpath } from 'node:fs/promises'
import { extname, isAbsolute, relative, resolve, basename } from 'node:path'
import type { Session } from '@deepseek-ai/dsh-session'
import type { BoostRequest, ContextSource } from '../types.ts'
import type { ContextPolicy } from '../config.ts'
import { selectExcerpt } from '../core/excerpts.ts'
import { refersToHistory, recentRequirements, resetsHistory } from '../core/history.ts'

const secret = /-----BEGIN [^-]*PRIVATE KEY-----|(?:api[_-]?key|password|secret|token|密码|密钥|令牌)["']?\s*[=:：]\s*["']?\S+|Bearer\s+[A-Za-z0-9._-]+|https?:\/\/[^\s/:]+:[^\s/@]+@/i
const extensions = new Set(['.md', '.txt', '.json', '.yaml', '.yml', '.arc', '.ts', '.tsx', '.js', '.jsx', '.css', '.html'])

export async function collectContext(session: Session, request: BoostRequest, policy: ContextPolicy, signal: AbortSignal) {
  const sources: ContextSource[] = [...request.context_sources]
  const notices: string[] = []
  let chars = sources.reduce((sum, source) => sum + source.content.length, 0)
  const add = (label: string, content: string, id: string) => {
    if (!content.trim() || secret.test(content) || sources.length >= 8 || chars >= 24000) return
    content = content.slice(0, Math.min(6000, 24000 - chars))
    while (sources.some(source => source.id === id)) id += '-context'
    sources.push({ id, label, content }); chars += content.length
  }
  signal.throwIfAborted()
  if (!resetsHistory(request.raw) && (policy.recentMessages === 'always' || (policy.recentMessages === 'referenced' && refersToHistory.test(request.raw)))) {
    const messages = session.snapshotEvents().filter(event => event.type === 'user/message' && event.data.source.kind === 'user')
      .slice(-policy.recentLimit)
    const history = messages.flatMap(event => event.type === 'user/message' ? [{ seq: event.seq,
      text: event.data.content.filter(block => block.type === 'text').map(block => block.text).join('\n') }] : [])
    for (const message of recentRequirements(history, request.raw, policy.recentLimit))
      add('近期用户需求（按新到旧排列；仅解释指代，当前草稿优先）', message.text, 'recent-user-' + message.seq)
  }
  for (const selected of policy.files) {
    signal.throwIfAborted()
    let handle: Awaited<ReturnType<typeof open>> | undefined
    try {
      if (!session.header.cwd) throw new Error('no workspace')
      const root = await realpath(session.header.cwd)
      const file = await realpath(isAbsolute(selected) ? selected : resolve(root, selected))
      const local = relative(root, file)
      if (local.startsWith('..') || isAbsolute(local) || !extensions.has(extname(file).toLowerCase())
        || /(?:^|[\\/])(?:\.git|node_modules|\.codex|\.aws)(?:[\\/]|$)|(?:^|[\\/])\.(?:env|credentials)/i.test(local)) throw new Error('disallowed file')
      handle = await open(file, 'r')
      const stat = await handle.stat()
      if (!stat.isFile() || stat.size > 48000) throw new Error('file too large')
      const content = await handle.readFile({ encoding: 'utf8', signal })
      if (content.includes('\0') || secret.test(content)) throw new Error('sensitive file')
      const excerpt = selectExcerpt(content, request.raw, Math.min(6000, 24000 - chars))
      add(('选中文件片段：' + basename(file) + ' · ' + excerpt.ranges + '（非完整文件）').slice(0, 160), excerpt.content, 'selected-file-' + sources.length)
    } catch { signal.throwIfAborted(); notices.push('context_file_skipped') }
    finally { await handle?.close() }
  }
  return { sources, notices: [...new Set(notices)] }
}
