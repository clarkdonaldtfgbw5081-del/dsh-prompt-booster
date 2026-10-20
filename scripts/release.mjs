#!/usr/bin/env node
/**
 * 把新版本号同步到所有对外位置（不包含 CHANGELOG 的历史条目）：
 * - package.json / package-lock.json（含根包 entry 与依赖同步）
 * - README.md 版本徽章与 dsh-prompt-booster-<v>.tgz 引用
 * - docs/INSTALLATION.md、docs/PUBLISHING.md 的 tarball 与发布命令示例
 * - .github/ISSUE_TEMPLATE/bug_report.yml 的版本占位
 *
 * 用法：node scripts/release.mjs <x.y.z> [--dry-run]
 * 任一期望的版本引用缺失时整体失败且不写文件；成功时打印改动清单。
 */
import { existsSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const unknownFlags = args.filter(arg => arg.startsWith('--') && arg !== '--dry-run')
const positional = args.filter(arg => !arg.startsWith('--'))

function fail(message) {
  console.error(`release: ${message}`)
  process.exit(1)
}

if (unknownFlags.length) fail(`未知参数：${unknownFlags.join(' ')}`)
if (positional.length !== 1) fail('用法：node scripts/release.mjs <x.y.z> [--dry-run]')
const version = positional[0]
if (!/^\d+\.\d+\.\d+$/.test(version)) fail(`版本号必须为 x.y.z，实际 ${JSON.stringify(version)}`)

const root = process.cwd()
const filePath = relative => resolve(root, relative)
const writes = []
const errors = []

function stage(relative, content, summary) {
  writes.push({ relative, content, summary })
}

function replacePattern(text, pattern, replacement, label, relative) {
  const count = [...text.matchAll(pattern)].length
  if (!count) {
    errors.push(`${relative}: 未找到${label}`)
    return text
  }
  return text.replace(pattern, replacement)
}

async function readText(relative) {
  return readFile(filePath(relative), 'utf8')
}

const manifest = JSON.parse(await readText('package.json'))
const old = manifest.version
if (old === version) {
  console.log(`release: 版本已经是 ${version}，未做改动。`)
  process.exit(0)
}
manifest.version = version
stage('package.json', `${JSON.stringify(manifest, null, 2)}\n`, 'version')

const lock = JSON.parse(await readText('package-lock.json'))
lock.version = version
if (lock.packages?.['']) {
  Object.assign(lock.packages[''], { version, peerDependencies: manifest.peerDependencies, devDependencies: manifest.devDependencies })
} else {
  errors.push('package-lock.json: 缺少 packages[""] 根包条目')
}
stage('package-lock.json', `${JSON.stringify(lock, null, 2)}\n`, 'version、packages[""].version、依赖同步')

const readme = await readText('README.md')
let nextReadme = replacePattern(readme, /badge\/version-\d+\.\d+\.\d+-/g, `badge/version-${version}-`, '版本徽章', 'README.md')
nextReadme = replacePattern(nextReadme, /dsh-prompt-booster-\d+\.\d+\.\d+\.tgz/g, `dsh-prompt-booster-${version}.tgz`, ' tarball 引用', 'README.md')
stage('README.md', nextReadme, '版本徽章、tarball 引用')

const installation = await readText('docs/INSTALLATION.md')
stage(
  'docs/INSTALLATION.md',
  replacePattern(installation, /dsh-prompt-booster-\d+\.\d+\.\d+\.tgz/g, `dsh-prompt-booster-${version}.tgz`, ' tarball 引用', 'docs/INSTALLATION.md'),
  'tarball 引用',
)

const publishing = await readText('docs/PUBLISHING.md')
let nextPublishing = replacePattern(publishing, /dsh-prompt-booster-\d+\.\d+\.\d+\.tgz/g, `dsh-prompt-booster-${version}.tgz`, ' tarball 引用', 'docs/PUBLISHING.md')
nextPublishing = replacePattern(nextPublishing, /git tag v\d+\.\d+\.\d+/g, `git tag v${version}`, ' tag 示例', 'docs/PUBLISHING.md')
nextPublishing = replacePattern(nextPublishing, /git push origin v\d+\.\d+\.\d+/g, `git push origin v${version}`, '推送 tag 示例', 'docs/PUBLISHING.md')
nextPublishing = replacePattern(nextPublishing, /release:version \d+\.\d+\.\d+/g, `release:version ${version}`, ' release:version 示例', 'docs/PUBLISHING.md')
stage('docs/PUBLISHING.md', nextPublishing, 'tarball、tag、推送与 release:version 示例')

const issueTemplate = '.github/ISSUE_TEMPLATE/bug_report.yml'
if (existsSync(filePath(issueTemplate))) {
  const template = await readText(issueTemplate)
  const placeholder = /(id:\s*plugin-version[\s\S]{0,240}?placeholder:\s*")([^"]*)(")/
  if (!placeholder.test(template)) {
    errors.push(`${issueTemplate}: 未找到 plugin-version 版本占位`)
  } else {
    stage(issueTemplate, template.replace(placeholder, `$1${version}$3`), '版本占位')
  }
} else {
  console.log(`release: ${issueTemplate} 不存在，跳过版本占位。`)
}

if (errors.length) {
  console.error('release: 版本引用不完整，未写入任何文件：')
  for (const error of errors) console.error(`  - ${error}`)
  process.exit(1)
}

console.log(`release: ${old} -> ${version}`)
for (const write of writes) console.log(`  ${write.relative}: ${write.summary}`)

if (dryRun) {
  console.log('release: dry-run，未写入文件。')
} else {
  for (const write of writes) await writeFile(filePath(write.relative), write.content)
  console.log(`release: 已写入 ${writes.length} 个文件；请运行 node scripts/check-versions.mjs 复核。`)
}
