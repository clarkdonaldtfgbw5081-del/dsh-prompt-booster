import { test } from 'node:test'
import assert from 'node:assert/strict'
import { BoostEngine } from '../src/core/engine.ts'
import { modelInput } from '../src/core/prompt.ts'
import { protectedFragments, validateCandidate } from '../src/guards/validate.ts'
import { requestSchema, type Candidate } from '../src/types.ts'

const url = 'https://github.com/RVC-Boss/GPT-SoVITS'
// User-reported draft; candidates below are constructed regressions, not model results.
const raw = `${url}读取一下这个项目的内容，看能否用于ai语音的实现`
const request = (text = raw) => requestSchema.parse({ request_id: 'url', draft_revision: 0, raw: text, mode: 'light' })
const candidate = (optimized: string): Candidate => ({ optimized, task_type: 'research', additions: [], unresolved: [],
  slots: { goal: '', context: '', inputs: '', output_format: '', constraints: [], acceptance: [] } })
const rewritten = `阅读项目 ${url} 的资料，评估它能否用于ai语音的实现，并说明依据与限制。`

test('URL followed immediately by a Chinese request does not freeze the prose', async () => {
  assert.deepEqual(protectedFragments(raw), [url])
  assert.deepEqual(JSON.parse(modelInput(request())).protected_fragments, [url])
  assert.deepEqual(validateCandidate(request(), candidate(rewritten)), [])
  const result = await new BoostEngine({ name: 'fixture', async generate() { return JSON.stringify(candidate(rewritten)) } }).boost(request())
  assert.equal(result.status, 'ok')
  assert.equal(result.optimized, rewritten)
})

test('URL scheme, query and fragment remain exact, including punctuation', () => {
  const link = 'https://example.com/project?mode=full&lang=zh#readme'
  const input = request(`阅读 ${link}，评估语音项目`)
  assert.deepEqual(protectedFragments(input.raw), [link])
  for (const changed of [link.replace('https:', 'http:'), link.replace('&lang=zh', ''), link.replace('#readme', '#other'), '']) {
    assert.ok(validateCandidate(input, candidate(`评估语音项目 ${changed}`)).includes('lost_constraint'))
  }
})

test('link wrappers are not frozen and Unicode URLs stay intact', () => {
  for (const link of ['https://example.com/中文项目', 'https://example.com/读取指南', 'https://example.com/a_(b)']) {
    for (const text of [`阅读 <${link}>，评估项目`, `阅读 [项目](${link})，评估项目`, `阅读 ${link}，评估项目`]) {
      assert.deepEqual(protectedFragments(text), [link], text)
      assert.deepEqual(validateCandidate(request(text), candidate(`评估项目，阅读 ${link}`)), [], text)
    }
  }
})

test('explicitly delimited Unicode URL paths are never split as request text', () => {
  const link = 'https://example.com/project读取一下说明'
  for (const text of [`阅读 <${link}>，评估项目`, `阅读 [项目](${link})，评估项目`]) {
    assert.deepEqual(protectedFragments(text), [link])
  }
})

test('link extraction preserves separate paths, quoted code and actual prohibitions', () => {
  const input = request(`${raw}，不要修改代码，参考 ./src/main.ts 和 \`voice_mode\``)
  const fragments = protectedFragments(input.raw)
  for (const fragment of [url, './src/main.ts', '`voice_mode`', '不要修改代码']) assert.ok(fragments.includes(fragment), fragment)
  assert.ok(validateCandidate(input, candidate(`${rewritten}参考 ./src/main.ts 和 \`voice_mode\``)).includes('lost_constraint'))
})
