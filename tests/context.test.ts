import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, writeFile, mkdir, rm } from 'node:fs/promises'
import { join, resolve, relative, isAbsolute } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { SessionStore } from '@deepseek-ai/dsh-session'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { collectContext } from '../src/adapters/context.ts'
import { contextPolicySchema } from '../src/config.ts'
import { requestSchema } from '../src/types.ts'

const request = (raw: string) => requestSchema.parse({ request_id: 'context', draft_revision: 0, raw })
async function fixture() {
  const root = resolve(process.cwd())
  const folder = await mkdtemp(join(root, '.test-context-'))
  const ctx = new Context(); await ctx.plugin(SessionStore)
  const session = ctx.sessions.create(undefined, { meta: { cwd: folder } })
  const append = (text: string) => session.append('user/message', createUserMessage({ content: [{ type: 'text', text }], source: { kind: 'user' } }), { surfaceOp: 'append' })
  return { folder, session, append, async close() {
    await ctx.fiber.dispose()
    const local = relative(root, folder)
    assert.ok(!local.startsWith('..') && !isAbsolute(local) && local.startsWith('.test-context-'))
    await rm(folder, { recursive: true, force: true })
  } }
}
test('recent context is current-session user text, limited and only used for references', async () => {
  const f = await fixture()
  try {
    f.append('做一个深色登录页面'); f.append('保持已有接口')
    const policy = contextPolicySchema.parse({ recentLimit: 1 })
    const absent = await collectContext(f.session, request('写一份周报'), policy, new AbortController().signal)
    assert.equal(absent.sources.length, 0)
    const present = await collectContext(f.session, request('根据上面的需求再优化'), policy, new AbortController().signal)
    assert.equal(present.sources.length, 1); assert.equal(present.sources[0].content, '保持已有接口')
    assert.equal((await collectContext(f.session, request('根据上面'), { ...policy, recentMessages: 'off' }, new AbortController().signal)).sources.length, 0)
  } finally { await f.close() }
})
test('English pronoun references must be explicit phrases, not a bare "this"', async () => {
  const f = await fixture()
  try {
    f.append('Keep the existing API')
    const policy = contextPolicySchema.parse({ recentLimit: 1 })
    const noSources = async (raw: string) =>
      (await collectContext(f.session, request(raw), policy, new AbortController().signal)).sources.length
    // Ordinary English prose that merely contains these words must not pull history in.
    for (const raw of [
      'this is a login page',
      'above the fold, show the pricing table',
      'previous users should stay logged in',
      'same look as the marketing site',
      'Give me a detailed report on this issue',
    ]) assert.equal(await noSources(raw), 0, raw)
    // Explicit cross-message references still attach the most recent user turn.
    for (const raw of [
      'based on this project, add tests',
      'as above, keep the same routes',
      'the above requirements still hold',
      'previous message: continue from there',
      'this page needs a dark header',
    ]) {
      const result = await collectContext(f.session, request(raw), policy, new AbortController().signal)
      assert.equal(result.sources.length, 1, raw)
      assert.equal(result.sources[0].content, 'Keep the existing API')
    }
  } finally { await f.close() }
})
test('selected files stay inside the workspace; secrets, directories and binaries are skipped', async () => {
  const f = await fixture()
  try {
    await writeFile(join(f.folder, 'requirements.md'), '页面使用 React，保持现有接口。')
    await writeFile(join(f.folder, '.env'), 'API_KEY=fixture-not-a-real-key')
    await writeFile(join(f.folder, 'config.json'), '{"token":"fixture-not-a-real-key"}')
    await writeFile(join(f.folder, 'binary.txt'), '\0data')
    await mkdir(join(f.folder, 'notes'))
    const policy = contextPolicySchema.parse({ files: ['requirements.md', '.env', 'config.json', 'binary.txt', 'notes', '../package.json'] })
    const result = await collectContext(f.session, request('根据这个项目优化'), policy, new AbortController().signal)
    assert.equal(result.sources.length, 1); assert.match(result.sources[0].content, /React/)
    assert.deepEqual(result.notices, ['context_file_skipped'])
  } finally { await f.close() }
})
test('automatic context excludes credential-looking messages and respects total limits', async () => {
  const f = await fixture()
  try {
    f.append('token=fixture-not-a-real-token'); f.append('字'.repeat(20000))
    const input = request('根据上面')
    input.context_sources = Array.from({ length: 7 }, (_, i) => ({ id: 'm' + i, label: '手动资料', content: 'a'.repeat(3000) }))
    const result = await collectContext(f.session, input, contextPolicySchema.parse({ recentMessages: 'always' }), new AbortController().signal)
    assert.equal(result.sources.length, 8)
    assert.equal(result.sources.reduce((sum, source) => sum + source.content.length, 0), 24000)
    assert.ok(!JSON.stringify(result.sources).includes('fixture-not-a-real-token'))
  } finally { await f.close() }
})
test('cancellation stops context collection without a fallback read', async () => {
  const f = await fixture()
  try {
    const signal = AbortSignal.abort()
    await assert.rejects(collectContext(f.session, request('根据上面'), contextPolicySchema.parse({}), signal))
  } finally { await f.close() }
})
test('explicit Architect manifest files are text references, not executed instructions', async () => {
  const f = await fixture()
  try {
    await writeFile(join(f.folder, 'app.arc'), '@app\nfixture-app\n@http\nget /\n')
    const result = await collectContext(f.session, request('根据项目清单优化'), contextPolicySchema.parse({ files: ['app.arc'] }), new AbortController().signal)
    assert.equal(result.sources.length, 1)
    assert.match(result.sources[0].content, /@http/)
    assert.deepEqual(result.notices, [])
  } finally { await f.close() }
})

test('newest requirements get the remaining context budget before older requests', async () => {
  const f = await fixture()
  try {
    f.append('旧要求：深色主题'); f.append('改为浅色主题')
    const input = request('根据上面的要求继续')
    input.context_sources = Array.from({ length: 7 }, (_, i) => ({ id: 'explicit-' + i, label: '资料', content: 'a'.repeat(3000) }))
    const result = await collectContext(f.session, input, contextPolicySchema.parse({ recentLimit: 3 }), new AbortController().signal)
    assert.equal(result.sources.length, 8)
    assert.equal(result.sources[7].content, '改为浅色主题')
    assert.match(result.sources[7].label, /新到旧/)
  } finally { await f.close() }
})

test('explicit topic changes discard obsolete history but preserve selected files', async () => {
  const f = await fixture()
  try {
    f.append('制作登录页面'); f.append('新任务：写一份周报'); f.append('语气自然')
    await writeFile(join(f.folder, 'brief.md'), '明确选中的事实资料')
    const policy = contextPolicySchema.parse({ recentLimit: 5, files: ['brief.md'] })
    const result = await collectContext(f.session, request('根据之前的要求继续'), policy, new AbortController().signal)
    assert.deepEqual(result.sources.slice(0, 2).map(row => row.content), ['语气自然', '新任务：写一份周报'])
    assert.ok(!result.sources.some(row => row.content.includes('登录')))
    const reset = await collectContext(f.session, request('新任务：分析数据'), { ...policy, recentMessages: 'always' }, new AbortController().signal)
    assert.equal(reset.sources.length, 1)
    assert.match(reset.sources[0].id, /selected-file/)
  } finally { await f.close() }
})
