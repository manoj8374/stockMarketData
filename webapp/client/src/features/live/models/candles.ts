export const MINUTE = 60_000
const MAX_CANDLES = 400

export interface Candle {
  t: number
  o: number
  h: number
  l: number
  c: number
  v: number
}

// Folds a price update into 1-minute candles. Returns a new array so MobX
// (and the chart) see a change; older ticks than the last candle are ignored.
export function applyTick(candles: readonly Candle[], price: number, ts: number): Candle[] {
  const bucket = Math.floor(ts / MINUTE) * MINUTE
  const last = candles[candles.length - 1]
  if (last && last.t === bucket) {
    return [...candles.slice(0, -1), { ...last, h: Math.max(last.h, price), l: Math.min(last.l, price), c: price }]
  }
  if (last && bucket < last.t) return candles as Candle[]
  const next = [...candles, { t: bucket, o: price, h: price, l: price, c: price, v: 0 }]
  return next.length > MAX_CANDLES ? next.slice(next.length - MAX_CANDLES) : next
}
