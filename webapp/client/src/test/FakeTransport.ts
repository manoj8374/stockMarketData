import type { LiveTransport, TransportHandlers } from '../features/live/services/LiveService'

export class FakeTransport implements LiveTransport {
  started = false
  sent: object[] = []
  readonly counts = new Map<string, number>()
  private readonly handlers: TransportHandlers

  constructor(handlers: TransportHandlers) {
    this.handlers = handlers
  }

  start() {
    this.started = true
    this.handlers.onStatus('open', null)
  }

  stop() {
    this.started = false
    this.handlers.onStatus('closed', null)
  }

  acquire(symbols: readonly string[]) {
    for (const s of symbols) this.counts.set(s, (this.counts.get(s) ?? 0) + 1)
    return () => {
      for (const s of symbols) {
        const next = (this.counts.get(s) ?? 1) - 1
        if (next <= 0) this.counts.delete(s)
        else this.counts.set(s, next)
      }
    }
  }

  send(message: object) {
    this.sent.push(message)
    return true
  }

  emit(message: object) {
    this.handlers.onMessage(message)
  }

  setStatus(status: Parameters<TransportHandlers['onStatus']>[0], retryInMs: number | null = null) {
    this.handlers.onStatus(status, retryInMs)
  }

  get subscribed() {
    return [...this.counts.keys()]
  }
}

export function fakeTransport() {
  const ref: { current: FakeTransport | null } = { current: null }
  const createTransport = (handlers: TransportHandlers) => (ref.current = new FakeTransport(handlers))
  return { ref, createTransport }
}

export function tick(symbol: string, ltp: number, extra: Partial<Record<string, number | null>> = {}) {
  return {
    symbol,
    ltp,
    prevClose: 100,
    change: ltp - 100,
    changePct: ltp - 100,
    volume: 1000,
    oi: null,
    ts: Date.now(),
    ...extra,
  }
}
