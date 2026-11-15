import { CandleBook } from './candles.js'

const MAX_SYMBOLS_PER_CLIENT = 300

// Tracks which browser wants which symbols. The upstream feed is subscribed
// once per symbol no matter how many browsers watch it, and unsubscribed when
// the last one leaves.
export class Hub {
  #feed
  #clients = new Map()
  #refCounts = new Map()
  #candles = new CandleBook()

  constructor(feed) {
    this.#feed = feed
    feed.on('ticks', (ticks) => this.#onTicks(ticks))
    feed.on('status', (status) => this.broadcast({ type: 'feed', ...status }))
  }

  get clientCount() {
    return this.#clients.size
  }

  get symbolCount() {
    return this.#refCounts.size
  }

  addClient(client) {
    this.#clients.set(client, new Set())
    client.send({ type: 'hello', mode: this.#feed.mode, status: this.#feed.status, serverTime: Date.now() })
  }

  removeClient(client) {
    const symbols = this.#clients.get(client)
    if (!symbols) return
    this.#release([...symbols])
    this.#clients.delete(client)
  }

  handle(client, message) {
    const symbols = Array.isArray(message.symbols) ? message.symbols.filter((s) => typeof s === 'string' && s.length < 64) : []
    switch (message.type) {
      case 'subscribe':
        return this.#subscribe(client, symbols)
      case 'unsubscribe':
        return this.#unsubscribe(client, symbols)
      case 'history':
        return this.#sendHistory(client, String(message.symbol ?? ''))
      case 'ping':
        return client.send({ type: 'pong', serverTime: Date.now() })
      default:
        return client.send({ type: 'error', message: `Unknown message type: ${message.type}` })
    }
  }

  broadcast(message) {
    for (const client of this.#clients.keys()) client.send(message)
  }

  #subscribe(client, symbols) {
    const owned = this.#clients.get(client)
    if (!owned) return
    const added = symbols.filter((s) => !owned.has(s)).slice(0, Math.max(0, MAX_SYMBOLS_PER_CLIENT - owned.size))
    for (const s of added) owned.add(s)
    const fresh = []
    for (const s of added) {
      const count = this.#refCounts.get(s) ?? 0
      this.#refCounts.set(s, count + 1)
      if (count === 0) fresh.push(s)
    }
    if (fresh.length) this.#feed.subscribe(fresh)
    const latest = added.map((s) => this.#feed.latest(s)).filter(Boolean)
    if (latest.length) client.send({ type: 'ticks', ticks: latest })
  }

  #unsubscribe(client, symbols) {
    const owned = this.#clients.get(client)
    if (!owned) return
    const removed = symbols.filter((s) => owned.delete(s))
    this.#release(removed)
  }

  #release(symbols) {
    const stale = []
    for (const s of symbols) {
      const count = (this.#refCounts.get(s) ?? 0) - 1
      if (count <= 0) {
        this.#refCounts.delete(s)
        stale.push(s)
      } else {
        this.#refCounts.set(s, count)
      }
    }
    if (stale.length) {
      this.#feed.unsubscribe(stale)
      for (const s of stale) this.#candles.drop(s)
    }
  }

  async #sendHistory(client, symbol) {
    if (!this.#clients.get(client)?.has(symbol)) return
    if (!this.#candles.isTracked(symbol)) this.#candles.seed(symbol, await this.#feed.history(symbol))
    client.send({ type: 'candles', symbol, candles: this.#candles.get(symbol) })
  }

  #onTicks(ticks) {
    for (const tick of ticks) this.#candles.apply(tick)
    for (const [client, symbols] of this.#clients) {
      const mine = ticks.filter((t) => symbols.has(t.symbol))
      if (mine.length) client.send({ type: 'ticks', ticks: mine })
    }
  }
}
