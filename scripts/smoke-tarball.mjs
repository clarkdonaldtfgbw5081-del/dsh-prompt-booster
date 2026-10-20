// Package smoke test: pack the real tarball with npm, unpack it outside the
// source tree, then exercise the packaged host entry in a real Cordis context
// and the packaged browser entry through its __ModuleLoader__ handoff.
//
// Assumes `npm run build` already produced lib/ (the verify pipeline builds
// before running this); when the build artifacts are absent it builds first so
// the script also works standalone. Always cleans up its scratch directory and
// exits 1 on any failure.
import assert from 'node:assert/strict'
import { execFileSync, execSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, readdir, readFile, rm } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { runInNewContext } from 'node:vm'
import { Context } from '@deepseek-ai/cordis'
import { remoteMethods } from '@deepseek-ai/dsh-typert-protocol'
import { TypertRegistry } from '@deepseek-ai/dsh-typert-registry'
import { LlmRuntime } from '@deepseek-ai/dsh-llm'
import { SessionStore } from '@deepseek-ai/dsh-session'
import DefaultModel from '@deepseek-ai/dsh-agent-default-model'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const requireFromRoot = createRequire(join(root, 'package.json'))
const REQUIRED_BUILD = [
  'lib/index.js', 'lib/core.js', 'lib/client.js', 'lib/types/index.d.ts', 'lib/types/client/index.d.ts',
]
const REQUIRED_PACKED = [
  'package.json', 'README.md', 'CHANGELOG.md', 'LICENSE', 'cordis.patch.yml',
  'lib/index.js', 'lib/core.js', 'lib/client.js', 'lib/types/index.d.ts', 'lib/types/client/index.d.ts',
  'locale/en.json', 'locale/zh.json',
]

async function listFiles(dir, prefix = '') {
  const files = []
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name
    if (entry.isDirectory()) files.push(...await listFiles(join(dir, entry.name), relative))
    else files.push(relative)
  }
  return files
}

function runNpm(args) {
  // Relative arguments keep the command free of quoted absolute paths; npm
  // itself is resolved by the shell on every supported platform.
  return execSync(['npm', ...args].join(' '), {
    cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
  })
}

async function main() {
  const scratchName = `.dsh-prompt-booster-smoke-${process.pid}-${randomBytes(4).toString('hex')}`
  const scratch = join(root, 'node_modules', scratchName)
  const tarballDir = join(scratch, 'tarball')
  const extractDir = join(scratch, 'extract')
  const packageDir = join(extractDir, 'package')
  try {
    await mkdir(tarballDir, { recursive: true })
    await mkdir(extractDir, { recursive: true })

    if (!REQUIRED_BUILD.every(path => existsSync(join(root, path)))) {
      console.log('smoke-tarball: lib/ build artifacts missing, running npm run build first')
      execSync('npm run build', { cwd: root, stdio: 'inherit' })
    }
    const repoManifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
    assert.ok(REQUIRED_BUILD.every(path => existsSync(join(root, path))), 'build must produce the packaged entry points')

    // 1. Pack the exact publishable tarball (no lifecycle scripts).
    const packDestination = join('node_modules', scratchName, 'tarball')
    const packed = JSON.parse(runNpm(['pack', '--ignore-scripts', '--json', '--pack-destination', packDestination]))[0]
    assert.equal(packed.name, repoManifest.name)
    assert.equal(packed.version, repoManifest.version)
    assert.ok(packed.files.length > 0, 'tarball must contain files')

    // 2. White-list the reported contents against the declared `files` entries
    //    plus the files npm always includes (package.json, LICENSE).
    const allowed = path => path === 'package.json' || path === 'LICENSE'
      || repoManifest.files.some(entry => path === entry || path.startsWith(`${entry}/`))
    for (const file of packed.files) {
      assert.ok(!file.path.startsWith('/') && !file.path.split(/[\\/]/).includes('..'), `unsafe packed path: ${file.path}`)
      assert.ok(allowed(file.path), `packed file outside the declared files list: ${file.path}`)
    }
    for (const path of ['package.json', 'lib/index.js', 'lib/client.js', 'locale/en.json', 'locale/zh.json', 'cordis.patch.yml']) {
      assert.ok(packed.files.some(file => file.path === path), `tarball is missing ${path}`)
    }
    const tarballName = (await readdir(tarballDir)).find(name => name.endsWith('.tgz'))
    assert.ok(tarballName, 'npm pack must write one tarball')
    const tarballPath = join(tarballDir, tarballName)
    assert.equal(packed.filename, tarballName)

    // 3. Unpack and verify the manifest and unpacked tree describe exactly the
    //    reported package contents (no stray source, test or local files).
    execFileSync('tar', ['-xzf', tarballPath, '-C', extractDir], { stdio: 'inherit' })
    assert.ok(existsSync(join(packageDir, 'package.json')), 'tarball must unpack into package/')
    const manifest = JSON.parse(await readFile(join(packageDir, 'package.json'), 'utf8'))
    assert.equal(manifest.name, repoManifest.name)
    assert.equal(manifest.version, repoManifest.version)
    assert.equal(manifest.main, 'lib/index.js')
    assert.equal(manifest.exports['./client'].default, './lib/client.js')
    assert.deepEqual(manifest.files, repoManifest.files)
    for (const path of REQUIRED_PACKED) assert.ok(existsSync(join(packageDir, path)), `unpacked package is missing ${path}`)
    assert.deepEqual((await listFiles(packageDir)).sort(), packed.files.map(file => file.path).sort())

    // 4. Register the packaged host entry in a real Cordis context and read the
    //    typed remote contract back from the live service.
    const host = await import(pathToFileURL(join(packageDir, 'lib', 'index.js')).href)
    const Host = host.default
    assert.ok(Host.inject.includes('llm'))
    assert.equal(Host.Config.meta.volatile, true)
    const ctx = new Context()
    ctx.plugin(TypertRegistry)
    ctx.plugin(SessionStore)
    ctx.plugin(LlmRuntime)
    ctx.plugin(DefaultModel, { provider: 'smoke', model: 'smoke' })
    await ctx.plugin(Host)
    try {
      assert.deepEqual(remoteMethods(ctx.promptBooster).map(method => method.method), ['boost', 'feedback'])
    } finally { await ctx.fiber.dispose() }

    // 5. Execute the packaged browser entry exactly like the DSH client module
    //    table does, then build its exports through the shared React runtime.
    let entry
    runInNewContext(await readFile(join(packageDir, 'lib', 'client.js'), 'utf8'), {
      window: { __ModuleLoader__: { load(value) { entry = value } } },
      console, TextEncoder, TextDecoder, AbortController, AbortSignal,
    }, { timeout: 3000 })
    assert.ok(entry, 'packaged client must call window.__ModuleLoader__.load')
    assert.equal(entry.id, 'dsh-prompt-booster')
    const baselineModules = new Set(['react', 'react/jsx-runtime', 'react-dom'])
    const client = entry.factory(specifier => {
      assert.ok(baselineModules.has(specifier), `unexpected browser runtime import: ${specifier}`)
      return requireFromRoot(specifier)
    })
    assert.equal(typeof client.apply, 'function')
    assert.ok(client.inject.includes('slots'))
    assert.ok(client.inject.includes('remote'))

    console.log(`smoke-tarball: verified ${tarballName} (${packed.files.length} files), host registration, remoteMethods boost/feedback, and browser module handoff.`)
  } finally {
    await rm(scratch, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 })
    assert.ok(!existsSync(scratch), 'scratch directory must be cleaned up')
  }
}

try {
  await main()
} catch (error) {
  console.error('smoke-tarball: FAILED')
  console.error(error)
  process.exitCode = 1
}
