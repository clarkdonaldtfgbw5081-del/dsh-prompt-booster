import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { runInNewContext } from 'node:vm'
import { remoteMethods } from '@deepseek-ai/dsh-typert-protocol'
import { Context, Service } from '@deepseek-ai/cordis'
import * as RemoteClient from '@deepseek-ai/dsh-api-gateway/client'
import { TypertRegistry } from '@deepseek-ai/dsh-typert-registry'
import { LlmRuntime } from '@deepseek-ai/dsh-llm'
import { SessionStore } from '@deepseek-ai/dsh-session'
import DefaultModel from '@deepseek-ai/dsh-agent-default-model'

const { default: Host } = await import('../lib/index.js')
assert.ok(Host.inject.includes('llm'))
assert.equal(Host.Config.meta.volatile, true)
assert.ok(JSON.stringify(Host.Config.toJSON()).includes('recentMessages'))
// Decorator metadata must survive the production build, not only tsx's test transform.
const ctx = new Context()
ctx.plugin(TypertRegistry)
ctx.plugin(SessionStore)
ctx.plugin(LlmRuntime)
ctx.plugin(DefaultModel, { provider: 'smoke', model: 'smoke' })
await ctx.plugin(Host)
try { assert.deepEqual(remoteMethods(ctx.promptBooster).map(method => method.method), ['boost', 'feedback', 'capabilities']) }
finally { await ctx.fiber.dispose() }
const require = createRequire(import.meta.url)
let entry
runInNewContext(await readFile(new URL('../lib/client.js', import.meta.url), 'utf8'), {
  window: { __ModuleLoader__: { load(value) { entry = value } } },
  console, TextEncoder, TextDecoder, AbortController, AbortSignal, setTimeout, clearTimeout,
}, { timeout: 3000 })
assert.equal(entry.id, 'dsh-prompt-booster')
const baselineModules = new Set(['react', 'react/jsx-runtime', 'react-dom'])
const client = entry.factory(specifier => {
  assert.ok(baselineModules.has(specifier), `Unexpected browser runtime import: ${specifier}`)
  return require(specifier)
})
assert.equal(typeof client.apply, 'function')
assert.ok(client.inject.includes('slots'))
// Execute the built browser entry inside a real Cordis fiber as well. Merely
// checking its exports cannot detect access to a namespace without inject.
const browserCtx = new Context()
let face
const request = { request_id: 'smoke', draft_revision: 0, raw: '测试', mode: 'standard', language: 'zh', context_sources: [] }
const result = { marker: 'built-client-rpc' }
browserCtx.provide('connection', {
  interactions: 'none', isLoopback: true,
  rpc: {
    async call(_path, endpoint) { assert.equal(endpoint, 'promptBooster/capabilities'); return { ok: true, value: { protocol: 1, configured_mode: true, reference_fragments: true } } },
    async *open(_path, endpoint) { assert.equal(endpoint, 'promptBooster/boost'); yield result },
  },
})
class Slots extends Service {
  constructor(ctx) { super(ctx, 'slots') }
  inject(_name, callback) { return this.ctx.effect(callback) }
  register(options) { face = options.inject('smoke-session'); return () => { face = undefined } }
}
await browserCtx.plugin(Slots)
browserCtx.provide('sessions', { binding: () => undefined })
browserCtx.provide('conversation', {})
await browserCtx.plugin(TypertRegistry)
await browserCtx.plugin(RemoteClient)
try {
  const plugin = browserCtx.plugin(client)
  await plugin
  assert.ok(face, 'built client must register its slot after namespace injection')
  assert.deepEqual(await face.generate(request, new AbortController().signal), result)
  await plugin.dispose()
  assert.equal(face, undefined)
  assert.equal(browserCtx.get('remote.promptBooster'), undefined)
} finally { await browserCtx.fiber.dispose() }
const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
assert.equal(manifest.engines.dsh, '0.2.1-rc.2')
console.log('Built host decorators, browser module handoff, native client injection, RPC and unload verified.')
