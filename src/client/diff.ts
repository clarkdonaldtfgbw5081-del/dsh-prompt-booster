export interface DiffPart { kind: 'same' | 'add' | 'remove'; text: string }
/** Character-level LCS with a bounded matrix; large documents fall back to a coarse, correct diff. */
export function diffText(before: string, after: string): DiffPart[] {
  if (before === after) return [{ kind: 'same', text: before }]
  const a = [...before], b = [...after]
  if (a.length * b.length > 2_000_000) return [{ kind: 'remove', text: before }, { kind: 'add', text: after }]
  const width = b.length + 1, table = new Uint32Array((a.length + 1) * width)
  for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--)
    table[i * width + j] = a[i] === b[j] ? 1 + table[(i + 1) * width + j + 1] : Math.max(table[(i + 1) * width + j], table[i * width + j + 1])
  const parts: DiffPart[] = []
  const push = (kind: DiffPart['kind'], text: string): void => {
    const last = parts.at(-1)
    if (last?.kind === kind) last.text += text
    else parts.push({ kind, text })
  }
  let i = 0, j = 0
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) { push('same', a[i++]); j++ }
    else if (j < b.length && (i === a.length || table[i * width + j + 1] >= table[(i + 1) * width + j])) push('add', b[j++])
    else push('remove', a[i++])
  }
  return parts
}
