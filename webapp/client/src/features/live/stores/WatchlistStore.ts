import { makeAutoObservable } from 'mobx'
import { loadJSON, saveJSON } from '../../../common/utils/storage'

export const DEFAULT_WATCHLIST = ['NSE:NIFTY 50', 'NSE:RELIANCE', 'NSE:HDFCBANK', 'NSE:INFY', 'NSE:TCS', 'NSE:SBIN']
const MAX_SYMBOLS = 50

// Saved per user in this browser.
export class WatchlistStore {
  symbols: string[] = []
  private username: string | null = null

  constructor() {
    makeAutoObservable<WatchlistStore, 'username'>(this, { username: false }, { autoBind: true })
  }

  private storageKey() {
    return `watchlist:${this.username}`
  }

  setUser(username: string | null) {
    this.username = username
    if (!username) {
      this.symbols = []
      return
    }
    const saved = loadJSON<unknown>(this.storageKey(), null)
    this.symbols = Array.isArray(saved)
      ? saved.filter((s): s is string => typeof s === 'string').slice(0, MAX_SYMBOLS)
      : [...DEFAULT_WATCHLIST]
  }

  has(symbol: string) {
    return this.symbols.includes(symbol)
  }

  get isFull() {
    return this.symbols.length >= MAX_SYMBOLS
  }

  add(symbol: string) {
    if (this.has(symbol) || this.isFull) return false
    this.symbols = [...this.symbols, symbol]
    this.save()
    return true
  }

  remove(symbol: string) {
    this.symbols = this.symbols.filter((s) => s !== symbol)
    this.save()
  }

  move(symbol: string, offset: number) {
    const from = this.symbols.indexOf(symbol)
    const to = from + offset
    if (from < 0 || to < 0 || to >= this.symbols.length) return
    const next = [...this.symbols]
    next.splice(to, 0, ...next.splice(from, 1))
    this.symbols = next
    this.save()
  }

  private save() {
    if (this.username) saveJSON(this.storageKey(), this.symbols)
  }
}

export function displaySymbol(symbol: string) {
  return symbol.replace(/^(NSE|NFO|BSE):/, '')
}
