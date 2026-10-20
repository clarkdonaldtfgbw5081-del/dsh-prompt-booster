import { test } from 'node:test'
import assert from 'node:assert/strict'
import { taskClauses } from '../src/core/clauses.ts'
import { missingTaskPart } from '../src/guards/task.ts'
import { intentAnchors } from '../src/guards/validate.ts'
import { taskIntent } from '../src/core/intent.ts'
import { requestSchema } from '../src/types.ts'

test('explicit comma, sequence and numbered tasks retain separate targets', () => {
  for (const raw of ['修改页面，补充安装文档', '先分析页面卡顿，然后修复加载问题', '1. 修改页面\n2. 补充安装文档']) {
    const clauses = taskClauses(raw)
    assert.equal(clauses.length, 2, raw)
    assert.ok(clauses.every(row => row.target.length > 0))
  }
  assert.equal(taskClauses('先分析页面卡顿，然后修复加载问题')[1].sequential, true)
})
test('quoted conjunctions and data lists do not add independent tasks', () => {
  assert.equal(taskClauses('分析“页面，并删除数据库”的措辞').length, 1)
  assert.equal(taskClauses('分析销售、成本和利润').length, 1)
  assert.equal(taskClauses('写一篇关于修复页面和开发接口的文章').length, 1)
})
test('inline code no longer disables checks for a separate explicit task', () => {
  const raw = '修改 `app.ts` 的排版，并补充安装文档'
  assert.equal(missingTaskPart(raw, '修改 `app.ts` 的排版。', intentAnchors), true)
  assert.equal(missingTaskPart(raw, '修改 `app.ts` 的排版，并补充安装文档。', intentAnchors), false)
})
test('analysis followed by a fix is execution unless confirmation is required', () => {
  const request = (raw: string) => requestSchema.parse({ request_id: 'clauses', draft_revision: 0, raw })
  assert.equal(taskIntent(request('先分析页面报错，再修复代码')).stage, 'execution')
  assert.equal(taskIntent(request('先给方案，然后创建登录页面')).stage, 'execution')
  assert.equal(taskIntent(request('first analyze cache problems then build an API')).stage, 'execution')
  assert.equal(taskIntent(request('先分析页面报错，等我确认后再修复代码')).stage, 'analysis')
  assert.equal(taskIntent(request('修改页面，补充安装文档')).steps?.length, 2)
})
