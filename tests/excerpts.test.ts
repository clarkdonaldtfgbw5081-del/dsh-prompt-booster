import { test } from 'node:test'
import assert from 'node:assert/strict'
import { selectExcerpt } from '../src/core/excerpts.ts'

test('relevant selected-file passages beyond the prefix retain original text and line provenance', () => {
  const original = Array.from({ length: 400 }, (_, i) => i === 300 ? '登录按钮必须沿用现有会话接口，保持旧版兼容。' : `背景说明：${'与本次任务无关的内容'.repeat(3)}`).join('\n')
  const excerpt = selectExcerpt(original, '优化登录按钮的会话接口兼容')
  assert.ok(excerpt.content.includes('登录按钮必须沿用现有会话接口，保持旧版兼容。'))
  assert.match(excerpt.ranges, /L301/)
  assert.ok(excerpt.content.length <= 6000)
  assert.ok(excerpt.content.split('\n').every(line => !line || original.includes(line)))
})
test('small files remain verbatim; no-match files and minified lines stay bounded', () => {
  assert.equal(selectExcerpt('a\r\nb', 'abc').content, 'a\r\nb')
  assert.equal(selectExcerpt('无关'.repeat(4000), 'login').content.length, 6000)
  const text = 'x'.repeat(7000) + 'login-panel: retain-session;' + 'x'.repeat(5000)
  const excerpt = selectExcerpt(text, 'login-panel')
  assert.ok(excerpt.content.includes('login-panel: retain-session;'))
  assert.ok(excerpt.content.length <= 6000)
  assert.equal(selectExcerpt(text, 'login', 0).content, '')
})

test('chunking and budgets never split surrogate pairs', () => {
  const content = 'x'.repeat(999) + '🌿login'.repeat(1500)
  const result = selectExcerpt(content, 'login', 3001)
  assert.equal(/[\uD800-\uDFFF]/u.test(result.content), false)
  assert.ok(result.content.length <= 3001)
})
