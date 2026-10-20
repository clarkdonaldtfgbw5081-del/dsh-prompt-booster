import { open, realpath } from 'node:fs/promises'
import { extname, isAbsolute, relative, resolve, basename } from 'node:path'
import type { Session } from '@deepseek-ai/dsh-session'
import type { BoostRequest, ContextSource } from '../types.ts'
import type { ContextPolicy } from '../config.ts'

const secret = /-----BEGIN [^-]*PRIVATE KEY-----|(?:api[_-]?key|password|secret|token|密码|密钥|令牌)["']?\s*[=:：]\s*["']?\S+|Bearer\s+[A-Za-z0-9._-]+|https?:\/\/[^\s/:]+:[^\s/@]+@/i
const referenced = /这个|这些|上面|上述|刚才|之前|根据|照着|同样|此项目|当前项目|based on|as above|the above|previous (?:message|request|task|answer|reply)|this (?:project|page|app|site|file|code|task|repo)/i
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
  if (policy.recentMessages === 'always' || (policy.recentMessages === 'referenced' && referenced.test(request.raw))) {
    const messages = session.snapshotEvents().filter(event => event.type === 'user/message' && event.data.source.kind === 'user')
      .slice(-policy.recentLimit)
    for (const event of messages) if (event.type === 'user/message') {
      const text = event.data.content.filter(block => block.type === 'text').map(block => block.text).join('\n')
      if (text.trim() !== request.raw.trim()) add('当前会话最近的用户需求（背景资料，当前草稿优先）', text, 'recent-user-' + event.seq)
    }
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
      add('选中文件摘要：' + basename(file) + '（仅截取文本，非完整文件）', content, 'selected-file-' + sources.length)
    } catch { signal.throwIfAborted(); notices.push('context_file_skipped') }
    finally { await handle?.close() }
  }
  return { sources, notices: [...new Set(notices)] }
}
