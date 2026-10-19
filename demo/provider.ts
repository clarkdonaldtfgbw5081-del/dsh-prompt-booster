import type { ModelProvider } from '../src/types.ts'
import { classify } from '../src/core/route.ts'

/** Deterministic interaction fixture, explicitly labelled as a demo rather than model optimization. */
export const demoProvider: ModelProvider = {
  name: 'offline-demo',
  async generate({ input, signal }) {
    await new Promise<void>((resolve, reject) => {
      const abort = () => { clearTimeout(timer); reject(new Error('cancelled')) }
      const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve() }, 650)
      signal.addEventListener('abort', abort, { once: true })
      if (signal.aborted) abort()
    })
    const { raw, mode } = JSON.parse(input) as { raw: string; mode: string }
    const optimized = mode === 'light' ? `请${raw}` : `[任务] ${raw}\n[交付] 围绕上述目标组织结果，保持已有约束与任务范围。`
    return JSON.stringify({
      optimized, task_type: classify(raw),
      slots: { goal: raw, context: '', inputs: '', output_format: '', constraints: [], acceptance: [] },
      additions: [], unresolved: [],
    })
  },
}

/** Optional local preview provider. Real DSH installs use the host LLM service instead. */
export function compatibleProvider(): ModelProvider {
  const endpoint = process.env.BOOST_BASE_URL ?? 'https://api.deepseek.com'
  const model = process.env.BOOST_MODEL ?? 'deepseek-chat'
  return {
    name: model,
    async generate({ system, input, signal }) {
      const response = await fetch(`${endpoint.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST', signal,
        headers: { 'content-type': 'application/json', authorization: `Bearer ${process.env.BOOST_API_KEY}` },
        body: JSON.stringify({ model, messages: [{ role: 'system', content: system }, { role: 'user', content: input }], temperature: 0.2, max_tokens: 2000, stream: false }),
      })
      if (!response.ok) throw new Error('provider_error')
      const value = await response.json() as { choices?: { message?: { content?: string } }[] }
      const content = value.choices?.[0]?.message?.content
      if (typeof content !== 'string') throw new Error('provider_format_error')
      return content
    },
  }
}
