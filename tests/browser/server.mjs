import { createServer } from 'node:http'
import { build } from 'esbuild'

const bundle = await build({ entryPoints: ['tests/browser/fixture.tsx'], bundle: true, write: false, format: 'esm', platform: 'browser', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"' } })
const app = bundle.outputFiles[0].contents
const html = '<!doctype html><html lang="zh"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Composer integration fixture</title><div id="root"></div><script type="module" src="/app.js"></script></html>'
const server = createServer((request, response) => {
  response.setHeader('cache-control', 'no-store')
  if (request.url === '/app.js') { response.setHeader('content-type', 'text/javascript'); response.end(app); return }
  if (request.url === '/') { response.setHeader('content-type', 'text/html; charset=utf-8'); response.end(html); return }
  response.writeHead(404); response.end()
})
server.listen(4318, '127.0.0.1')
for (const event of ['SIGTERM', 'SIGINT']) process.on(event, () => server.close())
