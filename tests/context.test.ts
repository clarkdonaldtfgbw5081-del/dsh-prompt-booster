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
