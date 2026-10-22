import type { BoostRequest, Candidate } from '../types.ts'
import { taskIntent, textBudget } from './intent.ts'
import { solutionStrategy } from './strategy.ts'
import { taskDefaults } from './task-defaults.ts'
import { hasTaskStructure } from './refinement.ts'
import { rendersDefault } from './default-coverage.ts'

export const defaultCategories = ['tech_stack', 'page_modules', 'assets', 'delivery'] as const
export type DefaultCategory = typeof defaultCategories[number]
export interface DefaultChoice { category: DefaultCategory; value: string }

/** Product defaults are proposed choices, never facts inferred about a project. */
export function defaultChoices(request: BoostRequest): DefaultChoice[] {
  const raw = request.raw
  const intent = taskIntent(request)
  if (request.reference_fragments?.length || request.preferences?.fillDefaults === false || request.mode !== 'standard' || intent.concise || hasTaskStructure(raw)
    || /(?:不要|不允许|禁止).{0,8}(?:自行|自动).{0,8}(?:补充|设定|假设)|仅润色|只润色|不要扩写|仅输出|只输出|do not (?:add|assume)|no assumptions|output only/i.test(raw)) return []
  if (!intent.is_page_task) return fitChoices(request, taskDefaults(request, intent))
  if (intent.operation === 'modify' || intent.project === 'existing' || intent.stage === 'analysis'
    || /(?:排查|报错|修复|为什么|分析现有|fix|debug|why|review)/i.test(raw)) return []
  const en = request.language === 'en'
  const strategy = solutionStrategy(request)
  const dynamic = /动态(?:网站|网页)|交互式(?:网站|网页)|\bdynamic (?:website|site|page)\b/i.test(raw)
  const choices: DefaultChoice[] = []
  const evidence = [raw, ...request.context_sources.map(source => source.content)].join('\n')
  if (!/\b(?:react|vue|angular|svelte|html|css|javascript|typescript|next\.?js|nuxt|astro|flutter|jquery|tailwind|python|django|flask|rust|java|kotlin|swift|php|go|architect|aws|serverless)\b|技术栈.{0,8}(?:待定|稍后|另定)|框架.{0,8}(?:待定|稍后|另定)/i.test(evidence)) {
    choices.push({ category: 'tech_stack', value: dynamic && !/不新增依赖|不加依赖|不用框架|原生|no new dependenc|without (?:new )?dependenc|no framework/i.test(raw)
      ? en ? 'Default tools: reuse the stack; for a new interactive site use React and Vite. Choose server and storage tools only as needed.'
        : '默认工具：沿用已有技术栈；新建交互网站采用 React 与 Vite。服务端或存储工具按实际数据需求再选择。'
      : en
      ? strategy.profile === 'application' ? 'Default approach: reuse project conventions; choose only the components needed for the requested application and verify locally.' : 'Default stack: reuse the project stack; for a standalone page use HTML/CSS/JavaScript without new dependencies.'
      : strategy.profile === 'application' ? '默认技术路线：优先沿用项目约定，仅选择本次应用所需的组件，并在本地验证。' : '默认技术路线：优先沿用现有项目；独立新页面采用原生 HTML/CSS/JavaScript，不新增依赖。' })
  }
  if (!/导航|首屏|轮播|卡片|列表|表单|页脚|介绍|空白|按钮|输入框|弹窗|组件|模块.{0,8}(?:待定|稍后|另定)|navigation|hero|carousel|cards|form|footer|gallery|introduction|blank|button|component|modal/i.test(raw)) {
    const layouts: Record<typeof intent.page_kind, [string, string]> = {
      login: ['默认页面结构：登录表单、输入说明与提交反馈。', 'Default layout: login form, input guidance and submission feedback.'],
      dashboard: ['默认页面结构：围绕管理目标组织数据展示与必要操作，字段和指标以已有定义为准。', 'Default layout: management data and necessary controls; use supplied field and metric definitions.'],
      portfolio: ['默认页面结构：个人简介、作品展示与联系入口，真实资料由用户提供。', 'Default layout: introduction, selected work and contact links, using supplied personal details.'],
      commerce: ['默认页面结构：商品展示与详情区域，价格和库存采用真实资料或明确占位。', 'Default layout: product display and details, with real or clearly placeholder prices and stock.'],
      visual: ['默认页面结构：主题主视觉、内容展示与简短介绍。', 'Default layout: a visual hero, themed content display and a brief introduction.'],
      generic: ['默认页面结构：围绕页面核心目标安排主要内容与必要操作，保持层次清晰。', 'Default layout: primary content and necessary actions arranged around the page goal.'],
    }
    choices.push({ category: 'page_modules', value: layouts[intent.page_kind][en ? 1 : 0] })
  }
  if (!dynamic && strategy.profile !== 'application' && !['login', 'dashboard'].includes(intent.page_kind) && !/图片|素材|照片|插图|纯文字|无图|只有|仅|只要|image|asset|photo|illustration|text.only|only/i.test(raw)) {
    choices.push({ category: 'assets', value: en
      ? 'Default assets: replaceable themed placeholders; use supplied or licensed images when available.'
      : '默认素材：使用契合主题的可替换占位图；有用户素材时优先采用，否则选择授权可用图片。' })
  }
  if (!/交付|源码|源代码|单文件|完整代码|可运行|下载|截图|仅输出|只输出|deliver|source code|single.file|screenshot|output only/i.test(raw)) {
    const plan = intent.stage === 'plan'
    const delivery = dynamic && intent.stage !== 'plan'
      ? en ? 'Default workflow: map pages and interactions, build a prototype, connect required data and test loading, failures and screen sizes; deliver source and run instructions.'
        : '默认实施：梳理页面与交互，搭建可运行原型，按需接入数据，再检查加载状态、失败反馈和不同屏幕尺寸；交付源码与本地运行说明。'
      : strategy.specialist === 'architect'
      ? en
        ? plan ? 'Default delivery: a plan covering required resources, module boundaries and local sandbox verification; no implementation in this round.' : 'Default delivery: required source, resource definitions and local sandbox verification instructions.'
        : plan ? '默认交付：方案包含本次所需资源清单、模块边界与本地沙箱验证方法，本轮不实施。' : '默认交付：本次所需源码、资源清单与本地沙箱验证说明。'
      : en
      ? plan ? 'Default delivery: a design plan and implementation steps only.' : strategy.profile === 'application' ? 'Default delivery: source for the requested application and local verification instructions.' : 'Default delivery: page source and local run instructions.'
      : plan ? '默认交付：设计方案与实施步骤，本轮不实施。' : strategy.profile === 'application' ? '默认交付：本次应用所需源码与本地验证说明。' : '默认交付：页面完整源码及本地运行说明。'
    choices.push({ category: 'delivery', value: delivery })
  }
  const priority = ['tech_stack', 'delivery', 'page_modules', 'assets']
  return fitChoices(request, dynamic ? choices.sort((a, b) => priority.indexOf(a.category) - priority.indexOf(b.category)) : choices)
}

function fitChoices(request: BoostRequest, choices: DefaultChoice[]): DefaultChoice[] {
  // Short requests should stay short. No mandatory template may consume the
  // space needed to preserve the user's actual goal and constraints.
  const available = Math.max(0, textBudget(request) - [...request.raw].length - 24)
  let used = 0
  return choices.filter(choice => {
    const cost = [...choice.value].length + 1
    if (used + cost > available) return false
    used += cost; return true
  })
}

/** Complete missing choices deterministically if the model only rephrased the task. */
export function completeDefaults(request: BoostRequest, candidate: Candidate, appendMissing = true): Candidate {
  const choices = defaultChoices(request)
  if (!choices.length) return candidate
  let optimized = candidate.optimized
  const additions = [...candidate.additions]
  const appliedChoices: DefaultChoice[] = []
  for (const choice of choices) {
    const covered = rendersDefault(choice, optimized)
    if (!appendMissing && !covered) continue
    if (!covered && [...optimized].length + [...choice.value].length + 1 > textBudget(request)) continue
    if (!covered) optimized += `\n${choice.value}`
    appliedChoices.push(choice)
    if (!additions.some(addition => addition.kind === 'default_assumption' && addition.category === choice.category && addition.value === choice.value)) {
      let id = `default-${choice.category}`
      while (additions.some(addition => addition.id === id)) id += '-auto'
      additions.push({ id, kind: 'default_assumption', category: choice.category, value: choice.value, action: 'included' })
    }
  }
  // Remove only closed-form routine placeholders, never mixed factual questions.
  const resolved = new Set(appliedChoices.map(choice => choice.category))
  const routinePlaceholder = (text: string): boolean => {
    if (request.raw.includes(text.trim()) || !/未指定|未确定|未明确|待定|unspecified|not specified/i.test(text)) return false
    const groups: [DefaultCategory, RegExp][] = [
      ['tech_stack', /技术栈|框架|stack|framework/gi],
      ['page_modules', /页面模块|页面结构|页面内容|page modules|layout/gi],
      ['assets', /素材来源|图片来源|素材|assets|image source/gi],
      ['delivery', /交付形式|交付方式|交付内容|交付|delivery/gi],
    ]
    let rest = text, found = false
    for (const [category, pattern] of groups) {
      if (pattern.test(text)) { if (!resolved.has(category)) return false; found = true }
      rest = rest.replace(pattern, '')
    }
    rest = rest.replace(/具体|当前|所需|尚|均|仍|未指定|未确定|未明确|待定|保持|the|and|are|is|unspecified|not specified/gi, '').replace(/[\s、，,。.!！？?;；和及与]/g, '')
    return found && rest.length === 0
  }
  optimized = optimized.split(/(?<=[。！？\n])/u).filter(part => !routinePlaceholder(part)).join('').trim()
  const unresolved = candidate.unresolved.filter(item => !routinePlaceholder(item))
  return { ...candidate, optimized, additions, unresolved }
}
