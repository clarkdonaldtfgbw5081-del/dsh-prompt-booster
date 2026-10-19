import { candidateSchema, type BoostRequest, type Candidate } from '../types.ts'
import { defaultChoices } from '../core/defaults.ts'
import { taskIntent, textBudget } from '../core/intent.ts'
import { classify } from '../core/route.ts'

export const codepoints = (text: string): number => [...text].length
const unique = (values: string[]): string[] => [...new Set(values)]
const numbers = (text: string): string[] => text.match(/[-+]?\d+(?:\.\d+)*(?:%|ms|秒|分钟|小时|天|字|个|页|MB|GB)?/g) ?? []
const technologies = new Set(['react', 'vue', 'angular', 'svelte', 'python', 'tailwind', 'typescript', 'javascript', 'node', 'nodejs', 'npm', 'pnpm', 'django', 'flask', 'fastapi', 'docker', 'redis', 'mysql', 'postgresql', 'sqlite', 'mongodb', 'openai', 'deepseek', 'dsh', 'api', 'sdk', 'html', 'css', 'sql', 'rust', 'java', 'kotlin', 'swift', 'stripe', 'firebase', 'architect', 'aws', 'serverless', 'lambda', 'dynamodb', 'cloudformation'])
const proseLabels = new Set(['please', 'task', 'goal', 'output', 'requirements', 'context', 'acceptance', 'build', 'implement', 'create', 'fix', 'write', 'analyze', 'research', 'use', 'keep', 'do', 'dont', 'only', 'the', 'a', 'an', 'i', 'we', 'you', 'deliver', 'return', 'provide', 'explain', 'include', 'avoid', 'preserve', 'based', 'make', 'add'])
function identifiers(text: string): string[] {
  return (text.match(/[A-Za-z_$][A-Za-z\d_$]*(?:[./:@+-][A-Za-z\d_$-]+)*/g) ?? []).filter(token =>
    technologies.has(token.toLowerCase()) || /[._$/:@+\d-]/.test(token)
    || (/[A-Z]/.test(token) && token.length > 1 && !proseLabels.has(token.toLowerCase())))
}

/** Keep exact spans for constraints and opaque references; rules are deliberately conservative. */
export function protectedFragments(raw: string): string[] {
  return unique([
    ...(raw.match(/```[\s\S]*?```|`[^`\n]+`/g) ?? []),
    ...(raw.match(/(?:[A-Za-z]:[\\/]|\.{0,2}\/)[^\s，。；;！？!?"<>]+/g) ?? []),
    ...raw.split(/[，。；;！!？?\n]/).map(s => s.trim()).filter(s =>
      /不要|不得|禁止|不能|不允许|不新增|不修改|不改|不加|不做|无需|不超过|不低于|仅|只(?:给|做|要|输出|修改|使用)|先.{0,12}(?:方案|分析|计划)|do not|don't|must not|only|no new|at most|at least/i.test(s)),
  ]).filter(Boolean)
}

const scopeWords = ['注册', '短信验证', '第三方登录', '权限系统', '支付', '自动部署', '上线', '删除数据库', '部署到生产', 'install dependencies', 'deploy to production']

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

/** Deterministic checks do not claim complete semantic equivalence. */
export function validateCandidate(request: BoostRequest, candidate: Candidate, selected: readonly string[] = []): string[] {
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
      if (!body.includes(addition.value)) errors.push('fact_not_in_body')
    } else {
      const source = request.context_sources.find(s => s.id === addition.source_id)
      if (!source || !addition.evidence_quote?.trim() || !source.content.includes(addition.evidence_quote)
        || !addition.evidence_quote.includes(addition.value)) {
        errors.push('unverifiable_source')
      } else {
        // An evidence quote grants opaque identifiers, not arbitrary numbers/entities elsewhere in the file.
        allow.push(addition.value)
      }
      if (addition.action !== 'included' || !body.includes(addition.value)) errors.push('fact_not_in_body')
    }
  }
  const max = textBudget(request)
  if (codepoints(body) > max) errors.push('too_long')
  if (!body.trim()) errors.push('empty_output')
  for (const fragment of protectedFragments(request.raw)) if (!body.includes(fragment) && !preservesPhase(fragment, body)) errors.push('lost_constraint')
  const intent = taskIntent(request)
  for (const preference of intent.explicit_preferences) if (!body.includes(preference)) errors.push('lost_preference')
  const outputNumbers = new Set(numbers(body))
  const outputIdentifiers = new Set(identifiers(body))
  for (const number of unique(numbers(request.raw))) if (!outputNumbers.has(number)) errors.push('lost_number')
  for (const identifier of unique(identifiers(request.raw))) if (!outputIdentifiers.has(identifier)) errors.push('lost_identifier')
  const allowedNumbers = new Set(numbers(allow.join('\n')))
  for (const number of numbers(body.replace(/^\s*\d+[.)、]\s*/gm, ''))) if (!allowedNumbers.has(number)) errors.push('new_number')
  const allowedIdentifiers = new Set(identifiers(allow.join('\n')).map(s => s.toLowerCase()))
  for (const identifier of identifiers(body)) if (!allowedIdentifiers.has(identifier.toLowerCase())) errors.push('new_identifier')
  // Source documents cannot authorize new business scope.
  const scopeAuthority = [request.raw, ...approved.map(a => a.value)].join('\n').toLowerCase()
  for (const word of scopeWords) if (body.toLowerCase().includes(word) && !scopeAuthority.includes(word)) errors.push('expanded_scope')
  const affirmative = body.replace(/(?:不要|不得|禁止|不能|不允许|无需|do not|don't|must not|never)\s*[^\n，。；;.!?]{0,24}/gi, '')
  if (['plan', 'analysis'].includes(intent.stage)
    && /(?:直接|立即|现在就)(?:实现|开发|修改|执行|部署)|开始(?:修改|编写|实现|部署)|(?:implement|modify|deploy) (?:it )?(?:now|immediately)/i.test(affirmative)) errors.push('changed_stage')
  if (['plan', 'analysis'].includes(intent.stage) && !/确认|批准|同意|approval|confirmation/i.test(affirmative)
    && /(?:然后|再|随后|接着|之后|then)\s*(?:实现|开发|修改|执行|部署|编写|implement|modify|deploy)/i.test(affirmative)) errors.push('changed_stage')
  if (intent.operation === 'explain' && /^(?:请)?(?:直接)?(?:修改|实现|开发|执行|部署|重写)|^(?:please\s+)?(?:implement|modify|deploy|execute)\b/i.test(affirmative.trim())) errors.push('changed_intent')
  return unique(errors)
}
