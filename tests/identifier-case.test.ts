import { test } from 'node:test'
import assert from 'node:assert/strict'
import { BoostEngine } from '../src/core/engine.ts'
import { validateCandidate } from '../src/guards/validate.ts'
import { requestSchema, type Candidate } from '../src/types.ts'

const request = (raw: string) => requestSchema.parse({ request_id: 'case', draft_revision: 0, raw, mode: 'light' })
const candidate = (optimized: string): Candidate => ({ optimized, task_type: 'code_gen', additions: [], unresolved: [],
  slots: { goal: '', context: '', inputs: '', output_format: '', constraints: [], acceptance: [] } })
// User screenshot is the input; rewrites here are constructed regression examples.
const raw = '那自行创建一个插件，让dsh接入qq的同时能够发语音条，发语音条还能够用不同的音色'
const rewrite = '创建一个插件，让 DSH 接入 QQ，支持发送语音条，并可选择不同的音色。'

test('normalizing DSH and QQ casing passes the engine without repair calls', async () => {
  assert.deepEqual(validateCandidate(request(raw), candidate(rewrite)), [])
  let calls = 0
  const result = await new BoostEngine({ name: 'fixture', async generate() { calls++; return JSON.stringify(candidate(rewrite)) } }).boost(request(raw))
  assert.equal(result.status, 'ok')
  assert.equal(result.optimized, rewrite)
  assert.equal(calls, 1)
})

test('known technology and acronym casing is accepted in both directions', () => {
  for (const [before, after] of [['react', 'React'], ['DSH', 'dsh'], ['qq', 'QQ'], ['QQ', 'qq'], ['ai', 'AI'], ['JWT', 'jwt'], ['jwt', 'JWT']]) {
    assert.deepEqual(validateCandidate(request(`介绍 ${before} 的用途`), candidate(`说明 ${after} 的用途。`)), [], `${before} -> ${after}`)
  }
})

test('case normalization cannot authorize new technologies or identifier substrings', () => {
  for (const extra of ['TTS', 'GPT-SoVITS', 'NapCat', 'Redis', 'QQBot']) {
    assert.ok(validateCandidate(request(raw), candidate(`${rewrite}使用 ${extra}。`)).includes('new_identifier'), extra)
  }
  for (const text of ['介绍 myqq 的用途', '介绍 qq.js 的用途', '介绍 src/qq 的用途']) {
    assert.ok(validateCandidate(request(text), candidate('说明 QQ 的用途。')).includes('new_identifier'), text)
  }
})

test('removing requested technologies and acronyms is still rejected', () => {
  for (const term of ['dsh', 'qq', 'AI', 'JWT']) {
    assert.ok(validateCandidate(request(`介绍 ${term} 的用途`), candidate('介绍插件的用途。')).includes('lost_identifier'), term)
  }
  assert.ok(validateCandidate(request('比较 React 和 ReactNative'), candidate('比较 ReactNative 的用途。')).includes('lost_identifier'))
})

test('case-sensitive code, paths, references and prohibitions remain exact', () => {
  for (const [before, after] of [['`dsh`', '`DSH`'], ['src/Voice.ts', 'src/voice.ts'], ['voiceMode', 'voicemode'], ['不要使用qq', '不要使用QQ']]) {
    const errors = validateCandidate(request(`分析 ${before} 的用途`), candidate(`分析 ${after} 的用途。`))
    assert.ok(errors.includes('lost_constraint') || errors.includes('lost_identifier'), before)
  }
  const input = request('介绍 qq 插件的用途')
  input.reference_fragments = ['qq']
  assert.ok(validateCandidate(input, candidate('介绍 QQ 插件的用途。')).includes('lost_reference'))
})
