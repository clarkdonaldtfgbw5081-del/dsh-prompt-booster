import { candidateSchema, type BoostRequest, type Candidate } from '../types.ts'
import { defaultChoices } from '../core/defaults.ts'
import { taskIntent, textBudget } from '../core/intent.ts'
import { classify } from '../core/route.ts'
import { positiveRequirements } from '../core/strategy.ts'
import { taskAnchors, matchesTaskAnchor, missingTaskPart } from './task.ts'
import { preservesPreference } from '../core/wording.ts'

export const codepoints = (text: string): number => [...text].length
const unique = (values: string[]): string[] => [...new Set(values)]
const numbers = (text: string): string[] => text.match(/[-+]?\d+(?:\.\d+)*(?:%|ms|秒|分钟|小时|天|字|个|页|MB|GB)?/g) ?? []
const technologies = new Set(['react', 'vue', 'angular', 'svelte', 'python', 'tailwind', 'typescript', 'javascript', 'node', 'nodejs', 'npm', 'pnpm', 'django', 'flask', 'fastapi', 'docker', 'redis', 'mysql', 'postgresql', 'sqlite', 'mongodb', 'openai', 'deepseek', 'dsh', 'api', 'sdk', 'html', 'css', 'sql', 'rust', 'java', 'kotlin', 'swift', 'stripe', 'firebase', 'architect', 'aws', 'serverless', 'lambda', 'dynamodb', 'cloudformation'])
const proseLabels = new Set([
  'please', 'task', 'goal', 'output', 'requirements', 'context', 'acceptance', 'build', 'implement', 'create', 'fix', 'write',
  'analyze', 'research', 'use', 'keep', 'do', 'dont', 'only', 'the', 'a', 'an', 'i', 'we', 'you', 'deliver', 'return',
  'provide', 'explain', 'include', 'avoid', 'preserve', 'based', 'make', 'add',
  // English prose starts every sentence with a capital letter, so real model rewrites
  // begin sentences with imperative verbs and connectives (Specify, Then, Diagnose,
  // Cover, Summarize…). Treating those as new entities rejected valid rewrites in
  // DeepSeek live evaluation; listed words are generic prose, never product entities.
  'specify', 'then', 'also', 'finally', 'first', 'second', 'third', 'next', 'lastly', 'however', 'therefore', 'optionally',
  'note', 'important', 'tip', 'warning', 'example', 'examples', 'summary', 'notes', 'steps', 'step', 'approach', 'solution',
  'problem', 'cause', 'diagnosis', 'evidence', 'assumptions', 'assumption', 'risks', 'tradeoffs', 'tradeoff', 'metrics',
  'criteria', 'success', 'definition', 'done', 'plan', 'scope', 'verification', 'validation', 'testing', 'tests', 'test',
  'deliverables', 'deliverable', 'constraints', 'requirement', 'inputs', 'input', 'outputs', 'goals',
  'ensure', 'identify', 'gather', 'verify', 'inspect', 'reproduce', 'locate', 'interpret', 'cite', 'follow', 'describe',
  'outline', 'compare', 'list', 'check', 'confirm', 'measure', 'report', 'document', 'update', 'remove', 'replace',
  'refactor', 'change', 'modify', 'adjust', 'improve', 'optimize', 'design', 'develop', 'generate', 'produce', 'draft',
  'polish', 'translate', 'summarize', 'cover', 'diagnose', 'debug', 'review', 'assess', 'evaluate', 'determine', 'clarify',
  'define', 'handle', 'resolve', 'address', 'focus', 'limit', 'maintain', 'support', 'guarantee', 'allow', 'prevent',
  'enable', 'disable', 'configure', 'consider', 'run', 'start', 'stop', 'open', 'close', 'select', 'choose', 'read', 'show',
  'tell', 'ask', 'answer', 'respond', 'discuss', 'organize', 'structure', 'format', 'present', 'share', 'send', 'save',
  'store', 'load', 'fetch', 'request', 'apply', 'account', 'match', 'align', 'prioritize', 'mention', 'illustrate',
])
interface IdentifierToken { token: string; index: number }

function identifierTokens(text: string): IdentifierToken[] {
  const tokens: IdentifierToken[] = []
  for (const match of text.matchAll(/[A-Za-z_$][A-Za-z\d_$]*(?:[./:@+-][A-Za-z\d_$-]+)*/g)) {
    const token = match[0]
    if (technologies.has(token.toLowerCase()) || /[._$/:@+\d-]/.test(token)
      || (/[A-Z]/.test(token) && token.length > 1 && !proseLabels.has(token.toLowerCase()))) {
      tokens.push({ token, index: match.index ?? 0 })
    }
  }
  return tokens
}
const identifiers = (text: string): string[] => identifierTokens(text).map(({ token }) => token)

/** True when the token begins the text, a sentence, a heading or a list item. */
function isSentenceStart(text: string, index: number): boolean {
  const before = text.slice(0, index)
  return /(?:^|[.!?;:•*#-]|\d[.)、])\s*$/.test(before) || /\n\s*$/.test(before)
}

/**
 * Entity-shaped tokens carry their own authority: known technologies, anything with a
 * separator/digit, internal capitals (JWT, OAuth, TypeScript) or an all-caps acronym.
 * A bare capitalised word has no such marker.
 */
function isStrongIdentifier(token: string): boolean {
  return technologies.has(token.toLowerCase()) || /[._$/:@+\d-]/.test(token)
    || /[A-Z]/.test(token.slice(1)) || /^[A-Z]{2,}$/.test(token)
}

/**
 * Words that carry no task identity on their own. The replacement check only
 * needs one surviving anchor, so this list stays conservative: dropping a word
 * can only make an unrelated rewrite easier to catch, while a task noun that is
 * wrongly dropped could turn a legitimate paraphrase into a false rejection.
 * Measure words, pronouns, connectives, modal verbs and bare creation verbs are
 * safe to drop; concrete nouns (页面/登录/报错/数据/文章/接口…) are never listed.
 */
const genericBigrams = new Set([
  // address, politeness and pronouns
  '请你', '请帮', '请问', '帮我', '帮忙', '给我', '我的', '我们', '你们', '他们', '她们', '咱们', '麻烦', '谢谢',
  // demonstratives, measure words and quantifiers
  '一个', '一份', '一段', '一篇', '一封', '一则', '一项', '一种', '一些', '一下', '一点', '这个', '那个',
  '这些', '那些', '这样', '那样', '这种', '那种', '这边', '那边', '本次', '这次', '一次',
  // conjunctions, adverbs and modal verbs
  '然后', '接着', '随后', '之后', '之前', '同时', '首先', '其次', '最后', '以及', '并且', '而且', '但是',
  '不过', '因为', '所以', '如果', '那么', '就是', '还是', '或者', '另外', '已经', '现在', '目前', '当前',
  '可以', '需要', '应该', '可能', '必须', '尽量', '不要', '不得', '不能', '无需', '没有', '是否', '先给',
  // generic request verbs that identify no subject
  '实现', '开发', '创建', '构建', '生成', '制作', '完成', '进行', '使用', '采用', '提供', '支持', '保持',
  '建议', '尝试', '作为', '用于', '关于', '对于', '根据', '按照',
])

const englishStopwords = new Set([
  // articles, pronouns, prepositions and connectives
  'the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'any', 'can', 'had', 'her', 'was', 'one', 'our',
  'out', 'get', 'has', 'him', 'his', 'how', 'new', 'now', 'old', 'see', 'two', 'way', 'who', 'did', 'its',
  'let', 'put', 'say', 'she', 'too', 'use', 'that', 'with', 'have', 'this', 'will', 'your', 'from', 'they',
  'know', 'want', 'been', 'good', 'much', 'some', 'time', 'very', 'when', 'come', 'here', 'just', 'like',
  'long', 'make', 'many', 'more', 'only', 'over', 'such', 'take', 'than', 'them', 'well', 'were', 'what',
  'work', 'down', 'even', 'give', 'most', 'once', 'also', 'back', 'after', 'first', 'into', 'other',
  'these', 'those', 'which', 'where', 'while', 'whose', 'whom', 'why', 'their', 'there', 'would', 'could',
  'should', 'does', 'each', 'about', 'above', 'again', 'against', 'because', 'before', 'below', 'between',
  'both', 'during', 'further', 'same', 'through', 'under', 'until', 'nor', 'yet',
  // generic task verbs and request scaffolding
  'please', 'task', 'goal', 'output', 'requirements', 'context', 'acceptance', 'build', 'implement', 'create',
  'fix', 'write', 'analyze', 'research', 'keep', 'deliver', 'return', 'provide', 'explain', 'include',
  'avoid', 'preserve', 'based', 'add', 'help', 'need', 'want', 'give', 'via', 'using',
])

/**
 * Task anchors: adjacent CJK bigrams (generic words removed) plus English content
 * words of at least three letters (stopwords removed). They are deliberately
 * coarse; the caller only rejects a rewrite when *none* of them survives.
 */
export function intentAnchors(raw: string): string[] {
  const anchors: string[] = []
  for (const run of raw.match(/[\u3400-\u9fff]+/g) ?? []) {
    for (let index = 0; index + 1 < run.length; index++) {
      const bigram = run.slice(index, index + 2)
      if (!genericBigrams.has(bigram)) anchors.push(bigram)
    }
  }
  for (const word of raw.toLowerCase().match(/[a-z][a-z0-9_-]*/g) ?? []) {
    if (word.length >= 3 && !englishStopwords.has(word)) anchors.push(word)
  }
  return unique(anchors)
}

/** Require at least one anchor; raw text with no anchors (emoji, digits) passes. */
function preservesTaskIntent(raw: string, body: string): boolean {
  const anchors = taskAnchors(raw, intentAnchors)
  if (!anchors.length) return true
  const normalized = body.toLowerCase()
  return anchors.some(anchor => matchesTaskAnchor(anchor, normalized))
}

/** Keep exact spans for constraints and opaque references; rules are deliberately conservative. */
export function protectedFragments(raw: string): string[] {
  return unique([
    ...(raw.match(/```[\s\S]*?```|`[^`\n]+`/g) ?? []),
    ...(raw.match(/(?:[A-Za-z]:[\\/]|\.{0,2}\/)[^\s，。；;！？!?"<>]+/g) ?? []),
    ...raw.split(/[，。；;！!？?\n]/).map(s => s.trim()).filter(s =>
      /不要|不得|禁止|不能|不允许|不新增|不修改|不改|不添加|不加入|不使用|不需要|不加|不做|无需|不超过|不低于|仅|只(?:给|做|要|输出|修改|使用)|先.{0,12}(?:方案|分析|计划)|do not|don't|must not|only|no new|at most|at least/i.test(s)),
  ]).filter(Boolean)
}

const scopeWords = [
  '注册', '短信验证', '第三方登录', '权限系统', '支付', '自动部署', '上线', '删除数据库', '部署到生产',
  '扫码登录', '微信登录', '手机号登录', '验证码', '单点登录', '找回密码', '角色权限', '会员积分', '优惠券',
  '订阅', '消息通知', '邮件通知', '多语言', '国际化', '审计日志',
  'install dependencies', 'deploy to production',
  'oauth', 'sso', 'mfa', 'signup', 'registration', 'payment', 'subscription',
]

/** ASCII scope terms match whole words so unrelated prose (e.g. "associate") does not hit "sso". */
function mentionsScope(body: string, word: string): boolean {
  if (/^[a-z][a-z ]*$/.test(word)) {
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    return new RegExp('(?:^|[^a-z])' + escaped + '(?:[^a-z]|$)').test(body)
  }
  return body.includes(word)
}

function preservesPhase(fragment: string, body: string): boolean {
  const phase = fragment.match(/^(?:先|只|仅)(?:给|给出|提供|输出|做|要)?(?:设计)?(方案|分析|计划)$/)
  if (!phase) return false
  // This narrow allowance only covers a bare delivery-stage instruction. It
  // cannot waive a named object, prohibition, code span, number or file path.
  return new RegExp('(?:先|只|仅|本轮)[^，。；;\\n]{0,20}' + phase[1]).test(body)
}

export function parseCandidate(text: string, request?: BoostRequest): Candidate {
  // Accept one surrounding fence for provider compatibility, never extract arbitrary embedded JSON.
  const clean = text.trim().replace(/^```(?:json)?\s*\n([\s\S]*?)\n```$/i, '$1')
  const value: unknown = JSON.parse(clean)
  if (!value || typeof value !== 'object' || Array.isArray(value)) return candidateSchema.parse(value)
  const row = { ...value } as Record<string, unknown>
  // Metadata is not an extra task the model must perform. Only normalize
  // absent/null metadata; malformed values and untrusted claims still fail.
  if (row.task_type == null) row.task_type = classify(request?.raw ?? '')
  if (row.additions == null) row.additions = []
  if (row.unresolved == null) row.unresolved = []
  const slots = row.slots == null ? {} : row.slots
  if (typeof slots === 'object' && !Array.isArray(slots)) {
    const fields = { ...slots } as Record<string, unknown>
    for (const key of ['goal', 'context', 'inputs', 'output_format']) if (fields[key] == null) fields[key] = ''
    for (const key of ['constraints', 'acceptance']) if (fields[key] == null) fields[key] = []
    row.slots = fields
  }
  if (Array.isArray(row.additions)) row.additions = row.additions.map(value => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return value
    const addition = { ...value } as Record<string, unknown>
    for (const key of ['category', 'source_id', 'evidence_quote']) if (addition[key] === null) delete addition[key]
    return addition
  })
  return candidateSchema.parse(row)
}

export interface ValidationOptions {
  /**
   * Engine/client callers tolerate model bookkeeping entries whose canonical text did
   * not fit the body (the rewrite may have paraphrased a default). The entry still
   * grants identifier/entity authority, but it is metadata rather than a body claim.
   * Direct validation (tests, previews) keeps the strict default.
   */
  allowUnusedAdditions?: boolean
}

/** Deterministic checks do not claim complete semantic equivalence. */
export function validateCandidate(request: BoostRequest, candidate: Candidate, selected: readonly string[] = [], options: ValidationOptions = {}): string[] {
  const errors: string[] = []
  const body = candidate.optimized
  const ids = new Set(candidate.additions.map(a => a.id))
  if (ids.size !== candidate.additions.length) errors.push('duplicate_addition')
  if (selected.some(id => !ids.has(id))) errors.push('unknown_suggestion')
  const approved = candidate.additions.filter(a => a.kind === 'suggestion' && selected.includes(a.id))
  const allow = [request.raw, ...approved.map(a => a.value)]
  for (const addition of candidate.additions) {
    if (addition.kind === 'suggestion') {
      if (addition.action !== 'pending') errors.push('unapproved_suggestion')
      if (!selected.includes(addition.id) && body.includes(addition.value)) errors.push('pending_suggestion_in_body')
    } else if (addition.kind === 'default_assumption') {
      const choice = defaultChoices(request).find(choice => choice.category === addition.category && choice.value === addition.value)
      if (!choice || addition.action !== 'included' || addition.source_id !== undefined || addition.evidence_quote !== undefined) errors.push('unapproved_default')
      else allow.push(choice.value)
      if (!body.includes(addition.value) && !options.allowUnusedAdditions) errors.push('fact_not_in_body')
    } else {
      const source = request.context_sources.find(s => s.id === addition.source_id)
      if (!source || !addition.evidence_quote?.trim() || !source.content.includes(addition.evidence_quote)
        || !addition.evidence_quote.includes(addition.value)) {
        errors.push('unverifiable_source')
      } else {
        // An evidence quote grants opaque identifiers, not arbitrary numbers/entities elsewhere in the file.
        allow.push(addition.value)
      }
      if (addition.action !== 'included' || (!body.includes(addition.value) && !options.allowUnusedAdditions)) errors.push('fact_not_in_body')
    }
  }
  const max = textBudget(request)
  if (codepoints(body) > max) errors.push('too_long')
  if (!body.trim()) errors.push('empty_output')
  for (const fragment of request.reference_fragments ?? []) {
    if (body.split(fragment).length !== request.raw.split(fragment).length) errors.push('lost_reference')
  }
  for (const fragment of protectedFragments(request.raw)) if (!body.includes(fragment) && !preservesPhase(fragment, body)) errors.push('lost_constraint')
  const intent = taskIntent(request)
  for (const preference of intent.explicit_preferences) if (!preservesPreference(preference, body)) errors.push('lost_preference')
  const outputNumbers = new Set(numbers(body))
  const outputIdentifiers = new Set(identifiers(body))
  for (const number of unique(numbers(request.raw))) if (!outputNumbers.has(number)) errors.push('lost_number')
  for (const identifier of unique(identifiers(request.raw))) if (!outputIdentifiers.has(identifier)) errors.push('lost_identifier')
  const allowedNumbers = new Set(numbers(allow.join('\n')))
  for (const number of numbers(body.replace(/^\s*\d+[.)、]\s*/gm, ''))) if (!allowedNumbers.has(number)) errors.push('new_number')
  const allowedIdentifiers = new Set(identifiers(allow.join('\n')).map(s => s.toLowerCase()))
  for (const { token, index } of identifierTokens(body)) {
    if (allowedIdentifiers.has(token.toLowerCase())) continue
    // This ordinary login paraphrase contains a hyphen but is not a new code
    // identifier. Quoted code and file names remain protected independently.
    if (/^sign-in$/i.test(token) && /\blogin\b|\bsign[ -]in\b/i.test(request.raw)) continue
    // English sentences start with a capital letter ("Reuse the project stack"), which
    // is prose unless the token is entity-shaped (JWT/OAuth/HTML/TypeScript…). Without
    // this, every valid imperative rewrite was rejected as an invented entity.
    if (isSentenceStart(body, index) && !isStrongIdentifier(token)) continue
    errors.push('new_identifier')
  }
  // A rewrite must keep at least one anchor of the original task; otherwise the
  // draft was replaced wholesale (e.g. 实现登录页面 -> 写一首关于春天的诗).
  if (body.trim() && !preservesTaskIntent(request.raw, body)) errors.push('replaced_task')
  if (body.trim() && missingTaskPart(positiveRequirements(request.raw), body, intentAnchors)) errors.push('lost_task_part')
  // Source documents cannot authorize new business scope.
  // Excluding a capability is not an addition; mentioning it only in a raw
  // prohibition must not grant authority to add it elsewhere in the rewrite.
  const bodyLower = positiveRequirements(body).toLowerCase()
  const scopeAuthority = positiveRequirements([request.raw, ...approved.map(a => a.value)].join('\n')).toLowerCase()
  for (const word of scopeWords) if (mentionsScope(bodyLower, word) && !mentionsScope(scopeAuthority, word)) errors.push('expanded_scope')
  const affirmative = body.replace(/(?:不要|不得|禁止|不能|不允许|无需|do not|don't|must not|never)\s*[^\n，。；;.!?]{0,24}/gi, '')
  if (['plan', 'analysis'].includes(intent.stage)
    && /(?:直接|立即|现在就)(?:实现|开发|修改|执行|部署)|开始(?:修改|编写|实现|部署)|(?:implement|modify|deploy) (?:it )?(?:now|immediately)/i.test(affirmative)) errors.push('changed_stage')
  if (['plan', 'analysis'].includes(intent.stage) && !/确认|批准|同意|approval|confirmation/i.test(affirmative)
    && /(?:然后|再|随后|接着|之后|then)\s*(?:实现|开发|修改|执行|部署|编写|implement|modify|deploy)/i.test(affirmative)) errors.push('changed_stage')
  if (intent.operation === 'explain' && /^(?:请)?(?:直接)?(?:修改|实现|开发|执行|部署|重写)|^(?:please\s+)?(?:implement|modify|deploy|execute)\b/i.test(affirmative.trim())) errors.push('changed_intent')
  return unique(errors)
}
