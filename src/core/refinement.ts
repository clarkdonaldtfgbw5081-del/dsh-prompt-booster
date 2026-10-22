/** Recognize existing structure, not semantic completeness: only limit further expansion. */
export function hasTaskStructure(raw: string): boolean {
  const defaults = raw.match(/(?:默认(?:技术路线|工具|页面结构|素材|交付|实施)[：:]|Default (?:stack|tools|layout|assets|delivery|workflow|approach):)/gi) ?? []
  const fields = new Set((raw.match(/(?:^|\n)\s*(?:#{1,3}\s*)?(目标|要求|约束|交付|验收|Goal|Requirements|Constraints|Deliverables|Acceptance)\s*[：:]/gim) ?? []).map(field => field.toLowerCase().replace(/[#\s:：]/g, '')))
  return defaults.length >= 1 || fields.size >= 3
}

export function refinementLimit(raw: string): number | undefined {
  if (!hasTaskStructure(raw)) return undefined
  const length = [...raw].length
  return length + Math.min(40, Math.ceil(length * 0.1))
}
