import { EventEmitter } from 'node:events'
import { KiteConnect, KiteTicker } from 'kiteconnect'

const INDEX_SYMBOL = 'NSE:NIFTY 50'
const INSTRUMENTS_TTL = 6 * 3600 * 1000
const STRIKES_EACH_SIDE = 30
const round = (v) => Math.round(v * 100) / 100

// Live prices from Kite. One ticker connection serves every browser; symbols
// are exchange-prefixed tradingsymbols ("NSE:RELIANCE", "NFO:NIFTY25NOV24000CE")
// mapped to Kite instrument tokens.
export class KiteFeed extends EventEmitter {
  mode = 'kite'
  status = { state: 'connecting', message: 'Connecting to Kite' }
  #apiKey
  #getAccessToken
  #kite = null
  #ticker = null
  #instruments = null
  #loadedAt = 0
  #tokenBySymbol = new Map()
  #symbolByToken = new Map()
  #active = new Set()
  #latest = new Map()

  constructor({ apiKey, getAccessToken }) {
    super()
    this.#apiKey = apiKey
    this.#getAccessToken = getAccessToken
  }

  async start() {
    try {
      const accessToken = await this.#getAccessToken()
      if (!accessToken) throw new Error('No Kite access token. Reconnect Kite from the Portfolio page.')
      this.#kite = new KiteConnect({ api_key: this.#apiKey })
      this.#kite.setAccessToken(accessToken)
      await this.#loadInstruments()
      this.#connectTicker(accessToken)
    } catch (error) {
      this.#setStatus('down', error.message)
      setTimeout(() => this.start(), 60_000)
    }
  }

  stop() {
    this.#ticker?.disconnect()
  }

  subscribe(symbols) {
    const tokens = []
    for (const s of symbols) {
      const token = this.#tokenBySymbol.get(s)
      if (token === undefined) continue
      this.#active.add(s)
      tokens.push(token)
    }
    if (tokens.length && this.#ticker?.connected()) {
      this.#ticker.subscribe(tokens)
      this.#ticker.setMode(this.#ticker.modeFull, tokens)
    }
  }

  unsubscribe(symbols) {
    const tokens = []
    for (const s of symbols) {
      this.#active.delete(s)
      const token = this.#tokenBySymbol.get(s)
      if (token !== undefined) tokens.push(token)
    }
    if (tokens.length && this.#ticker?.connected()) this.#ticker.unsubscribe(tokens)
  }

  latest(symbol) {
    return this.#latest.get(symbol) ?? null
  }

  async history(symbol) {
    const token = this.#tokenBySymbol.get(symbol)
    if (token === undefined || !this.#kite) return []
    const to = new Date()
    const from = new Date(to.getTime() - 24 * 3600 * 1000)
    try {
      const rows = await this.#kite.getHistoricalData(token, 'minute', from, to)
      return rows.map((r) => ({ t: new Date(r.date).getTime(), o: r.open, h: r.high, l: r.low, c: r.close, v: r.volume ?? 0 }))
    } catch {
      return []
    }
  }

  search(query, limit = 10) {
    const q = query.trim().toUpperCase()
    if (!q || !this.#instruments) return []
    const out = []
    for (const i of this.#instruments) {
      if (i.exchange !== 'NSE' || (i.instrument_type !== 'EQ' && i.segment !== 'INDICES')) continue
      if (i.tradingsymbol.includes(q) || (i.name ?? '').toUpperCase().includes(q)) {
        out.push({
          symbol: `NSE:${i.tradingsymbol}`,
          name: i.name || i.tradingsymbol,
          exchange: 'NSE',
          type: i.segment === 'INDICES' ? 'INDEX' : 'EQ',
        })
        if (out.length >= limit) break
      }
    }
    return out.sort((a, b) => Number(b.symbol === `NSE:${q}`) - Number(a.symbol === `NSE:${q}`))
  }

  optionChain(underlying = 'NIFTY', expiry) {
    if (!this.#instruments) return null
    const options = this.#instruments.filter(
      (i) => i.exchange === 'NFO' && i.name === underlying && (i.instrument_type === 'CE' || i.instrument_type === 'PE')
    )
    if (!options.length) return null
    const day = (d) => new Date(d).toISOString().slice(0, 10)
    const expiries = [...new Set(options.map((i) => day(i.expiry)))].sort().slice(0, 6)
    const chosen = expiries.includes(expiry) ? expiry : expiries[0]
    const byStrike = new Map()
    for (const i of options) {
      if (day(i.expiry) !== chosen) continue
      const row = byStrike.get(i.strike) ?? { strike: i.strike }
      row[i.instrument_type === 'CE' ? 'ce' : 'pe'] = `NFO:${i.tradingsymbol}`
      byStrike.set(i.strike, row)
    }
    const spot = this.#latest.get(INDEX_SYMBOL)?.ltp
    let strikes = [...byStrike.values()].filter((r) => r.ce && r.pe).sort((a, b) => a.strike - b.strike)
    if (spot) {
      const atm = strikes.reduce((best, r, i) => (Math.abs(r.strike - spot) < Math.abs(strikes[best].strike - spot) ? i : best), 0)
      strikes = strikes.slice(Math.max(0, atm - STRIKES_EACH_SIDE), atm + STRIKES_EACH_SIDE + 1)
    }
    const lotSize = options.find((i) => day(i.expiry) === chosen)?.lot_size ?? null
    return { underlying, spotSymbol: INDEX_SYMBOL, lotSize, expiries, expiry: chosen, strikes }
  }

  async #loadInstruments() {
    if (this.#instruments && Date.now() - this.#loadedAt < INSTRUMENTS_TTL) return
    const [nse, nfo] = await Promise.all([this.#kite.getInstruments('NSE'), this.#kite.getInstruments('NFO')])
    this.#instruments = [...nse, ...nfo]
    this.#loadedAt = Date.now()
    this.#tokenBySymbol.clear()
    this.#symbolByToken.clear()
    for (const i of this.#instruments) {
      const symbol = `${i.exchange}:${i.tradingsymbol}`
      this.#tokenBySymbol.set(symbol, i.instrument_token)
      this.#symbolByToken.set(i.instrument_token, symbol)
    }
  }

  #connectTicker(accessToken) {
    this.#ticker?.disconnect()
    const ticker = new KiteTicker({ api_key: this.#apiKey, access_token: accessToken })
    this.#ticker = ticker
    ticker.on('connect', () => {
      this.#setStatus('live', 'Live prices from Kite')
      this.subscribe([INDEX_SYMBOL, ...this.#active])
    })
    ticker.on('ticks', (raw) => this.#onTicks(raw))
    ticker.on('disconnect', () => this.#setStatus('connecting', 'Reconnecting to Kite'))
    ticker.on('error', () => this.#setStatus('connecting', 'Kite connection error'))
    ticker.on('noreconnect', () => {
      this.#setStatus('down', 'Lost the Kite connection. Retrying with a fresh token.')
      setTimeout(() => this.start(), 30_000)
    })
    ticker.connect()
  }

  #onTicks(raw) {
    const ticks = []
    for (const t of raw) {
      const symbol = this.#symbolByToken.get(t.instrument_token)
      if (!symbol) continue
      const prevClose = t.ohlc?.close || null
      const ltp = t.last_price
      const tick = {
        symbol,
        ltp,
        prevClose,
        change: prevClose ? round(ltp - prevClose) : null,
        changePct: prevClose ? round(((ltp - prevClose) / prevClose) * 100) : null,
        volume: t.volume_traded ?? null,
        oi: t.oi ?? null,
        ts: (t.exchange_timestamp ?? t.last_trade_time ?? new Date()).valueOf(),
      }
      this.#latest.set(symbol, tick)
      if (this.#active.has(symbol)) ticks.push(tick)
    }
    if (ticks.length) this.emit('ticks', ticks)
  }

  #setStatus(state, message) {
    this.status = { state, message }
    this.emit('status', this.status)
  }
}
