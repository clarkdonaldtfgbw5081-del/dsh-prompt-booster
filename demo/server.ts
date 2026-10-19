import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { BoostEngine } from '../src/core/engine.ts'
import { createEventLog } from '../src/client/events.ts'
import { compatibleProvider, demoProvider } from './provider.ts'

const port = Number(process.env.BOOST_PORT ?? 4317)
const provider = process.env.BOOST_API_KEY ? compatibleProvider() : demoProvider
const eventLog = createEventLog()
const engine = new BoostEngine(provider, { timeoutMs: 15000, onEvent: eventLog.record })
const assets: Record<string, { path: string; type: string }> = {
  '/': { path: 'dist/index.html', type: 'text/html; charset=utf-8' },
  '/app.js': { path: 'dist/app.js', type: 'text/javascript; charset=utf-8' },
}
const server = createServer(async (req, res) => {
  res.setHeader('cache-control', 'no-store')
  res.setHeader('x-content-type-options', 'nosniff')
  try {
    if (req.url === '/api/info' && req.method === 'GET') {
      res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ demo: provider === demoProvider, model: provider.name })); return
    }
    if (req.url === '/api/events' && req.method === 'GET') {
      res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ events: eventLog.snapshot() })); return
    }
    if (req.url === '/api/boost' && req.method === 'POST') {
      if (req.headers.origin !== `http://127.0.0.1:${port}` || !req.headers['content-type']?.startsWith('application/json')) {
        res.writeHead(403); res.end('Forbidden'); return
      }
      const controller = new AbortController()
      res.on('close', () => controller.abort())
      let total = 0
      const chunks: Buffer[] = []
      for await (const chunk of req) {
        total += chunk.length
        if (total > 160000) { res.writeHead(413); res.end('Too large'); return }
        chunks.push(chunk)
      }
      const result = await engine.boost(JSON.parse(Buffer.concat(chunks).toString('utf8')), controller.signal)
      if (!res.destroyed) { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(result)) }
      return
    }
    const asset = assets[req.url ?? '']
    if (asset && req.method === 'GET') {
      const data = await readFile(fileURLToPath(new URL(asset.path, import.meta.url)))
      res.setHeader('content-type', asset.type); res.end(data); return
    }
    res.writeHead(404); res.end('Not found')
  } catch { if (!res.destroyed) { res.writeHead(400); res.end('Invalid request') } }
})
server.listen(port, '127.0.0.1', () => console.log(`Prompt Booster: http://127.0.0.1:${port} (${provider.name})`))
for (const event of ['SIGINT', 'SIGTERM'] as const) process.on(event, () => server.close())
