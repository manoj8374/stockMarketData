import { test } from 'node:test'
import assert from 'node:assert/strict'
import { applyTick, CandleBook, MINUTE } from '../src/candles.js'

const base = Date.UTC(2026, 10, 10, 4, 0)

test('builds one candle per minute from ticks', () => {
  const candles = []
  applyTick(candles, 100, base + 1000)
  applyTick(candles, 104, base + 20_000)
  applyTick(candles, 98, base + 40_000)
  applyTick(candles, 101, base + MINUTE + 5)
  assert.deepEqual(candles[0], { t: base, o: 100, h: 104, l: 98, c: 98, v: 0 })
  assert.equal(candles[1].o, 101)
  assert.equal(candles.length, 2)
})

test('ignores ticks older than the last candle', () => {
  const candles = []
  applyTick(candles, 100, base + MINUTE)
  applyTick(candles, 50, base)
  assert.equal(candles.length, 1)
  assert.equal(candles[0].l, 100)
})

test('turns cumulative day volume into per-candle volume', () => {
  const book = new CandleBook()
  book.seed('NSE:ABC', [])
  book.apply({ symbol: 'NSE:ABC', ltp: 10, ts: base, volume: 1000 })
  book.apply({ symbol: 'NSE:ABC', ltp: 11, ts: base + 1000, volume: 1500 })
  assert.equal(book.get('NSE:ABC')[0].v, 500)
})

test('only tracks symbols whose history was requested', () => {
  const book = new CandleBook()
  book.apply({ symbol: 'NSE:XYZ', ltp: 10, ts: base, volume: 1 })
  assert.equal(book.isTracked('NSE:XYZ'), false)
})
