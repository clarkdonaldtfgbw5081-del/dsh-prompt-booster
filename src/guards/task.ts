import { taskClauses } from '../core/clauses.ts'
import { preferenceFamilies } from '../core/wording.ts'

/** Small, explicit wording families; not a general semantic-equivalence claim. */
const families = [
  ...preferenceFamilies,
  ['卡顿', '运行缓慢', '加载缓慢', '性能瓶颈', '性能问题'],
  ['周报', '每周工作总结', '本周工作总结'],
  ['网页', '页面', '界面'],
  ['故障', '报错', '异常', '错误'],
  ['说明', '文档', '指引'],
  ['摘要', '总结'],
  ['login', 'sign-in', 'sign in'],
  ['installation', 'install'],
  ['uninstall', 'uninstallation'],
  ['截图', '屏幕截图', '屏幕快照'],
  ['回滚', '恢复旧版'],
  ['日志', '运行记录'],
] as const

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
  const parts = taskClauses(raw)
    .map(part => part.target.replace(genericTarget, '').trim())
    .filter(part => part.length >= 2)
  if (parts.length < 2) return false
  const anchors = parts.map(part => taskAnchors(part, lexical))
  return anchors.some((values, index) => {
    const other = new Set(anchors.flatMap((row, otherIndex) => otherIndex === index ? [] : row))
    const distinct = values.filter(value => !other.has(value))
    return distinct.length > 0 && !distinct.some(value => matchesTaskAnchor(value, body))
  })
}
