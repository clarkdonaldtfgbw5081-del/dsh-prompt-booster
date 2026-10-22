/** Extract HTTP references separately so their slashes cannot become local paths. */
export function httpReferences(raw: string): { values: string[]; withoutUrls: string } {
  const values: string[] = []
  const withoutUrls = raw.replace(/https?:\/\/[^\s<>"'`，。；！？（）【】]+/gi, (match: string, offset: number) => {
    let value = match.replace(/[.,;!]+$/, '')
    // Strip prose/Markdown closing brackets, but retain balanced URL parentheses.
    for (const [open, close] of [['(', ')'], ['[', ']']]) {
      while (value.endsWith(close) && value.split(close).length > value.split(open).length) value = value.slice(0, -1)
    }
    const preceding = raw[offset - 1]
    const delimited = preceding === '<' || preceding === '`' || preceding === '"' || preceding === "'"
      || (preceding === '(' && raw[offset - 2] === ']')
    if (!delimited) {
      // Only split explicit request phrasing glued to an ASCII path segment.
      // Arbitrary Unicode URL paths remain opaque; ambiguous text stays protected.
      const boundary = value.search(/(?<=[A-Za-z0-9_%~-])(?=(?:读取|阅读|查看|分析|研究|评估)(?:一下|这个|该|此)|(?:请|帮我)(?:读取|阅读|查看|分析|研究|评估))/u)
      if (boundary >= 0) value = value.slice(0, boundary)
    }
    values.push(value)
    return ' '.repeat(value.length) + match.slice(value.length)
  })
  return { values, withoutUrls }
}
