export type TaskAction = 'analyze' | 'modify' | 'create' | 'write' | 'translate' | 'test' | 'research'
const groups: Record<TaskAction, string> = {
  analyze: '分析|排查|定位|诊断|对比|analyze|analyse|diagnose|compare|inspect',
  modify: '修改|修复|调整|改进|优化|重构|fix|modify|adjust|improve|refactor|optimize',
  create: '实现|开发|创建|生成|搭建|构建|implement|develop|create|generate|build',
  write: '编写|撰写|补充|整理|输出|添加|总结|写|write|document|summarize|include|add',
  translate: '翻译|translate',
  test: '验证|测试|verify|test|validate',
  research: '研究|调研|检索|查找|research|investigate',
}
const verb = Object.values(groups).join('|')
const prefix = '(?:(?:请帮我|帮我|请|先|再|然后|接着|最后|please|first|then|finally)\\s*)*'
const start = new RegExp('^\\s*(?:[-*]|\\d+[.)、])?\\s*' + prefix + '(' + verb + ')(?=[\\u3400-\\u9fff\\s\\W]|$)', 'i')
const boundary = new RegExp('(?:[，,。；;\\n]+\\s*|(?:并且|同时|还要|以及|并|然后|接着|再|\\band\\b|\\bthen\\b)\\s*)(?=(?:[-*]|\\d+[.)、])?\\s*' + prefix + '(?:' + verb + '))', 'gi')
const opaque = /```[\s\S]*?```|`[^`\n]*`|"[^"\n]*"|'[^'\n]*'|“[^”]*”|「[^」]*」/g
export interface TaskClause { text: string; target: string; action: TaskAction; sequential: boolean }

/** Explicit action clauses only; conjunctions inside quoted data never become tasks. */
export function taskClauses(raw: string): TaskClause[] {
  const masked = raw.replace(opaque, value => ' '.repeat(value.length))
  const cuts = [...masked.matchAll(boundary)]
  const ranges = [{ from: 0, to: cuts[0]?.index ?? raw.length, sequential: false }, ...cuts.map((cut, i) => ({
    from: cut.index! + cut[0].length, to: cuts[i + 1]?.index ?? raw.length,
    sequential: /然后|接着|再|\bthen\b/i.test(cut[0]),
  }))]
  const clauses: TaskClause[] = []
  for (const range of ranges) {
    const text = raw.slice(range.from, range.to).trim()
    const match = start.exec(text)
    if (!match) continue
    const action = (Object.keys(groups) as TaskAction[]).find(key => new RegExp('^(?:' + groups[key] + ')$', 'i').test(match[1]))!
    clauses.push({ text, target: text.slice(match[0].length).trim(), action, sequential: range.sequential || /^(?:先|再|然后|first\b|then\b)/i.test(text) })
  }
  return clauses.slice(0, 12)
}
