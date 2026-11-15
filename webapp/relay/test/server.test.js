import { test } from 'node:test'
import assert from 'node:assert/strict'
import WebSocket from 'ws'
import { createServer } from '../src/server.js'
import { SimulatedFeed, blackScholes } from '../src/feeds/simulatedFeed.js'
import { signToken } from '../src/auth.js'

const secret = 'test-secret'
const token = () => signToken({ username: 'guest', role: 'guest', aud: 'live', exp: Date.now() + 60_000 }, secret)

async function startRelay() {
  const feed = new SimulatedFeed({ intervalMs: 20 })
  const { server } = createServer({ feed, secret })
  feed.start()
  await new Promise((resolve) => server.listen(0, resolve))
  const { port } = server.address()
  return {
    port,
    close: () => {
      feed.stop()
      server.closeAllConnections?.()
      return new Promise((resolve) => server.close(resolve))
    },
  }
}

function nextMessage(ws, type) {
  return new Promise((resolve) => {
    ws.on('message', function listener(data) {
      const message = JSON.parse(String(data))
      if (message.type === type) {
        ws.off('message', listener)
        resolve(message)
      }
    })
  })
}

test('streams ticks for subscribed symbols over WebSocket', async () => {
  const relay = await startRelay()
  const ws = new WebSocket(`ws://localhost:${relay.port}/ws?token=${token()}`)
  const hello = await nextMessage(ws, 'hello')
  assert.equal(hello.mode, 'simulated')
  ws.send(JSON.stringify({ type: 'subscribe', symbols: ['NSE:RELIANCE'] }))
  const { ticks } = await nextMessage(ws, 'ticks')
  assert.equal(ticks[0].symbol, 'NSE:RELIANCE')
  assert.ok(ticks[0].ltp > 0)
  ws.close()
  await relay.close()
})

test('refuses WebSocket connections without a valid token', async () => {
  const relay = await startRelay()
  const ws = new WebSocket(`ws://localhost:${relay.port}/ws?token=bad`)
  const error = await new Promise((resolve) => ws.on('error', resolve))
  assert.match(String(error.message), /401/)
  await relay.close()
})

test('serves search and the option chain to authorised requests only', async () => {
  const relay = await startRelay()
  const base = `http://localhost:${relay.port}`
  assert.equal((await fetch(`${base}/instruments/search?q=rel`)).status, 401)
  const search = await (await fetch(`${base}/instruments/search?q=rel`, { headers: { Authorization: `Bearer ${token()}` } })).json()
  assert.equal(search.results[0].symbol, 'NSE:RELIANCE')
  const chain = await (await fetch(`${base}/option-chain?underlying=NIFTY`, { headers: { Authorization: `Bearer ${token()}` } })).json()
  assert.equal(chain.spotSymbol, 'NSE:NIFTY 50')
  assert.ok(chain.strikes.length > 20)
  assert.ok(chain.strikes.every((s) => s.ce.endsWith('CE') && s.pe.endsWith('PE')))
  await relay.close()
})

test('prices calls and puts consistently (put-call parity)', () => {
  const call = blackScholes(24000, 24000, 7 / 365, 0.13, true)
  const put = blackScholes(24000, 24000, 7 / 365, 0.13, false)
  assert.ok(Math.abs(call - put) < 1)
  assert.ok(blackScholes(24000, 23000, 7 / 365, 0.13, true) > 1000)
})
