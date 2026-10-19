import { readFile, writeFile } from 'node:fs/promises'
const version = process.argv[2]
if (!/^\d+\.\d+\.\d+$/.test(version ?? '')) throw new Error('version required')
const manifest = JSON.parse(await readFile('package.json', 'utf8'))
const old = manifest.version
manifest.version = version
await writeFile('package.json', JSON.stringify(manifest, null, 2) + '\n')
const lock = JSON.parse(await readFile('package-lock.json', 'utf8'))
lock.version = version
Object.assign(lock.packages[''], { version, peerDependencies: manifest.peerDependencies, devDependencies: manifest.devDependencies })
await writeFile('package-lock.json', JSON.stringify(lock, null, 2) + '\n')
const readme = await readFile('README.md', 'utf8')
await writeFile('README.md', readme.replaceAll('dsh-prompt-booster-' + old + '.tgz', 'dsh-prompt-booster-' + version + '.tgz'))
