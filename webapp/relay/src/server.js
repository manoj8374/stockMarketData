import http from 'node:http'
import { WebSocketServer } from 'ws'
import { verifyToken } from './auth.js'
import { Hub } from './hub.js'

const MAX_MESSAGE_BYTES = 16 * 1024

function bearerToken(req, url) {
  const header = req.headers.authorization ?? ''
  return header.startsWith('Bearer ') ? header.slice(7) : url.searchParams.get('token')
}

export function createServer({ feed, secret, allowedOrigins = [] }) {
  const hub = new Hub(feed)
  const isAllowedOrigin = (origin) => !allowedOrigins.length || !origin || allowedOrigins.includes(origin)

  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://relay')
    const origin = req.headers.origin
    if (origin && isAllowedOrigin(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin)
      res.setHeader('Access-Control-Allow-Headers', 'Authorization')
      res.setHeader('Vary', 'Origin')
    }
    const json = (status, body) => {
      res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
      res.end(JSON.stringify(body))
    }
    if (req.method === 'OPTIONS') {
      res.writeHead(204)
      return res.end()
    }
    if (url.pathname === '/health') {
      return json(200, { ok: true, mode: feed.mode, feed: feed.status, clients: hub.clientCount, symbols: hub.symbolCount })
    }
    if (!verifyToken(bearerToken(req, url), secret)) return json(401, { error: 'Unauthorized' })
    if (url.pathname === '/instruments/search') return json(200, { results: feed.search(url.searchParams.get('q') ?? '') })
    if (url.pathname === '/option-chain') {
      const chain = feed.optionChain(url.searchParams.get('underlying') ?? 'NIFTY', url.searchParams.get('expiry') ?? undefined)
      return chain ? json(200, chain) : json(503, { error: 'The option chain is not available yet. Try again in a minute.' })
    }
    json(404, { error: 'Not found' })
  })

  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_MESSAGE_BYTES })

  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url, 'http://relay')
    if (url.pathname !== '/ws' || !isAllowedOrigin(req.headers.origin) || !verifyToken(url.searchParams.get('token'), secret)) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n')
      socket.destroy()
      return
    }
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws))
  })

  wss.on('connection', (ws) => {
    const client = {
      send(message) {
        if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(message))
      },
    }
    hub.addClient(client)
    ws.on('message', (data) => {
      try {
        hub.handle(client, JSON.parse(String(data)))
      } catch {
        client.send({ type: 'error', message: 'Messages must be JSON' })
      }
    })
    ws.on('close', () => hub.removeClient(client))
    ws.on('error', () => ws.terminate())
  })

  return { server, hub, feed }
}
