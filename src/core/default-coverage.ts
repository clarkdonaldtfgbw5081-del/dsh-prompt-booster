import type { DefaultChoice } from './defaults.ts'
import { positiveRequirements } from './strategy.ts'

/** Recognize only the central content of our own fixed defaults. Never grants arbitrary facts. */
export function rendersDefault(choice: DefaultChoice, body: string): boolean {
  if (body.includes(choice.value)) return true
  body = positiveRequirements(body)
  const all = (...patterns: RegExp[]) => patterns.every(pattern => pattern.test(body))
  if (choice.category === 'tech_stack') {
    const conditional = /默认|独立新|新建|新项目|default|standalone|new (?:interactive )?(?:site|project)|if\b/i
    if (/React.*Vite/.test(choice.value)) return all(/\bReact\b/i, /\bVite\b/i, conditional)
    if (/HTML\/CSS\/JavaScript/.test(choice.value)) return all(/\bHTML\b/i, /\bCSS\b/i, /\bJavaScript\b/i, conditional)
    return false
  }
  if (choice.category === 'assets') return all(/主题|themed?/i, /占位图|placeholder/i)
  if (choice.category === 'page_modules') {
    if (/登录表单|login form/i.test(choice.value)) return all(/登录|login|sign.in/i, /表单|form/i, /输入|input/i, /反馈|feedback/i)
    if (/主题主视觉|visual hero/i.test(choice.value)) return all(/主视觉|hero/i, /展示|display/i, /介绍|introduction/i)
    if (/核心目标|page goal/i.test(choice.value)) return all(/核心目标|page goal/i, /内容|content/i, /操作|actions?/i, /层次|组织|arrang|organi[sz]/i)
    return false
  }
  if (choice.category === 'delivery') {
    if (/默认实施|Default workflow/i.test(choice.value)) return all(/页面|交互|pages?|interactions?/i, /原型|prototype/i, /数据|data/i, /验证|检查|test/i, /源码|source/i, /运行|run/i)
    if (/页面完整源码|page source/i.test(choice.value)) return all(/源码|source/i, /本地|local/i, /运行|run/i, /说明|instructions?/i)
  }
  return false
}
