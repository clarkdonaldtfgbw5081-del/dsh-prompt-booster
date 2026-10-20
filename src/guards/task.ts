/** Small, explicit wording families; not a general semantic-equivalence claim. */
const families = [
  ['卡顿', '运行缓慢', '加载缓慢', '性能瓶颈', '性能问题'],
  ['周报', '每周工作总结', '本周工作总结'],
  ['网页', '页面', '界面'],
  ['故障', '报错', '异常', '错误'],
  ['说明', '文档', '指引'],
  ['摘要', '总结'],
  ['login', 'sign-in', 'sign in'],
  ['installation', 'install'],
  ['uninstall', 'uninstallation'],
] as const

const action = '(?:编写|撰写|写|补充|整理|优化|调整|改进|实现|开发|创建|生成|修复|排查|分析|对比|研究|翻译|验证|测试|输出|添加|总结|write|build|create|add|include|fix|modify|improve|analyze|analyse|translate|compare|verify|test|document|summarize)'
const actionStart = new RegExp('^\\s*(?:(?:请帮我|帮我|请|先|再|please)\\s*)?' + action + '\\s*', 'i')
const connector = new RegExp('(?:[；;\\n]+|(?:并且|同时|还要|以及|并|\\band\\b|\\bthen\\b)\\s*)(?=' + action + ')', 'i')
const genericTarget = /说明|文档|指引|步骤|详情|流程|方案|\b(?:docs?|documentation|steps?|details|instructions?)\b/gi

function familyIds(text: string): string[] {
  const lower = text.toLowerCase()
  return families.flatMap((variants, index) => variants.some(term => /[a-z]/i.test(term)
    ? new RegExp('\\b' + term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i').test(lower)
    : lower.includes(term)) ? ['@family-' + index] : [])
}

export function taskAnchors(text: string, lexical: (value: string) => string[]): string[] {
  return [...new Set([...lexical(text), ...familyIds(text)])]
}

export function matchesTaskAnchor(anchor: string, body: string): boolean {
  return anchor.startsWith('@family-') ? familyIds(body).includes(anchor) : body.toLowerCase().includes(anchor)
}

/** Check only explicitly joined action clauses; data lists and quoted code are not split. */
export function missingTaskPart(raw: string, body: string, lexical: (value: string) => string[]): boolean {
  if (/```|`/.test(raw)) return false
  const parts = raw.split(connector).filter(part => actionStart.test(part))
    .map(part => part.replace(actionStart, '').replace(genericTarget, '').trim())
    .filter(part => part.length >= 2)
  if (parts.length < 2) return false
  const anchors = parts.map(part => taskAnchors(part, lexical))
  return anchors.some((values, index) => {
    const other = new Set(anchors.flatMap((row, otherIndex) => otherIndex === index ? [] : row))
    const distinct = values.filter(value => !other.has(value))
    return distinct.length > 0 && !distinct.some(value => matchesTaskAnchor(value, body))
  })
}
