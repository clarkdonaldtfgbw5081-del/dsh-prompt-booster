#!/usr/bin/env node
/**
 * 从 CHANGELOG.md 提取指定版本的 release notes，并加上版本与 DSH 基线声明，
 * 供 .github/workflows/release.yml 直接写入 GitHub Release。
 *
 * 用法：node scripts/changelog-notes.mjs <tag-or-version>
 */
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const tag = process.argv[2] ?? process.env.GITHUB_REF_NAME ?? ''
const version = tag.replace(/^v/, '')
if (!version) {
  console.error('usage: node scripts/changelog-notes.mjs <tag-or-version>')
  process.exit(1)
}
const lines = (await readFile('CHANGELOG.md', 'utf8')).split(/\r?\n/)
const start = lines.findIndex(line => line.startsWith('## [') && line.slice(4).startsWith(version + ']'))
if (start < 0) {
  console.error(`release notes not found for ${version} in CHANGELOG.md`)
  process.exit(1)
}
const next = lines.findIndex((line, index) => index > start && line.startsWith('## ['))
const notes = lines.slice(start, next < 0 ? undefined : next).join('\n').trimEnd()

const manifest = JSON.parse(await readFile(join(dirname(fileURLToPath(import.meta.url)), '..', 'package.json'), 'utf8'))
const baseline = manifest.engines?.dsh
const header = [
  `> 插件版本：\`${manifest.version}\``,
  baseline ? `DSH 基线：\`${baseline}\`` : undefined,
].filter(Boolean).join('；')

process.stdout.write(`${header}。\n\n${notes}\n`)
