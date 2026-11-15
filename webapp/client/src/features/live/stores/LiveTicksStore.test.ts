import { autorun } from 'mobx'
import { LiveTicksStore } from './LiveTicksStore'
import { WatchlistStore, DEFAULT_WATCHLIST } from './WatchlistStore'
import { applyTick, MINUTE } from '../models/candles'
import { fakeTransport, tick } from '../../../test/FakeTransport'

function setup() {
  const frames: Array<() => void> = []
  const { ref, createTransport } = fakeTransport()
  const store = new LiveTicksStore(createTransport, (cb) => frames.push(cb))
  const runFrame = () => frames.splice(0).forEach((cb) => cb())
  return { store, transport: () => ref.current!, runFrame, frames }
}

describe('LiveTicksStore', () => {
  it('starts the transport on the first watch and subscribes', () => {
    const { store, transport } = setup()
    const release = store.watch(['NSE:A'])
    expect(transport().started).toBe(true)
    expect(store.status).toBe('open')
    expect(transport().subscribed).toEqual(['NSE:A'])
    release()
    expect(transport().subscribed).toEqual([])
  })

  it('applies a burst of ticks in one frame, keeping the latest per symbol', () => {
    const { store, transport, runFrame, frames } = setup()
    store.watch(['NSE:A', 'NSE:B'])
    let renders = 0
    const seen: Array<[number | undefined, number | undefined]> = []
    const stop = autorun(() => {
      seen.push([store.tick('NSE:A')?.ltp, store.tick('NSE:B')?.ltp])
      renders++
    })
    for (let i = 1; i <= 50; i++) transport().emit({ type: 'ticks', ticks: [tick('NSE:A', 100 + i), tick('NSE:B', 200 - i)] })
    expect(frames).toHaveLength(1)
    expect(store.tick('NSE:A')).toBeUndefined()
    runFrame()
    expect(store.tick('NSE:A')?.ltp).toBe(150)
    expect(store.tick('NSE:B')?.ltp).toBe(150)
    expect(store.stats).toEqual({ received: 100, flushes: 1 })
    expect(renders).toBe(2)
    expect(seen).toEqual([
      [undefined, undefined],
      [150, 150],
    ])
    stop()
  })

  it('records the direction of each price move', () => {
    const { store, transport, runFrame } = setup()
    store.watch(['NSE:A'])
    transport().emit({ type: 'ticks', ticks: [tick('NSE:A', 100)] })
    runFrame()
    transport().emit({ type: 'ticks', ticks: [tick('NSE:A', 99)] })
    runFrame()
    const model = store.tick('NSE:A')!
    expect(model.direction).toBe('down')
    expect(model.version).toBe(1)
  })

  it('requests candle history and keeps the last candle up to date', () => {
    const { store, transport, runFrame } = setup()
    const release = store.watchCandles('NSE:A')
    expect(transport().sent).toContainEqual({ type: 'history', symbol: 'NSE:A' })
    const now = Math.floor(Date.now() / MINUTE) * MINUTE
    transport().emit({ type: 'candles', symbol: 'NSE:A', candles: [{ t: now, o: 100, h: 101, l: 99, c: 100, v: 0 }] })
    transport().emit({ type: 'ticks', ticks: [tick('NSE:A', 105, { ts: now + 1000 })] })
    runFrame()
    expect(store.candles.get('NSE:A')).toEqual([{ t: now, o: 100, h: 105, l: 99, c: 105, v: 0 }])
    release()
    expect(store.candles.has('NSE:A')).toBe(false)
  })

  it('asks for history again after reconnecting', () => {
    const { store, transport } = setup()
    store.watchCandles('NSE:A')
    transport().sent = []
    transport().emit({ type: 'hello', mode: 'simulated', status: { state: 'live' } })
    expect(transport().sent).toEqual([{ type: 'history', symbol: 'NSE:A' }])
    expect(store.feedMode).toBe('simulated')
  })

  it('tracks connection and feed status', () => {
    const { store, transport } = setup()
    store.watch(['NSE:A'])
    transport().setStatus('reconnecting', 4000)
    expect(store.retryInMs).toBe(4000)
    transport().emit({ type: 'feed', state: 'down', message: 'Token expired' })
    expect(store.feed).toEqual({ state: 'down', message: 'Token expired' })
  })

  it('clears everything on stop', () => {
    const { store, transport, runFrame } = setup()
    store.watch(['NSE:A'])
    transport().emit({ type: 'ticks', ticks: [tick('NSE:A', 100)] })
    runFrame()
    store.stop()
    expect(store.ticks.size).toBe(0)
    expect(store.status).toBe('idle')
  })
})

describe('applyTick', () => {
  const t0 = 1_700_000_040_000
  it('extends the current minute and opens a new one', () => {
    let candles = applyTick([], 10, t0)
    candles = applyTick(candles, 12, t0 + 1000)
    candles = applyTick(candles, 9, t0 + MINUTE)
    expect(candles).toHaveLength(2)
    expect(candles[0]).toMatchObject({ o: 10, h: 12, l: 10, c: 12 })
    expect(candles[1]).toMatchObject({ o: 9, c: 9 })
  })

  it('returns a new array so observers notice', () => {
    const candles = applyTick([], 10, t0)
    expect(applyTick(candles, 11, t0 + 1)).not.toBe(candles)
  })
})

describe('WatchlistStore', () => {
  beforeEach(() => localStorage.clear())

  it('starts each user with the default list and keeps lists separate', () => {
    const store = new WatchlistStore()
    store.setUser('alice')
    expect(store.symbols).toEqual(DEFAULT_WATCHLIST)
    store.add('NSE:ITC')
    store.setUser('bob')
    expect(store.has('NSE:ITC')).toBe(false)
    store.setUser('alice')
    expect(store.has('NSE:ITC')).toBe(true)
  })

  it('ignores duplicates and reorders', () => {
    const store = new WatchlistStore()
    store.setUser('alice')
    expect(store.add('NSE:RELIANCE')).toBe(false)
    store.move('NSE:RELIANCE', -1)
    expect(store.symbols[0]).toBe('NSE:RELIANCE')
    store.remove('NSE:RELIANCE')
    expect(store.has('NSE:RELIANCE')).toBe(false)
  })
})
