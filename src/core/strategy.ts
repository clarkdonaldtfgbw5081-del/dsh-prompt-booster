import type { BoostRequest } from '../types.ts'
import { taskIntent } from './intent.ts'

/** Original selection rules informed by Architect's manifest/local-development docs.
 * https://arc.codes/docs/en/get-started/project-manifest
 * https://arc.codes/docs/en/guides/developer-experience/local-development
 * No upstream code, remote instructions, or CLI commands are executed here.
 */
export interface SolutionStrategy {
  profile: 'general' | 'explanation' | 'diagnosis' | 'existing-change' | 'page' | 'application' | 'software'
  stage: ReturnType<typeof taskIntent>['stage']
  specialist?: 'architect'
  capabilities: ('interface' | 'persistence' | 'background' | 'realtime' | 'deployment')[]
  guidance: string[]
}

// Signals are hints for selecting guidance, never authority to add features.
export function positiveRequirements(raw: string): string {
  return raw.replace(/(?:不要|不得|禁止|不能|不允许|不需要|无需|不做|不加|不用|不使用|不新增|do not|don't|must not|without|no\b|never)[^\n，。；;.!?]*/gi, '')
}

export function solutionStrategy(request: BoostRequest): SolutionStrategy {
  const intent = taskIntent(request)
  const base: SolutionStrategy = { profile: 'general', stage: intent.stage, capabilities: [], guidance: [] }
  if (request.mode === 'light' || ['writing', 'research', 'analysis'].includes(intent.task_type)) return base
  const positive = positiveRequirements(request.raw)
  const software = ['code_gen', 'debug'].includes(intent.task_type)
    || /\b(?:architect|@architect\/architect)\b|app\.arc|后端|架构|软件|接口|\b(?:backend|software|api)\b/i.test(positive)
  if (!software) return base
  if (intent.operation === 'explain') return { ...base, profile: 'explanation', guidance: ['交付概念、适用条件或取舍说明；保留问题性质，不改成创建项目或运行命令。'] }

  const capabilities: SolutionStrategy['capabilities'] = []
  if (/接口|路由|后端|\b(?:api|http|backend|endpoint|routes?)\b/i.test(positive)) capabilities.push('interface')
  if (/数据库|持久化|保存.{0,8}(?:数据|记录)|存储.{0,8}(?:数据|记录)|\b(?:database|persistence|persist|storage)\b/i.test(positive)) capabilities.push('persistence')
  if (/异步任务|后台任务|定时任务|消息队列|\b(?:queues?|scheduled|background jobs?|async tasks?)\b/i.test(positive)) capabilities.push('background')
  if (/实时通信|实时推送|即时通讯|\b(?:websocket|realtime|real.time)\b/i.test(positive)) capabilities.push('realtime')
  if (/部署|发布上线|\b(?:deploy|deployment|production release)\b/i.test(positive)) capabilities.push('deployment')
  const specialist = /@architect\/architect|app\.arc|(?:使用|采用|沿用|基于|用)\s*Architect\b|\b(?:use|using|with)\s+Architect\b|\bArchitect\s*(?:项目|应用|框架|网站|服务|接口|路由|配置|project|app|framework|website|service|routes?|config)/i.test(positive) ? 'architect' as const : undefined
  const profile: SolutionStrategy['profile'] = intent.task_type === 'debug' ? 'diagnosis'
    : intent.project === 'existing' || intent.operation === 'modify' ? 'existing-change'
    : capabilities.some(capability => capability !== 'deployment') || specialist ? 'application'
    : intent.is_page_task ? 'page' : 'software'
  const guidance = [
    '只为当前任务选择满足约束的最小方案；明确指定的技术优先，现有项目沿用约定，缺少项目资料时不宣称已确认。只选择与目标有关的做法，不把候选能力清单复制成需求。',
  ]
  if (profile === 'page') guidance.push('独立展示页面优先简洁可运行的页面方案；没有后端或持久化需求，不增加服务、数据库或云资源。')
  if (profile === 'application') guidance.push('围绕用户明确需要的能力划分模块、输入输出与数据边界，说明如何在本地验证；只为本次功能选择必要组件，不把静态页面方案当成完整服务方案。')
  if (profile === 'existing-change') guidance.push('把改动限定在目标模块及必要关联处；先依据提供的项目约定定位影响范围，不要求重新初始化项目或迁移技术栈。')
  if (profile === 'diagnosis') guidance.push('按复现证据、相关配置与模块边界定位问题，再验证修复；不增加初始化、部署或无关架构重构任务。')
  if (capabilities.includes('interface')) guidance.push('接口相关请求可明确输入输出、失败反馈与验证方式；不编造路径、字段或协议细节。')
  if (capabilities.includes('persistence')) guidance.push('持久化相关请求可明确数据来源、读写边界及失败处理；不编造表名、业务字段或现有数据。')
  if (capabilities.includes('background')) guidance.push('后台任务相关请求可说明触发条件、失败处理与重复执行的处理方式；不凭空指定运行周期、队列或平台。')
  if (capabilities.includes('realtime')) guidance.push('实时通信相关请求可明确连接、消息与断连后的行为；不增加用户未要求的通信功能。')
  if (specialist) guidance.push('用户明确提到的开发框架可采用项目清单描述所需资源，使清单、处理逻辑与本地沙箱验证保持一致；只定义本次需要的资源，不照搬示例中的全部资源。依据实际提供的版本与配置核对兼容性，不凭空给出版本或命令。')
  if (capabilities.includes('deployment')) guidance.push('仅在用户要求的交付阶段包含部署工作；涉及发布时区分验证环境与目标环境，不把方案讨论变成实际发布。')
  if (['plan', 'analysis'].includes(intent.stage)) guidance.push('本轮仅输出方案或分析；模块划分和验证方法写成计划，不指令本轮改文件、执行或部署。')
  guidance.push('改写正文只留下最有帮助的方案选择和必要验收点，不输出策略标签、内部检查表或思考过程；遵守原稿篇幅和禁止项。')
  return { profile, stage: intent.stage, ...(specialist ? { specialist } : {}), capabilities, guidance }
}
