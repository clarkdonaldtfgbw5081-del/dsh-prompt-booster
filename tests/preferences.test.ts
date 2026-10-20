import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Config, configSchema } from '../src/config.ts'
import { requestSchema, preferencesSchema } from '../src/types.ts'
import { defaultChoices } from '../src/core/defaults.ts'
import { textBudget } from '../src/core/intent.ts'

test('explicit persisted preferences are described by a native live Settings schema', () => {
  const schema = Config.toJSON()
  assert.equal(schema.refs?.[schema.uid].meta?.volatile, true)
  assert.ok(JSON.stringify(schema).includes('recentMessages'))
  const saved = configSchema.parse({ preferences: { detail: 'concise', tone: 'formal', fillDefaults: false } })
  assert.equal(saved.preferences.detail, 'concise')
  assert.equal(saved.mode, 'standard')
  assert.equal(configSchema.parse({ mode: 'light' }).mode, 'light')
  assert.deepEqual(preferencesSchema.parse({}), { detail: 'auto', tone: 'auto', fillDefaults: true })
})
test('preferences remain subordinate to explicit task requirements', () => {
  const input = requestSchema.parse({ request_id: 'prefs', draft_revision: 0, raw: '生成一个风景网页', preferences: { detail: 'concise', fillDefaults: false } })
  assert.equal(textBudget(input), 100); assert.deepEqual(defaultChoices(input), [])
  input.raw = '详细描述一个风景网页的方案'
  assert.equal(textBudget(input), 400)
})
