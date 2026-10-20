import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { resolve, join, relative, isAbsolute } from 'node:path'
import { fileURLToPath } from 'node:url'

const script = fileURLToPath(new URL('../scripts/check-publish.mjs', import.meta.url))
async function fixture(run: (directory: string) => Promise<void>) {
  const root = resolve(process.cwd())
  const directory = await mkdtemp(join(root, '.test-publish-'))
  try {
    execFileSync('git', ['init', '--quiet'], { cwd: directory })
    await run(directory)
  } finally {
    const local = relative(root, directory)
    assert.ok(!local.startsWith('..') && !isAbsolute(local) && local.startsWith('.test-publish-'))
    await rm(directory, { recursive: true, force: true })
  }
}
const scan = (cwd: string, ...args: string[]) => spawnSync(process.execPath, [script, ...args], { cwd, encoding: 'utf8' })
const git = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, stdio: 'ignore' })

test('publish scan reads staged blobs even when the working copy was sanitized', async () => {
  await fixture(async directory => {
    const secret = 'sk-' + 'x'.repeat(24)
    await writeFile(join(directory, 'config.json'), JSON.stringify({ key: secret }))
    git(directory, 'add', 'config.json')
    await writeFile(join(directory, 'config.json'), '{}')
    assert.equal(scan(directory).status, 0)
    const result = scan(directory, '--staged')
    assert.equal(result.status, 1)
    assert.match(result.stderr, /config.json/)
    assert.ok(!result.stderr.includes(secret))
  })
})

test('nested environment files are blocked but safe examples are allowed', async () => {
  await fixture(async directory => {
    await mkdir(join(directory, 'config'))
    await writeFile(join(directory, 'config', '.env.example'), 'API_KEY=replace-me\n')
    assert.equal(scan(directory).status, 0)
    await writeFile(join(directory, 'config', '.env.production'), 'API_KEY=replace-me\n')
    const result = scan(directory)
    assert.equal(result.status, 1)
    assert.match(result.stderr, /config\/\.env.production/)
  })
})

test('credentials in extensionless files and fine-grained tokens are checked', async () => {
  await fixture(async directory => {
    const secret = 'github_' + 'pat_' + 'a'.repeat(40)
    await writeFile(join(directory, 'config'), secret)
    const result = scan(directory)
    assert.equal(result.status, 1)
    assert.ok(!result.stderr.includes(secret))
    assert.match(result.stderr, /config/)
  })
})

test('an empty index passes and staged files remain checked when absent from the working copy', async () => {
  await fixture(async directory => {
    assert.equal(scan(directory, '--staged').status, 0)
    await writeFile(join(directory, 'README.md'), 'Example')
    git(directory, 'add', 'README.md')
    await rm(join(directory, 'README.md'))
    assert.equal(scan(directory, '--staged').status, 0)
  })
})
