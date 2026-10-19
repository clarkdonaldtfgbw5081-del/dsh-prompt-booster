import { build } from 'esbuild'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'

await rm('lib', { recursive: true, force: true })
await rm('demo/dist', { recursive: true, force: true })
await mkdir('lib', { recursive: true })
await mkdir('demo/dist', { recursive: true })
await build({ entryPoints: { index: 'src/index.ts', core: 'src/core/engine.ts' }, outdir: 'lib',
  bundle: true, format: 'esm', platform: 'node', target: 'node22', packages: 'external' })
const client = await build({ entryPoints: ['src/client/index.tsx'], bundle: true, format: 'cjs', platform: 'browser',
  target: 'es2022', external: ['react', 'react/jsx-runtime', 'react-dom'], write: false, metafile: true, minify: true,
  define: { 'process.env.NODE_ENV': '"production"' } })
console.log(`Client bundle: ${(client.outputFiles[0].text.length / 1024).toFixed(0)} KiB`)
await writeFile('demo/dist/client-meta.json', JSON.stringify(client.metafile, null, 2))
// DSH loads client plugins via its module table. React stays shared with the host renderer.
await writeFile('lib/client.js', `window.__ModuleLoader__.load({ id: 'dsh-prompt-booster', factory: (require) => {\nconst module = { exports: {} }; const exports = module.exports;\n${client.outputFiles[0].text}\nreturn module.exports;\n} });\n`)
await build({ entryPoints: ['demo/app.tsx'], bundle: true, format: 'esm', platform: 'browser',
  target: 'es2022', outfile: 'demo/dist/app.js', define: { 'process.env.NODE_ENV': '"production"' } })
await writeFile('demo/dist/index.html', await readFile('demo/index.html', 'utf8'))
for (const face of ['host', 'client']) execFileSync(process.execPath, [
  'node_modules/typescript/bin/tsc', '-p', `tsconfig.${face}.json`, '--noEmit', 'false',
  '--emitDeclarationOnly', '--declaration', '--rootDir', 'src', '--outDir', 'lib/types',
], { stdio: 'inherit' })
console.log('Built host plugin, DSH client bundle, declarations, and local demo.')
