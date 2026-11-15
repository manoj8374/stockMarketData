import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { Hub } from '../src/hub.js'

class FakeFeed extends EventEmitter {
  mode = 'simulated'
  status = { state: 'live' }
  subscribed = []
  unsubscribed = []
  subscribe(symbols) {
    this.subscribed.push(...symbols)
  }
  unsubscribe(symbols) {
    this.unsubscribed.push(...symbols)
  }
  latest() {
    return null
  }
  async history() {
    return [{ t: 0, o: 1, h: 2, l: 1, c: 2, v: 0 }]
  }
}

function fakeClient() {
  const messages = []
  return { messages, send: (m) => messages.push(m) }
}

test('subscribes upstream once per symbol and releases with the last viewer', () => {
  const feed = new FakeFeed()
  const hub = new Hub(feed)
  const a = fakeClient()
  const b = fakeClient()
  hub.addClient(a)
  hub.addClient(b)
  hub.handle(a, { type: 'subscribe', symbols: ['NSE:X', 'NSE:Y'] })
  hub.handle(b, { type: 'subscribe', symbols: ['NSE:X'] })
  assert.deepEqual(feed.subscribed, ['NSE:X', 'NSE:Y'])

  hub.handle(a, { type: 'unsubscribe', symbols: ['NSE:X'] })
  assert.deepEqual(feed.unsubscribed, [])
  hub.removeClient(b)
  assert.deepEqual(feed.unsubscribed, ['NSE:X'])
  assert.equal(hub.symbolCount, 1)
})

test('sends each client only the ticks it asked for', () => {
  const feed = new FakeFeed()
  const hub = new Hub(feed)
  const a = fakeClient()
  const b = fakeClient()
  hub.addClient(a)
  hub.addClient(b)
  hub.handle(a, { type: 'subscribe', symbols: ['NSE:X'] })
  hub.handle(b, { type: 'subscribe', symbols: ['NSE:Y'] })
  feed.emit('ticks', [
    { symbol: 'NSE:X', ltp: 1, ts: 0 },
    { symbol: 'NSE:Y', ltp: 2, ts: 0 },
  ])
  const ticksFor = (c) => c.messages.filter((m) => m.type === 'ticks').flatMap((m) => m.ticks.map((t) => t.symbol))
  assert.deepEqual(ticksFor(a), ['NSE:X'])
  assert.deepEqual(ticksFor(b), ['NSE:Y'])
})

test('greets new clients and answers pings', () => {
  const hub = new Hub(new FakeFeed())
  const a = fakeClient()
  hub.addClient(a)
  hub.handle(a, { type: 'ping' })
  assert.equal(a.messages[0].type, 'hello')
  assert.equal(a.messages[1].type, 'pong')
})

test('serves candle history only for subscribed symbols', async () => {
  const hub = new Hub(new FakeFeed())
  const a = fakeClient()
  hub.addClient(a)
  hub.handle(a, { type: 'history', symbol: 'NSE:X' })
  hub.handle(a, { type: 'subscribe', symbols: ['NSE:X'] })
  hub.handle(a, { type: 'history', symbol: 'NSE:X' })
  await new Promise((r) => setImmediate(r))
  const candles = a.messages.filter((m) => m.type === 'candles')
  assert.equal(candles.length, 1)
  assert.equal(candles[0].candles.length, 1)
})

test('broadcasts feed status changes', () => {
  const feed = new FakeFeed()
  const hub = new Hub(feed)
  const a = fakeClient()
  hub.addClient(a)
  feed.emit('status', { state: 'down', message: 'Kite token expired' })
  assert.deepEqual(a.messages.at(-1), { type: 'feed', state: 'down', message: 'Kite token expired' })
})
