import { useRef, useState, useSyncExternalStore } from 'react'
import { createRoot } from 'react-dom/client'
import { ComposerBooster } from '../../src/client/index.tsx'
import { baseResult } from '../../src/core/engine.ts'
import type { BoostRequest, BoostResult } from '../../src/types.ts'
import { ClientFailure } from '../../src/client/transport.ts'

const ORIGINAL = '写一份周报'
const OPTIMIZED = '请写一份周报，按重点组织内容。'
function Fixture() {
  const editor = useRef<HTMLTextAreaElement>(null)
  const current = useRef({ draft: ORIGINAL, draftRev: 0, phase: 'plain', occurrences: [] as unknown[] })
  const listeners = useRef(new Set<() => void>())
  const pending = useRef<{ request: BoostRequest; resolve(value: BoostResult): void; reject(error: Error): void }>()
  const [requests, setRequests] = useState(0), [sends, setSends] = useState(0)
  const [session, setSession] = useState('first'), [failure, setFailure] = useState(false)
  const [light, setLight] = useState(false)
  const [lastMode, setLastMode] = useState('')
  const update = (draft: string) => {
    current.current = { ...current.current, draft, draftRev: current.current.draftRev + 1 }
    listeners.current.forEach(listener => listener())
  }
  const props = {
    sessionId: session,
    useInput: (selector: (value: typeof current.current) => unknown) => selector(useSyncExternalStore(
      listener => { listeners.current.add(listener); return () => listeners.current.delete(listener) }, () => current.current)),
    readDraft: () => ({ text: current.current.draft, revision: current.current.draftRev, locked: current.current.phase !== 'plain', hasReferences: current.current.occurrences.length > 0 }),
    inputActions: {
      insertText(text: string, span: { draftRev: number; start: number; end: number }) {
        if (span.draftRev !== current.current.draftRev) return false
        const node = editor.current!
        node.focus(); node.setSelectionRange(span.start, span.end)
        // Real browser undo transaction for this textarea adapter; DSH owns its rich-text editor separately.
        return document.execCommand('insertText', false, text)
      },
      persistDraft() {},
    },
    focusDraft() { editor.current?.focus() },
    generate(request: BoostRequest) { setRequests(value => value + 1); setLastMode(request.mode); return new Promise<BoostResult>((resolve, reject) => { pending.current = { request, resolve, reject } }) },
    trackEvent() {},
  } as unknown as Parameters<typeof ComposerBooster>[0]
  return <main style={{ maxWidth: 600, margin: '24px auto', padding: 12, fontFamily: 'system-ui' }}>
    <p>离线浏览器集成夹具 · 不连接模型，不代表完整 DSH 页面。</p>
    <form onSubmit={event => { event.preventDefault(); setSends(value => value + 1) }}>
      <label htmlFor="editor">任务草稿</label><br />
      <textarea id="editor" ref={editor} defaultValue={ORIGINAL} onInput={event => update(event.currentTarget.value)} style={{ width: '100%', height: 120 }} />
      <ComposerBooster key={session} {...props} />
      <button type="submit">发送</button>
    </form>
    <p>请求 <output data-testid="requests">{requests}</output> · 发送 <output data-testid="sends">{sends}</output></p>
    <output data-testid="last-mode">{lastMode}</output>
    <button onClick={() => {
      const item = pending.current
      if (item) item.resolve({ ...baseResult(item.request, 'fixture'), status: failure ? 'fallback' : 'ok', optimized: failure ? item.request.raw : OPTIMIZED,
        ...(!failure && item.request.mode === 'light' ? { optimized: '请写一份周报，突出重点。' } : {}),
        ...(light ? { mode: 'light', optimized: '请写一份周报' } : {}),
        reason_code: failure ? 'guard_failed' : null, warnings: failure ? ['lost_constraint', 'new_number'] : [] })
    }}>完成请求</button>
    <button onClick={() => pending.current?.reject(new ClientFailure('host_connection_failed'))}>模拟断线</button>
    <label><input type="checkbox" checked={failure} onChange={event => setFailure(event.target.checked)} />模拟守卫失败</label>
    <label><input type="checkbox" checked={light} onChange={event => setLight(event.target.checked)} />模拟宿主轻量模式</label>
    <button onClick={() => setSession(value => value === 'first' ? 'second' : 'first')}>切换会话</button>
    <button onClick={() => {
      current.current = { ...current.current, occurrences: current.current.occurrences.length ? [] : [{}] }
      listeners.current.forEach(listener => listener())
    }}>切换引用</button>
  </main>
}
createRoot(document.getElementById('root')!).render(<Fixture />)
