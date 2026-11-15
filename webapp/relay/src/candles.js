export const MINUTE = 60_000
const MAX_CANDLES = 400

// Folds one price update into a list of 1-minute candles. Returns the same
// array (mutated) so callers can keep a reference to it.
export function applyTick(candles, price, ts, volume = 0) {
  const bucket = Math.floor(ts / MINUTE) * MINUTE
  const last = candles[candles.length - 1]
  if (last && last.t === bucket) {
    last.h = Math.max(last.h, price)
    last.l = Math.min(last.l, price)
    last.c = price
    last.v += volume
  } else if (!last || bucket > last.t) {
    candles.push({ t: bucket, o: price, h: price, l: price, c: price, v: volume })
    if (candles.length > MAX_CANDLES) candles.splice(0, candles.length - MAX_CANDLES)
  }
  return candles
}

export class CandleBook {
  #bySymbol = new Map()
  #lastVolume = new Map()

  isTracked(symbol) {
    return this.#bySymbol.has(symbol)
  }

  get(symbol) {
    return this.#bySymbol.get(symbol) ?? []
  }

  seed(symbol, candles) {
    this.#bySymbol.set(symbol, [...candles].sort((a, b) => a.t - b.t).slice(-MAX_CANDLES))
  }

  // Kite reports cumulative day volume, so each candle gets the difference
  // from the previous tick.
  apply(tick) {
    const candles = this.#bySymbol.get(tick.symbol)
    if (!candles) return
    const previous = this.#lastVolume.get(tick.symbol)
    const volume = previous !== undefined && tick.volume >= previous ? tick.volume - previous : 0
    if (tick.volume !== undefined && tick.volume !== null) this.#lastVolume.set(tick.symbol, tick.volume)
    this.#bySymbol.set(tick.symbol, applyTick(candles, tick.ltp, tick.ts, volume))
  }

  drop(symbol) {
    this.#bySymbol.delete(symbol)
    this.#lastVolume.delete(symbol)
  }
}
