#!/usr/bin/env node
/**
 * 校验 npm 发布包的内容：
 * - 必需文件齐全（含构建产物 lib/index.js、lib/core.js、lib/client.js、类型声明与 locale）；
 * - 包内只允许出现 files 声明的目录/文件（lib/、locale/、README.md、CHANGELOG.md、
 *   LICENSE、package.json、cordis.patch.yml），不得混入源码、测试、评测、文档、本地文件或 tarball。
 *
 * 使用 `npm pack --dry-run --json --ignore-scripts` 只读预览，不会生成 tarball 或执行 prepack。
 */
import { execSync } from 'node:child_process'

const requiredFiles = [
  'package.json',
  'README.md',
  'CHANGELOG.md',
  'LICENSE',
  'cordis.patch.yml',
  'locale/en.json',
  'locale/zh.json',
  'lib/index.js',
  'lib/core.js',
  'lib/client.js',
  'lib/types/index.d.ts',
]
const allowedRootFiles = new Set(['package.json', 'README.md', 'CHANGELOG.md', 'LICENSE', 'cordis.patch.yml'])
const allowedDirs = ['lib/', 'locale/']
const forbiddenDirPattern = /^(?:src|tests|evals|docs|scripts|demo|\.github|\.local|node_modules|dist)\//

let raw
try {
  raw = execSync('npm pack --dry-run --json --ignore-scripts', {
    cwd: process.cwd(),
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 16 * 1024 * 1024,
  })
} catch (error) {
  console.error('check-pack: npm pack --dry-run 执行失败')
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}

let entries
try {
  entries = JSON.parse(raw)
} catch {
  console.error('check-pack: 无法解析 npm pack --json 输出')
  process.exit(1)
}
const files = Array.isArray(entries) ? entries[0]?.files : undefined
if (!Array.isArray(files) || !files.length) {
  console.error('check-pack: npm pack --json 输出中没有文件列表')
  process.exit(1)
}
const paths = files.map(entry => String(entry.path).replaceAll('\\', '/'))
const errors = []

for (const path of paths) {
  if (allowedRootFiles.has(path) || allowedDirs.some(dir => path.startsWith(dir))) continue
  if (forbiddenDirPattern.test(path) || path.endsWith('.tgz')) errors.push(`不应打包 ${path}`)
  else errors.push(`包内文件未在 package.json files 中声明：${path}`)
}
for (const required of requiredFiles) {
  if (paths.includes(required)) continue
  const hint = required.startsWith('lib/') ? '（先运行 npm run build 生成 lib/）' : ''
  errors.push(`缺少必需文件 ${required}${hint}`)
}

if (errors.length) {
  console.error('check-pack: 包内容不符合发布约定：')
  for (const error of errors) console.error(`  - ${error}`)
  process.exitCode = 1
} else {
  console.log(`check-pack: OK（${paths.length} 个文件，必需文件与 files 白名单均符合）。`)
}
