#!/usr/bin/env node
/**
 * 只读校验：包版本必须与所有对外文档中的版本引用一致。
 *
 * 约定：
 * - `package.json` 的 version 是唯一事实来源；package-lock 根包、README 版本徽章、
 *   README / INSTALLATION / PUBLISHING 里的 tarball 名、PUBLISHING 的发布命令示例、
 *   issue 模板的版本占位都必须一致。
 * - `CHANGELOG.md` 与 `docs/COMPATIBILITY.md` 记录历史版本，不参与校验，也不应由本脚本改写。
 * - 脚本不写任何文件；不一致时退出码 1 并列出文件与具体值。
 */
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const root = process.cwd()
const files = {
  manifest: 'package.json',
  lock: 'package-lock.json',
  readme: 'README.md',
  installation: 'docs/INSTALLATION.md',
  publishing: 'docs/PUBLISHING.md',
  issueTemplate: '.github/ISSUE_TEMPLATE/bug_report.yml',
}
const failures = []
const checked = []

async function read(relative) {
  try {
    return await readFile(resolve(root, relative), 'utf8')
  } catch (error) {
    failures.push(`${relative}: 无法读取（${error instanceof Error ? error.message : String(error)}）`)
    return undefined
  }
}

/** 收集某一模式下的版本引用并逐一比较；必须至少出现一次。 */
function expectVersions(relative, content, pattern, label, version) {
  const values = [...content.matchAll(pattern)].map(match => match[1])
  if (!values.length) {
    failures.push(`${relative}: 未找到 ${label}`)
    return
  }
  for (const value of values) {
    if (value !== version) failures.push(`${relative}: ${label} 为 ${value}，与 package.json 的 ${version} 不一致`)
  }
}

const manifestText = await read(files.manifest)
if (manifestText !== undefined) {
  let version
  try {
    version = JSON.parse(manifestText).version
  } catch (error) {
    failures.push(`${files.manifest}: 不是合法 JSON（${error instanceof Error ? error.message : String(error)}）`)
  }
  if (!/^\d+\.\d+\.\d+$/.test(version ?? '')) {
    failures.push(`${files.manifest}: version 必须为 x.y.z，实际 ${JSON.stringify(version)}`)
  }
  if (typeof version === 'string' && /^\d+\.\d+\.\d+$/.test(version)) {
    checked.push(`${files.manifest} (${version})`)
    const lockText = await read(files.lock)
    if (lockText !== undefined) {
      try {
        const lock = JSON.parse(lockText)
        const rootVersion = lock.packages?.['']?.version
        if (lock.version !== version) failures.push(`${files.lock}: version 为 ${lock.version}，与 package.json 的 ${version} 不一致`)
        if (rootVersion !== version) failures.push(`${files.lock}: packages[""].version 为 ${rootVersion}，与 package.json 的 ${version} 不一致`)
        if (lock.version === version && rootVersion === version) checked.push(files.lock)
      } catch (error) {
        failures.push(`${files.lock}: 不是合法 JSON（${error instanceof Error ? error.message : String(error)}）`)
      }
    }

    const readme = await read(files.readme)
    if (readme !== undefined) {
      expectVersions(files.readme, readme, /badge\/version-(\d+\.\d+\.\d+)-/g, '版本徽章', version)
      expectVersions(files.readme, readme, /dsh-prompt-booster-(\d+\.\d+\.\d+)\.tgz/g, 'tarball 文件名', version)
      checked.push(files.readme)
    }

    const installation = await read(files.installation)
    if (installation !== undefined) {
      expectVersions(files.installation, installation, /dsh-prompt-booster-(\d+\.\d+\.\d+)\.tgz/g, 'tarball 文件名', version)
      checked.push(files.installation)
    }

    const publishing = await read(files.publishing)
    if (publishing !== undefined) {
      expectVersions(files.publishing, publishing, /dsh-prompt-booster-(\d+\.\d+\.\d+)\.tgz/g, 'tarball 文件名', version)
      expectVersions(files.publishing, publishing, /git tag v(\d+\.\d+\.\d+)/g, 'tag 示例', version)
      expectVersions(files.publishing, publishing, /git push origin v(\d+\.\d+\.\d+)/g, '推送 tag 示例', version)
      expectVersions(files.publishing, publishing, /release:version (\d+\.\d+\.\d+)/g, 'release:version 示例', version)
      checked.push(files.publishing)
    }

    if (existsSync(resolve(root, files.issueTemplate))) {
      const template = await read(files.issueTemplate)
      const block = template?.match(/id:\s*plugin-version[\s\S]{0,240}?placeholder:\s*"([^"]*)"/)
      if (!block) {
        failures.push(`${files.issueTemplate}: 未找到 plugin-version 的版本占位（placeholder）`)
      } else {
        const placeholder = block[1].trim()
        const full = placeholder.match(/\b(\d+)\.(\d+)\.(\d+)\b/)
        const minor = placeholder.match(/\b(\d+)\.(\d+)\.x\b/)
        const expectedMinor = version.split('.').slice(0, 2).join('.')
        if (full) {
          const actual = full.slice(1, 4).join('.')
          if (actual !== version) failures.push(`${files.issueTemplate}: 版本占位为 ${actual}，与 package.json 的 ${version} 不一致`)
        } else if (minor) {
          const actual = `${minor[1]}.${minor[2]}.x`
          if (actual !== `${expectedMinor}.x`) failures.push(`${files.issueTemplate}: 版本占位为 ${actual}，与 package.json 的 ${version} 不一致`)
        } else {
          failures.push(`${files.issueTemplate}: 无法解析版本占位 ${JSON.stringify(placeholder)}`)
        }
        checked.push(files.issueTemplate)
      }
    }
  }
}

if (failures.length) {
  console.error('check-versions: 版本引用不一致：')
  for (const failure of failures) console.error(`  - ${failure}`)
  console.error('  （历史版本条目 CHANGELOG.md / docs/COMPATIBILITY.md 不参与本校验）')
  process.exitCode = 1
} else {
  console.log(`check-versions: OK（${checked.join('、')}）；历史条目 CHANGELOG.md / docs/COMPATIBILITY.md 不校验。`)
}
