import { test } from 'node:test'
import assert from 'node:assert/strict'
import { QUALITY_CASES } from '../evals/quality-cases.ts'
import { requestSchema } from '../src/types.ts'
import { BoostEngine } from '../src/core/engine.ts'
import { validateCandidate, parseCandidate } from '../src/guards/validate.ts'

for (const item of QUALITY_CASES) test(`representative paraphrase and omission: ${item.id}`, async () => {
  const request = requestSchema.parse({ request_id: item.id, draft_revision: 0, raw: item.raw, language: /[\u3400-\u9fff]/.test(item.raw) ? 'zh' : 'en' })
  const run = (optimized: string) => new BoostEngine({ name: 'fixture', async generate() { return JSON.stringify({ optimized, task_type: 'other', additions: [], unresolved: [] }) } }).boost(request)
  assert.equal((await run(item.valid)).status, 'ok')
  const rejected = await run(item.invalid)
  assert.equal(rejected.status, 'fallback')
  assert.ok(rejected.warnings.includes('warning' in item ? item.warning : 'replaced_task'))
})

test('wording families do not waive explicit constraints, numbers or identifiers', () => {
  const request = requestSchema.parse({ request_id: 'guard-priority', draft_revision: 0, raw: '排查卡顿，不新增依赖，保留 src/main.ts，预算 30 秒' })
  const value = parseCandidate(JSON.stringify({ optimized: '诊断性能瓶颈。' }), request)
  const errors = validateCandidate(request, value)
  assert.ok(errors.includes('lost_constraint'))
  assert.ok(errors.includes('lost_number'))
  assert.ok(errors.includes('lost_identifier'))
})

test('data lists and quoted conjunctions are not interpreted as independent tasks', () => {
  const request = requestSchema.parse({ request_id: 'data-list', draft_revision: 0, raw: '编写包含 name and value 的说明' })
  assert.deepEqual(validateCandidate(request, parseCandidate(JSON.stringify({ optimized: '整理包含 name and value 的文档。' }), request)), [])
})

test('page defaults cannot conceal an omitted installation-document task', async () => {
  const request = requestSchema.parse({ request_id: 'partial-defaults', draft_revision: 0, raw: '创建登录页面并编写安装文档' })
  const result = await new BoostEngine({ name: 'fixture', async generate() { return JSON.stringify({ optimized: '创建登录页面。' }) } }).boost(request)
  assert.equal(result.status, 'fallback')
  assert.ok(result.warnings.includes('lost_task_part'))
})
