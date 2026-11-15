import { EventEmitter } from 'node:events'
import { MINUTE } from '../candles.js'

// Stand-in for the Kite ticker when no Kite credentials are configured, or
// outside market hours: random-walk prices for the same symbols and a NIFTY
// option chain priced from the simulated index.

const EQUITIES = [
  ['RELIANCE', 'Reliance Industries Ltd', 1385],
  ['HDFCBANK', 'HDFC Bank Ltd', 1935],
  ['ICICIBANK', 'ICICI Bank Ltd', 1418],
  ['INFY', 'Infosys Ltd', 1489],
  ['TCS', 'Tata Consultancy Services Ltd', 3054],
  ['SBIN', 'State Bank of India', 858],
  ['BHARTIARTL', 'Bharti Airtel Ltd', 1880],
  ['ITC', 'ITC Ltd', 409],
  ['LT', 'Larsen & Toubro Ltd', 3986],
  ['AXISBANK', 'Axis Bank Ltd', 1169],
  ['KOTAKBANK', 'Kotak Mahindra Bank Ltd', 2105],
  ['MARUTI', 'Maruti Suzuki India Ltd', 15840],
  ['SUNPHARMA', 'Sun Pharmaceutical Industries Ltd', 1701],
  ['TATASTEEL', 'Tata Steel Ltd', 175],
  ['BHEL', 'Bharat Heavy Electricals Ltd', 266],
  ['BAJFINANCE', 'Bajaj Finance Ltd', 1003],
  ['HINDUNILVR', 'Hindustan Unilever Ltd', 2460],
  ['APOLLOHOSP', 'Apollo Hospitals Enterprise Ltd', 7830],
]
const INDEX_SYMBOL = 'NSE:NIFTY 50'
const INDEX_START = 24300
const STRIKE_STEP = 50
const STRIKES_EACH_SIDE = 30
const LOT_SIZE = 75

function normalCdf(x) {
  const t = 1 / (1 + 0.2316419 * Math.abs(x))
  const d = 0.3989423 * Math.exp((-x * x) / 2)
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))))
  return x > 0 ? 1 - p : p
}

export function blackScholes(spot, strike, years, vol, isCall) {
  const t = Math.max(years, 1 / 365 / 24)
  const d1 = (Math.log(spot / strike) + 0.5 * vol * vol * t) / (vol * Math.sqrt(t))
  const d2 = d1 - vol * Math.sqrt(t)
  return isCall ? spot * normalCdf(d1) - strike * normalCdf(d2) : strike * normalCdf(-d2) - spot * normalCdf(-d1)
}

function nextExpiries(now, count = 3) {
  const out = []
  const d = new Date(now)
  d.setUTCHours(10, 0, 0, 0)
  while (out.length < count) {
    if (d.getUTCDay() === 2 && d.getTime() > now) out.push(d.toISOString().slice(0, 10))
    d.setUTCDate(d.getUTCDate() + 1)
  }
  return out
}

function optionSymbol(expiry, strike, type) {
  const [y, m, day] = expiry.split('-')
  return `NFO:NIFTY${y.slice(2)}${m}${day}${strike}${type}`
}

export class SimulatedFeed extends EventEmitter {
  mode = 'simulated'
  status = { state: 'live', message: 'Simulated prices' }
  #active = new Set()
  #latest = new Map()
  #prices = new Map()
  #prevClose = new Map()
  #volume = new Map()
  #oi = new Map()
  #options = new Map()
  #timer = null
  #random
  #now

  constructor({ intervalMs = 1000, random = Math.random, now = Date.now } = {}) {
    super()
    this.#random = random
    this.#now = now
    this.intervalMs = intervalMs
    this.#prices.set(INDEX_SYMBOL, INDEX_START)
    this.#prevClose.set(INDEX_SYMBOL, INDEX_START * 0.996)
    for (const [symbol, , price] of EQUITIES) {
      this.#prices.set(`NSE:${symbol}`, price)
      this.#prevClose.set(`NSE:${symbol}`, price * (1 + (random() - 0.5) * 0.02))
    }
  }

  start() {
    if (!this.#timer) this.#timer = setInterval(() => this.step(), this.intervalMs)
    this.emit('status', this.status)
  }

  stop() {
    clearInterval(this.#timer)
    this.#timer = null
  }

  subscribe(symbols) {
    for (const s of symbols) if (this.#knows(s)) this.#active.add(s)
  }

  unsubscribe(symbols) {
    for (const s of symbols) this.#active.delete(s)
  }

  latest(symbol) {
    return this.#latest.get(symbol) ?? (this.#knows(symbol) ? this.#tickFor(symbol) : null)
  }

  async history(symbol) {
    if (!this.#knows(symbol)) return []
    const now = this.#now()
    const minutes = 120
    let price = this.#priceOf(symbol)
    const candles = []
    for (let i = 0; i < minutes; i++) {
      const t = Math.floor((now - (minutes - i) * MINUTE) / MINUTE) * MINUTE
      const open = price
      const close = open * (1 + (this.#random() - 0.5) * 0.004)
      const high = Math.max(open, close) * (1 + this.#random() * 0.0015)
      const low = Math.min(open, close) * (1 - this.#random() * 0.0015)
      candles.push({ t, o: round(open), h: round(high), l: round(low), c: round(close), v: Math.round(this.#random() * 5000) })
      price = close
    }
    const last = candles[candles.length - 1]
    const shift = this.#priceOf(symbol) - last.c
    return candles.map((c) => ({ ...c, o: round(c.o + shift), h: round(c.h + shift), l: round(c.l + shift), c: round(c.c + shift) }))
  }

  step() {
    const indexPrice = this.#prices.get(INDEX_SYMBOL) * (1 + (this.#random() - 0.5) * 0.0008)
    this.#prices.set(INDEX_SYMBOL, indexPrice)
    const ticks = []
    for (const symbol of this.#active) {
      if (symbol.startsWith('NSE:') && symbol !== INDEX_SYMBOL) {
        if (this.#random() < 0.3) continue
        this.#prices.set(symbol, this.#prices.get(symbol) * (1 + (this.#random() - 0.5) * 0.002))
      }
      if (symbol.startsWith('NFO:') && this.#random() < 0.2) continue
      ticks.push(this.#tickFor(symbol))
    }
    for (const t of ticks) this.#latest.set(t.symbol, t)
    if (ticks.length) this.emit('ticks', ticks)
  }

  search(query, limit = 10) {
    const q = query.trim().toUpperCase()
    if (!q) return []
    const all = [
      { symbol: INDEX_SYMBOL, name: 'Nifty 50 index', exchange: 'NSE', type: 'INDEX' },
      ...EQUITIES.map(([s, name]) => ({ symbol: `NSE:${s}`, name, exchange: 'NSE', type: 'EQ' })),
    ]
    return all.filter((i) => i.symbol.includes(q) || i.name.toUpperCase().includes(q)).slice(0, limit)
  }

  optionChain(underlying = 'NIFTY', expiry) {
    if (underlying !== 'NIFTY') return null
    const expiries = nextExpiries(this.#now())
    const chosen = expiries.includes(expiry) ? expiry : expiries[0]
    const atm = Math.round(INDEX_START / STRIKE_STEP) * STRIKE_STEP
    const strikes = []
    for (let i = -STRIKES_EACH_SIDE; i <= STRIKES_EACH_SIDE; i++) {
      const strike = atm + i * STRIKE_STEP
      const ce = optionSymbol(chosen, strike, 'CE')
      const pe = optionSymbol(chosen, strike, 'PE')
      this.#options.set(ce, { strike, expiry: chosen, isCall: true })
      this.#options.set(pe, { strike, expiry: chosen, isCall: false })
      strikes.push({ strike, ce, pe })
    }
    return { underlying, spotSymbol: INDEX_SYMBOL, lotSize: LOT_SIZE, expiries, expiry: chosen, strikes }
  }

  #knows(symbol) {
    return this.#prices.has(symbol) || this.#options.has(symbol)
  }

  #priceOf(symbol) {
    const option = this.#options.get(symbol)
    if (!option) return this.#prices.get(symbol)
    const years = (new Date(`${option.expiry}T10:00:00Z`).getTime() - this.#now()) / (365 * 24 * 3600 * 1000)
    return Math.max(0.05, blackScholes(this.#prices.get(INDEX_SYMBOL), option.strike, years, 0.13, option.isCall))
  }

  #tickFor(symbol) {
    const ltp = round(this.#priceOf(symbol))
    if (!this.#prevClose.has(symbol)) this.#prevClose.set(symbol, ltp * (1 + (this.#random() - 0.5) * 0.2))
    const prevClose = this.#prevClose.get(symbol)
    const volume = (this.#volume.get(symbol) ?? Math.round(this.#random() * 1e6)) + Math.round(this.#random() * 2000)
    this.#volume.set(symbol, volume)
    let oi = null
    if (symbol.startsWith('NFO:')) {
      oi = Math.max(0, Math.round((this.#oi.get(symbol) ?? this.#random() * 4e6) + (this.#random() - 0.45) * 20000))
      this.#oi.set(symbol, oi)
    }
    return {
      symbol,
      ltp,
      prevClose: round(prevClose),
      change: round(ltp - prevClose),
      changePct: round(((ltp - prevClose) / prevClose) * 100),
      volume,
      oi,
      ts: this.#now(),
    }
  }
}

function round(v) {
  return Math.round(v * 100) / 100
}
