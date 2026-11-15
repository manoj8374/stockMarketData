import { makeAutoObservable, observable, runInAction } from 'mobx'
import type { SocketStatus } from '../../../core/socket/SocketClient'
import { TickModel, type TickDto } from '../models/TickModel'
import { applyTick, type Candle } from '../models/candles'
import type { LiveTransport, TransportFactory } from '../services/LiveService'

export type FeedMode = 'kite' | 'simulated'

export interface FeedState {
  state: 'live' | 'connecting' | 'down'
  message?: string
}

type ScheduleFrame = (callback: () => void) => void

const nextFrame: ScheduleFrame = (callback) => {
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => callback())
  else setTimeout(callback, 16)
}

interface ServerMessage {
  type: string
  mode?: FeedMode
  status?: FeedState
  state?: FeedState['state']
  message?: string
  ticks?: TickDto[]
  symbol?: string
  candles?: Candle[]
}

// Every tick that arrives is parked in `pending` (one entry per symbol, so a
// burst of 50 updates to one stock keeps only the latest). Once per animation
// frame the whole batch is applied in a single MobX action, so React renders
// at most once a frame no matter how fast prices arrive.
export class LiveTicksStore {
  status: SocketStatus = 'idle'
  retryInMs: number | null = null
  feedMode: FeedMode | null = null
  feed: FeedState | null = null
  readonly ticks = observable.map<string, TickModel>({}, { deep: false })
  readonly candles = observable.map<string, Candle[]>({}, { deep: false })
  readonly stats = { received: 0, flushes: 0 }
  private transport: LiveTransport | null = null
  private pending = new Map<string, TickDto>()
  private frameRequested = false
  private readonly charted = new Map<string, number>()
  private readonly createTransport: TransportFactory
  private readonly scheduleFrame: ScheduleFrame

  constructor(createTransport: TransportFactory, scheduleFrame: ScheduleFrame = nextFrame) {
    this.createTransport = createTransport
    this.scheduleFrame = scheduleFrame
    makeAutoObservable<
      LiveTicksStore,
      'transport' | 'pending' | 'frameRequested' | 'charted' | 'createTransport' | 'scheduleFrame'
    >(
      this,
      {
        ticks: false,
        candles: false,
        stats: false,
        transport: false,
        pending: false,
        frameRequested: false,
        charted: false,
        createTransport: false,
        scheduleFrame: false,
      },
      { autoBind: true }
    )
  }

  get isLive() {
    return this.status === 'open'
  }

  tick(symbol: string) {
    return this.ticks.get(symbol)
  }

  watch(symbols: readonly string[]) {
    return this.ensureTransport().acquire(symbols)
  }

  watchCandles(symbol: string) {
    const release = this.watch([symbol])
    this.charted.set(symbol, (this.charted.get(symbol) ?? 0) + 1)
    this.transport?.send({ type: 'history', symbol })
    return () => {
      release()
      const count = (this.charted.get(symbol) ?? 1) - 1
      if (count > 0) {
        this.charted.set(symbol, count)
        return
      }
      this.charted.delete(symbol)
      runInAction(() => this.candles.delete(symbol))
    }
  }

  reconnect() {
    if (!this.transport) return
    this.transport.stop()
    this.transport.start()
  }

  stop() {
    this.transport?.stop()
    this.transport = null
    this.pending.clear()
    this.charted.clear()
    this.ticks.clear()
    this.candles.clear()
    this.status = 'idle'
    this.feedMode = null
    this.feed = null
  }

  handleMessage(raw: unknown) {
    const message = raw as ServerMessage
    switch (message.type) {
      case 'hello':
        this.feedMode = message.mode ?? null
        this.feed = message.status ?? null
        for (const symbol of this.charted.keys()) this.transport?.send({ type: 'history', symbol })
        return
      case 'feed':
        this.feed = { state: message.state ?? 'down', message: message.message }
        return
      case 'ticks':
        return this.enqueue(message.ticks ?? [])
      case 'candles':
        if (message.symbol && this.charted.has(message.symbol)) this.candles.set(message.symbol, message.candles ?? [])
        return
    }
  }

  handleStatus(status: SocketStatus, retryInMs: number | null) {
    this.status = status
    this.retryInMs = retryInMs
  }

  flush() {
    this.frameRequested = false
    const batch = this.pending
    this.pending = new Map()
    if (!batch.size) return
    this.stats.flushes++
    for (const dto of batch.values()) {
      const existing = this.ticks.get(dto.symbol)
      if (existing) existing.update(dto)
      else this.ticks.set(dto.symbol, new TickModel(dto))
      const candles = this.candles.get(dto.symbol)
      if (candles) this.candles.set(dto.symbol, applyTick(candles, dto.ltp, dto.ts))
    }
  }

  private enqueue(ticks: TickDto[]) {
    this.stats.received += ticks.length
    for (const tick of ticks) this.pending.set(tick.symbol, tick)
    if (this.frameRequested) return
    this.frameRequested = true
    this.scheduleFrame(this.flush)
  }

  private ensureTransport() {
    if (!this.transport) {
      this.transport = this.createTransport({ onMessage: this.handleMessage, onStatus: this.handleStatus })
      this.transport.start()
    }
    return this.transport
  }
}
