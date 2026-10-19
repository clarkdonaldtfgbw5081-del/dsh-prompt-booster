import type { BoostRequest, TaskType } from '../types.ts'

export function skipReason(request: BoostRequest): string | undefined {
  const text = request.raw.trim()
  if (!text) return 'empty_input'
  if (/^(你好|您好|谢谢|好的?|嗯|收到|继续|可以|ok|thanks|hello|continue)[！!。.\s]*$/i.test(text)) return 'conversational_input'
  // Slash commands are host actions, not prose to rewrite.
  if (/^\/[a-z][\w-]*(?:\s|$)/i.test(text)) return 'host_command'
  return undefined
}
export function classify(text: string): TaskType {
  if (/^(?:请|帮我|请帮我)?\s*(?:写|编写)(?:一个|一段|一份)?\s*(?:(?:Python|JavaScript|TypeScript|Java|Rust|Go|Shell)\s*)?(?:代码|脚本|函数|组件|程序|API|后端服务)|^(?:please\s+)?write\s+(?:a[n]?\s+)?(?:REST\s+)?(?:script|function|component|program|code|API|backend service)\b/i.test(text.trim())) return 'code_gen'
  // The requested action outranks technical words used as the writing subject.
  if (/^(?:请|帮我|请帮我)?\s*(?:写(?:一篇|一封|一份|一段|一则)|撰写|润色|改写|翻译|总结这|给.{0,8}写)|^(?:please\s+)?(?:write|rewrite|translate|polish|summarize)\b/i.test(text.trim())) {
    if (!/^(?:请|帮我|请帮我)?\s*写(?:一份)?\s*(?:代码|脚本|函数|组件)|^(?:please\s+)?write\s+(?:a\s+)?(?:script|function|component|program|code)\b/i.test(text.trim())) return 'writing'
  }
  if (/报错|异常|修复|排错|debug|traceback|bug|error/i.test(text)) return 'debug'
  // Creating software with a data store is still development, not data analysis.
  if (!/报告|文章|邮件|文案|\b(?:report|essay|email|article)\b/i.test(text)
    && /^(?:请|帮我|请帮我)?\s*(?:开发|实现|构建|生成|创建|做|设计|搭建|改造|优化|修改|完善).{0,60}(?:网页|页面|网站|应用|服务|接口|系统|软件|插件)|^(?:please\s+)?(?:build|implement|create|develop|design|modify)\b.{0,80}\b(?:app|application|website|page|service|api|backend|plugin)\b/i.test(text.trim())) return 'code_gen'
  if (/数据|统计|分析.*(?:表|销售|趋势)|csv|excel|dataset/i.test(text)) return 'analysis'
  if (/调研|研究|查找|查资料|检索|research|investigate/i.test(text)) return 'research'
  if (/文章|周报|文案|邮件|写作|总结|翻译|write|translate/i.test(text)) return 'writing'
  if (/网页|页面|网站|落地页|代码|插件|实现|开发|登录|组件|code|build|implement|\bpage\b|website|dashboard|portfolio/i.test(text)) return 'code_gen'
  return 'other'
}
