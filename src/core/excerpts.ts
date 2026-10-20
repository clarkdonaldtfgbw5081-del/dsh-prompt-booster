const filler = new Set(['帮我', '这个', '根据', '当前', '项目', '一下', '进行', '需要', '要求', '修改', '优化', '文档', 'the', 'and', 'this', 'that', 'please', 'with'])
function terms(raw: string): string[] {
  const words: string[] = raw.toLowerCase().match(/[a-z][a-z\d_.-]{2,}/g) ?? []
  for (const run of raw.match(/[\u3400-\u9fff]+/g) ?? []) {
    for (let i = 0; i + 1 < run.length; i++) words.push(run.slice(i, i + 2))
  }
  return [...new Set(words)].filter(word => !filler.has(word)).slice(0, 100)
}
const safeSlice = (text: string, limit: number) => text.slice(0, /[\uD800-\uDBFF]/.test(text[limit - 1] ?? '') ? limit - 1 : limit)

/** Bounded lexical excerpts from explicitly selected text; never reads files or executes content. */
export function selectExcerpt(content: string, raw: string, budget = 6000): { content: string; ranges: string } {
  if (budget <= 0) return { content: '', ranges: '' }
  const lines = content.split(/\r?\n/)
  if (content.length <= budget) return { content, ranges: `L1-${lines.length}` }
  // A long minified line is windowed, so its suffix is not permanently invisible.
  const chunks: { text: string; line: number; score: number }[] = []
  const keywords = terms(raw)
  lines.forEach((line, index) => {
    for (let offset = 0; offset < Math.max(1, line.length);) {
      let end = Math.min(line.length, offset + 1000)
      if (end < line.length && /[\uD800-\uDBFF]/.test(line[end - 1])) end--
      const text = line.slice(offset, end)
      const lower = text.toLowerCase()
      chunks.push({ text, line: index + 1, score: keywords.reduce((score, term) => score + (lower.includes(term) ? (/[a-z]/i.test(term) ? 3 : 1) : 0), 0) })
      if (!line.length) break
      offset = end
    }
  })
  const chosen = new Set<number>()
  let remaining = budget
  const add = (index: number) => {
    const row = chunks[index]
    if (!row || chosen.has(index) || row.text.length + 1 > remaining) return
    chosen.add(index); remaining -= row.text.length + 1
  }
  // Keep a small document introduction, then reserve most of the budget for relevant passages.
  for (let i = 0, chars = 0; i < chunks.length && i < 8 && chars + chunks[i].text.length < Math.min(1000, budget / 4); i++) {
    add(i); chars += chunks[i].text.length + 1
  }
  const ranked = chunks.map((row, index) => ({ ...row, index })).filter(row => row.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
  for (const row of ranked) {
    add(row.index)
    for (const delta of [-1, 1, -2, 2]) add(row.index + delta)
    if (remaining < 100) break
  }
  if (!chosen.size) return { content: safeSlice(content, budget), ranges: 'prefix' }
  // Without matching passages, preserve the familiar prefix rather than sampling unrelated text.
  if (!ranked.length) return { content: safeSlice(content, budget), ranges: 'prefix' }
  const ordered = [...chosen].sort((a, b) => a - b)
  const ranges: string[] = []
  const pieces: string[] = []
  for (let position = 0; position < ordered.length; position++) {
    const index = ordered[position]
    const previous = ordered[position - 1]
    if (previous !== undefined && previous + 1 !== index) pieces.push('')
    pieces.push(chunks[index].text)
    const line = 'L' + chunks[index].line
    if (ranges.at(-1) !== line) ranges.push(line)
  }
  return { content: safeSlice(pieces.join('\n'), budget), ranges: ranges.length > 12 ? `${ranges.slice(0, 6).join(',')}…${ranges.slice(-6).join(',')}` : ranges.join(',') }
}
