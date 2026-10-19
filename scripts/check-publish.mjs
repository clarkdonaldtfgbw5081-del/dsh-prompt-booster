#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
import { readFile, stat } from 'node:fs/promises'
import { readdirSync } from 'node:fs'
import { resolve } from 'node:path'

const root = process.cwd()
const forbiddenPath = [
  /^(?:\.reference|\.local|node_modules|lib|demo\/dist)(?:\/|$)/,
  /^install-backup-/,
  /\.tgz$/,
  /^\.env(?:$|\.)/,
  /\.(?:pem|key)$/,
]
const forbiddenText = [
  /\b[A-Za-z]:[\\/]/, // local drive paths (test fixtures are excluded below)
  /DeepSeek-Harness-Recovered/,
  /\b17959\b/, // local Windows user name used during development
  /dsh-home[\\/]/,
]
const textExtensions = /\.(?:md|mdx|ts|tsx|js|mjs|cjs|json|yml|yaml|html|css|txt)$/
const skippedTextFiles = new Set([
  'scripts/check-publish.mjs',
  'docs/PUBLISHING.md',
  'evals/cases.ts',
])
const skippedDirs = new Set(['node_modules', '.git', 'lib', 'dist'])

function walk(dir = root, prefix = '') {
  const files = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name
    if (entry.isDirectory()) {
      if (skippedDirs.has(entry.name) || path === 'demo/dist') continue
      files.push(...walk(resolve(dir, entry.name), path))
    } else if (entry.isFile()) {
      files.push(path)
    }
  }
  return files
}

function listFiles() {
  try {
    return execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], {
      cwd: root,
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
    }).split('\0').filter(Boolean)
  } catch {
    console.error('check-publish: not a git repository; checking the working tree instead')
    return walk()
  }
}

const files = listFiles()
const errors = []
const seen = new Set(files)
for (const file of files) {
  const path = file.replaceAll('\\', '/')
  if (forbiddenPath.some(pattern => pattern.test(path))) {
    errors.push(`forbidden path is visible to git: ${path}`)
  }
  const full = resolve(root, file)
  let info
  try { info = await stat(full) } catch { continue }
  if (info.size > 2 * 1024 * 1024) {
    errors.push(`tracked file is larger than 2 MB: ${path}`)
  }
  if (!textExtensions.test(path) || skippedTextFiles.has(path) || path.startsWith('tests/')) continue
  let content
  try { content = await readFile(full, 'utf8') } catch { continue }
  for (const pattern of forbiddenText) {
    const match = content.match(pattern)
    if (match) errors.push(`local/private text in ${path}: ${match[0]}`)
  }
}

if (!seen.size) {
  console.error('check-publish: no files found (run this inside the repository)')
  process.exitCode = 1
} else if (errors.length) {
  console.error('check-publish: found release-blocking content:')
  for (const error of errors) console.error(`  - ${error}`)
  process.exitCode = 1
} else {
  console.log(`check-publish: OK (${seen.size} files)`)
}
