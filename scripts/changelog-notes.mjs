#!/usr/bin/env node
import { readFile } from 'node:fs/promises'

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
process.stdout.write(notes + '\n')
