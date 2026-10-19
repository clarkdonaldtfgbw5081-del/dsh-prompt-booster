import { test } from 'node:test'
import assert from 'node:assert/strict'
import { requestSchema } from '../src/types.ts'
import { modelInput, PROMPT_VERSION, SYSTEM_PROMPT } from '../src/core/prompt.ts'

const request = (raw: string) => requestSchema.parse({ request_id: 'prompt', draft_revision: 0, raw })

test('prompt context is progressive, budgeted, and keeps task-specific sections conditional', () => {
  // Writing does not need page defaults, software strategy guidance or protected fragments.
  const writing = JSON.parse(modelInput(request('写一篇给初学者的项目介绍')))
  assert.equal(writing.default_choices, undefined)
  assert.equal(writing.solution_strategy, undefined)
  assert.equal(writing.protected_fragments, undefined)
  assert.ok(writing.task_intent.guidance.length > 0)

  // A page task gets only the sections it can use, including exact protected fragments.
  const pageText = modelInput(request('生成一个风景主题网页，参考 D:\\app\\index.html'))
  const page = JSON.parse(pageText)
  assert.ok(Array.isArray(page.default_choices) && page.default_choices.length > 0)
  assert.ok(page.solution_strategy && page.solution_strategy.profile === 'page')
  assert.ok(page.protected_fragments.includes('D:\\app\\index.html'))
  assert.ok(pageText.length < 1200, `page input is ${pageText.length} chars`)
  assert.ok(modelInput(request('写一篇给初学者的项目介绍')).length < 600)

  // The core contract stays short enough to leave room for task-specific guidance.
  assert.equal(PROMPT_VERSION, '3')
  assert.ok(SYSTEM_PROMPT.length < 3000, `system prompt is ${SYSTEM_PROMPT.length} chars`)
  assert.match(SYSTEM_PROMPT, /完成定义/)
  assert.match(SYSTEM_PROMPT, /default_choices/)
})
