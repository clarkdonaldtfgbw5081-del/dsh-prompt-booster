import { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Booster } from '../src/client/Booster.tsx'
import { resultSchema, type BoostEvent, type BoostEventName } from '../src/types.ts'
import type { DraftSnapshot } from '../src/client/draft.ts'

const info = await fetch('/api/info').then(res => res.json()) as { demo: boolean; model: string }
const eventNames: BoostEventName[] = ['boost_clicked', 'boost_completed', 'boost_applied', 'boost_edited', 'boost_undone', 'prompt_sent']
function App() {
  const [draft, setDraft] = useState<DraftSnapshot>({ text: '根据这个项目，帮我加一个登录页面，先给方案，不要改代码', revision: 0, locked: false, hasReferences: false })
  const latest = useRef(draft)
  const [engineTally, setEngineTally] = useState<Record<string, number>>({})
  const [clientTally, setClientTally] = useState<Record<string, number>>({})
  function write(text: string) { const next = { ...latest.current, text, revision: latest.current.revision + 1 }; latest.current = next; setDraft(next) }
  function onEvent(event: BoostEvent) { setClientTally(tally => ({ ...tally, [event.name]: (tally[event.name] ?? 0) + 1 })) }
  useEffect(() => {
    const timer = setInterval(() => {
      void fetch('/api/events').then(res => res.ok ? res.json() : { events: [] }).then((value: { events: BoostEvent[] }) => {
        const tally: Record<string, number> = {}
        for (const event of value.events) tally[event.name] = (tally[event.name] ?? 0) + 1
        setEngineTally(tally)
      }).catch(() => {})
    }, 1500)
    return () => clearInterval(timer)
  }, [])
  return <main>
    <header className="demo-top"><span className="demo-brand">DSH / PROMPT BOOSTER</span><h1>把想法，变成清晰的任务。</h1><p>保留你的原意，让目标、交付和边界更明确。</p><span className="demo-badge">{info.demo ? '离线交互示例 · 使用规则模拟，未调用真实模型' : `真实模型预览 · ${info.model}`}</span></header>
    <div className="demo-grid"><div><div className="demo-composer"><label className="demo-label" htmlFor="draft">你的任务草稿</label><textarea id="draft" className="demo-draft" value={draft.text} onChange={e => write(e.target.value)} />
      <Booster draft={draft} readDraft={() => latest.current} replaceDraft={(revision, text) => { if (latest.current.revision !== revision) return false; write(text); return true }} generate={async (request, signal) => {
        const response = await fetch('/api/boost', { method: 'POST', signal, headers: { 'content-type': 'application/json' }, body: JSON.stringify(request) })
        if (!response.ok) throw new Error('request_failed')
        return resultSchema.parse(await response.json())
      }} onEvent={onEvent} />
    </div><div className="demo-samples">{['写一份本周工作总结', '修复 src/login.ts 中的报错，不新增依赖', '分析这份销售数据的趋势', '继续'].map(text => <button key={text} type="button" onClick={() => write(text)}>{text}</button>)}</div><div className="demo-foot">此页面预览插件的同一套交互组件。DSH 安装版通过宿主模型与输入框接口运行。</div>
    <div className="demo-events">事件统计（仅内存，不持久化）：{eventNames.map(name => `${name} ${(engineTally[name] ?? 0) + (clientTally[name] ?? 0)}`).join(' · ')}</div></div>
    <aside className="demo-aside"><h2>优化后，直接继续写</h2><ol><li>写下任务，点击优化图标。</li><li>结果直接填入当前输入框。</li><li>继续编辑，或点击还原原稿。</li></ol><p>优化中可再次点击图标取消。期间修改草稿时，返回结果不会覆盖新内容。</p></aside></div>
  </main>
}
createRoot(document.getElementById('root')!).render(<App />)
