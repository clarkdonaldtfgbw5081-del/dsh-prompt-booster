#!/usr/bin/env node
/**
 * 发布前检查（pre-commit / CI）：
 * - 禁止路径：本地参考副本、备份、node_modules、lib、tarball、.env、私钥文件等被 git 看见；
 * - 禁止文本：本机盘符路径、开发者目录名、本机用户名等（tests/ 中的固定路径样例除外）；
 * - 密钥模式扫描：sk-、AWS 长期/临时 access key id、GitHub 常见 token、PEM 私钥块。
 *
 * 密钥命中只报告文件与模式名，不输出匹配内容，避免把疑似凭据打印到 CI 日志。
 * 默认扫描 git 可见的工作区文件；--staged 读取实际暂存 blob，供 pre-commit 使用。
 * 扫描所有文本（含无扩展名文件），不写文件、不读取 Git 历史，也不能识别全部凭据。
 */
import { execFileSync } from 'node:child_process'
import { readFile, lstat, readlink } from 'node:fs/promises'
import { readdirSync } from 'node:fs'
import { resolve } from 'node:path'

const root = process.cwd()
const args = process.argv.slice(2)
if (args.some(arg => arg !== '--staged')) {
  console.error('check-publish: usage: node scripts/check-publish.mjs [--staged]')
  process.exit(1)
}
const staged = args.includes('--staged')
const forbiddenPath = [
  /^(?:\.reference|\.local|node_modules|lib|demo\/dist)(?:\/|$)/,
  /^install-backup-/,
  /\.tgz$/,
  /(?:^|\/)\.env(?:$|\.)(?!example$)/,
  /(?:^|\/)\.credentials(?:$|\.)/,
  /\.(?:pem|key)$/,
]
const forbiddenText = [
  /\b[A-Za-z]:[\\/]/, // local drive paths (tests fixtures are excluded below)
  /DeepSeek-Harness-Recovered/,
  /\b17959\b/, // local Windows user name used during development
  /dsh-home[\\/]/,
]
const secretPatterns = [
  { name: 'sk- 风格 API 密钥', pattern: /\bsk-[A-Za-z0-9_-]{20,}/ },
  { name: 'AWS access key id', pattern: /\b(?:AKIA|ASIA)[0-9A-Z]{16}/ },
  { name: 'GitHub token', pattern: /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,})/ },
  { name: 'PEM 私钥块', pattern: /-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----[\s\S]{0,200}?[A-Za-z0-9+/=]{32,}/ },
]
// 这些文件会引用“禁止出现”的模式本身（检查脚本自身 / 发布说明里的示例），只跳过文本模式检查。
const skippedTextFiles = new Set([
  'scripts/check-publish.mjs',
  'docs/PUBLISHING.md',
  'evals/cases.ts',
])
// 检查脚本包含自己的密钥正则表达式，跳过密钥扫描以免自匹配。
const skippedSecretFiles = new Set(['scripts/check-publish.mjs'])
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
    return execFileSync('git', ['ls-files', '-z', '--cached', ...(staged ? [] : ['--others', '--exclude-standard'])], {
      cwd: root,
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
    }).split('\0').filter(Boolean)
  } catch {
    if (staged) {
      console.error('check-publish: unable to read the Git index; staged check cannot fall back to the working tree')
      process.exit(1)
    }
    console.error('check-publish: not a git repository; checking the working tree instead')
    return walk()
  }
}

const files = [...new Set(listFiles())]
const errors = []
const seen = new Set(files)
for (const file of files) {
  const path = file.replaceAll('\\', '/')
  if (forbiddenPath.some(pattern => pattern.test(path))) {
    errors.push(`forbidden path is visible to git: ${path}`)
  }
  const full = resolve(root, file)
  let size
  if (staged) {
    // Read the actual index blob: sanitizing an unstaged working copy must not
    // hide a credential that would still be committed by git commit.
    try {
      size = Number(execFileSync('git', ['cat-file', '-s', `:${file}`], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim())
    } catch {
      errors.push(`cannot inspect staged file: ${path}`)
      continue
    }
  } else {
    try { size = (await lstat(full)).size } catch { continue }
  }
  if (size > 2 * 1024 * 1024) {
    errors.push(`tracked file is larger than 2 MB: ${path}`)
    continue
  }
  let bytes
  try {
    if (staged) bytes = execFileSync('git', ['cat-file', 'blob', `:${file}`], { cwd: root, maxBuffer: 2 * 1024 * 1024 + 1, stdio: ['ignore', 'pipe', 'ignore'] })
    else bytes = (await lstat(full)).isSymbolicLink() ? Buffer.from(await readlink(full)) : await readFile(full)
  } catch {
    errors.push(`cannot inspect file: ${path}`)
    continue
  }
  // Scan all text, including .npmrc, extensionless files and .env.example.
  if (bytes.includes(0)) continue
  const content = bytes.toString('utf8')
  if (!skippedSecretFiles.has(path)) {
    for (const secret of secretPatterns) {
      if (secret.pattern.test(content)) errors.push(`疑似${secret.name}出现在 ${path}（匹配内容不输出）`)
    }
  }
  if (skippedTextFiles.has(path) || path.startsWith('tests/')) continue
  for (const pattern of forbiddenText) {
    const match = content.match(pattern)
    if (match) errors.push(`local/private text in ${path}: ${match[0]}`)
  }
}

if (!seen.size && !staged) {
  console.error('check-publish: no files found (run this inside the repository)')
  process.exitCode = 1
} else if (errors.length) {
  console.error('check-publish: found release-blocking content:')
  for (const error of errors) console.error(`  - ${error}`)
  process.exitCode = 1
} else {
  console.log(`check-publish: OK (${seen.size} ${staged ? 'staged' : 'working-tree'} files, secret patterns checked)`)
}
