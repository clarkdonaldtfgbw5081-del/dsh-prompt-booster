import type { BoostRequest, TaskType } from '../types.ts'
import { classify } from './route.ts'
import { taskClauses, type TaskClause } from './clauses.ts'
import { refinementLimit } from './refinement.ts'

export interface TaskIntent {
  task_type: TaskType
  stage: 'plan' | 'analysis' | 'execution' | 'answer'
  operation: 'create' | 'modify' | 'diagnose' | 'write' | 'research' | 'analyze' | 'explain'
  project: 'existing' | 'unspecified'
  page_kind: 'login' | 'dashboard' | 'portfolio' | 'commerce' | 'visual' | 'generic'
  is_page_task: boolean
  concise: boolean
  explicit_preferences: string[]
  guidance: string[]
  steps?: Pick<TaskClause, 'text' | 'action' | 'sequential'>[]
}

/** Lightweight hints, subordinate to the user's full text; never project facts. */
export function taskIntent(request: BoostRequest): TaskIntent {
  const raw = request.raw
  const task_type = classify(raw)
  const question = /^(?:请)?(?:解释|说明为什么|为什么|如何)|^(?:please\s+)?(?:explain|why\b|what (?:is|does)\b|how (?:to|do|can|should)\b)/i.test(raw.trim())
  const clauses = taskClauses(raw)
  const sequentialExecution = clauses.some((clause, index) => index > 0 && clause.sequential && ['create', 'modify', 'test'].includes(clause.action))
    || /(?:然后|再|之后|接着|then)\s*(?:直接)?(?:实现|开发|创建|生成|构建|搭建|修改|修复|测试|执行|编写|implement|develop|create|build|modify|fix|test|execute)/i.test(raw)
  const approvalGate = /(?:确认|批准|同意|批准|approval|confirmation).{0,12}(?:后|再|before|then)|(?:等我|待我|经我)|after (?:my |user )?(?:approval|confirmation)/i.test(raw)
  const plan = /只(?:给|做|要).{0,8}(?:方案|计划)|不要.{0,6}(?:代码|实现)|不(?:改|写|修改|编写|动)代码|(?:only|just) (?:a )?plan|do not (?:code|implement)/i.test(raw)
    || ((approvalGate || !sequentialExecution) && /先.{0,12}(?:方案|计划|设计思路)|plan first/i.test(raw))
  const analysis = /(?:只|仅).{0,8}(?:分析|排查|定位)|(?:analysis|diagnosis) only|only (?:analyze|diagnose)/i.test(raw)
    || ((approvalGate || !sequentialExecution) && /先.{0,8}(?:分析|排查|定位)/i.test(raw))
  const affirmative = raw.replace(/(?:不要|不得|禁止|不能|不允许|不新增|不修改|不改|不加|不做|无需|do not|don't|must not|never)[^\n，。；;.!?]*/gi, '')
  const modify = /修改|调整|优化|改进|新增|改造|重构|完善|加一个|加上|添加|modify|adjust|improve|refactor|\badd\b/i.test(affirmative)
  const project = /现有|已有|当前项目|这个项目|此项目|原有|existing|current project|this project/i.test(raw) ? 'existing' : 'unspecified'
  const stage = plan ? 'plan' : analysis ? 'analysis' : question || ['writing', 'research', 'analysis', 'other'].includes(task_type) ? 'answer' : 'execution'
  const operation: TaskIntent['operation'] = task_type === 'writing' ? 'write' : task_type === 'research' ? 'research'
    : task_type === 'analysis' ? 'analyze' : question ? 'explain' : task_type === 'debug' ? 'diagnose' : modify ? 'modify' : 'create'
  const page_kind: TaskIntent['page_kind'] = /登录|login|log in|sign in/i.test(raw) ? 'login'
    : /仪表盘|管理后台|后台页面|dashboard|admin panel/i.test(raw) ? 'dashboard'
    : /作品集|个人主页|portfolio/i.test(raw) ? 'portfolio'
    : /商城|商品|电商|commerce|product page|storefront/i.test(raw) ? 'commerce'
    : /风景|摄影|图片展示|视觉|landscape|photography|gallery/i.test(raw) ? 'visual' : 'generic'
  const explicit_preferences = [...new Set(raw.match(/高级感|极简|简约|活泼|正式|幽默|友好|深色|暗色|浅色|亮色|移动端|手机端|移动设备|桌面端|响应式|中文|英文|小学生|初学者|入门者|新手|专业读者/gi) ?? [])]
  const guidance: string[] = []
  if (task_type === 'writing') guidance.push('保留题材、读者、使用场景、语气与篇幅；润色、翻译和总结的对象不能变成软件开发任务；事实与数据不补造。')
  else if (task_type === 'debug') guidance.push('围绕原故障、已有证据、定位与验证组织请求；不假定根因已经查明，不顺带重构或更换框架。')
  else if (task_type === 'research') guidance.push('明确研究问题、比较维度、时间范围和证据要求；可建议结论组织方式，不编造引用或把调研改成实施。')
  else if (task_type === 'analysis') guidance.push('围绕数据口径、目标问题、结果解释与证据组织请求；缺少数据保持事实缺口，不捏造结论，不强加无关图表。')
  else if (question) guidance.push('保留提问性质，交付解释或建议，不能改成自动修改文件或执行操作。')
  else guidance.push('保留目标功能、风格与范围；把笼统形容转成与目标相关的要求，避免模板套话和额外业务功能。')
  if (project === 'existing' || operation === 'modify') guidance.push('沿用现有项目、结构和约定，聚焦用户要求的变更；没有读取项目，不声称已确认其技术栈或文件内容，不要求重建完整项目。')
  if (stage === 'plan' || stage === 'analysis') guidance.push('仅交付当前阶段的方案、分析或定位结论；不要附带本轮实施、改文件或交付完整源码的指令。')
  if (sequentialExecution && !approvalGate && stage === 'execution') guidance.push('保留用户要求的先分析或设计、再实施的顺序，不要截断为只给方案。')
  if (clauses.length > 1) guidance.push('逐项保留 steps 中的明确动作和对象；保持先后顺序及确认条件，不把参考内容或数据列表当成新任务。')
  return {
    task_type, stage, operation, project, page_kind,
    is_page_task: task_type === 'code_gen' && !question && !/脚本|函数|命令行|\b(?:script|function|cli)\b/i.test(raw)
      && /网页|页面|网站|落地页|\bpage\b|website|dashboard|portfolio/i.test(raw),
    concise: /一句话|不要啰嗦|不要扩写|简短(?:地)?(?:描述|说明|回答|改写)|精简(?:一下)?(?:提示词|文字|描述)|(?:提示词|描述|回答|说明|措辞).{0,8}(?:简短|精简|简洁)|(?:brief|concise) (?:prompt|description|answer|rewrite)|one sentence/i.test(raw)
      || (request.preferences?.detail === 'concise' && !/详细|全面|充分展开|详尽|in detail|detailed|thorough/i.test(raw)),
    explicit_preferences, guidance,
    ...(clauses.length > 1 ? { steps: clauses.map(({ text, action, sequential }) => ({ text, action, sequential })) } : {}),
  }
}

/** Only explicit prompt-length limits apply here, not the requested article length. */
export function textBudget(request: BoostRequest): number {
  const length = [...request.raw].length
  const normal = request.mode === 'light' ? Math.max(Math.ceil(length * 1.5), 80) : length < 80 ? 400 : length * 4
  const explicit = request.raw.match(/(?:提示词|优化后(?:的文字|的文本|的内容)?)[^，。；\n]{0,8}(?:不超过|最多|限于)\s*(\d+)\s*(?:字|字符)/)
  const limit = explicit ? Number(explicit[1]) : normal
  const concise = taskIntent(request).concise ? Math.max(100, Math.min(200, length * 2)) : normal
  return Math.min(30000, normal, limit > 0 ? limit : normal, concise, refinementLimit(request.raw) ?? Infinity)
}
