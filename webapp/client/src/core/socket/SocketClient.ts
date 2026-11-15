export type SocketStatus = 'idle' | 'connecting' | 'open' | 'reconnecting' | 'unavailable' | 'closed'

export interface WebSocketLike {
  readonly readyState: number
  send(data: string): void
  close(code?: number, reason?: string): void
  onopen: ((event: unknown) => void) | null
  onmessage: ((event: { data: unknown }) => void) | null
  onclose: ((event: { code: number }) => void) | null
  onerror: ((event: unknown) => void) | null
}

const OPEN = 1

// Thrown by getUrl when there is nothing to connect to (relay not set up),
// which stops the client instead of retrying forever.
export class NotConfiguredError extends Error {
  constructor(message = 'The live feed is not set up') {
    super(message)
    this.name = 'NotConfiguredError'
  }
}

export interface SocketClientOptions {
  getUrl: () => Promise<string>
  onMessage: (message: unknown) => void
  onStatus?: (status: SocketStatus, retryInMs: number | null) => void
  createSocket?: (url: string) => WebSocketLike
  heartbeatMs?: number
  baseDelayMs?: number
  maxDelayMs?: number
  random?: () => number
}

// Exponential backoff with jitter: 1s, 2s, 4s … capped, each randomised into
// the upper half of its window so many browsers don't reconnect in lockstep.
export function backoffDelay(attempt: number, baseMs: number, maxMs: number, random: () => number) {
  const ceiling = Math.min(maxMs, baseMs * 2 ** attempt)
  return Math.round(ceiling / 2 + (random() * ceiling) / 2)
}

export class SocketClient {
  private socket: WebSocketLike | null = null
  private status: SocketStatus = 'idle'
  private attempt = 0
  private stopped = true
  private lastMessageAt = 0
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null
  private readonly counts = new Map<string, number>()
  private readonly options: Required<Omit<SocketClientOptions, 'onStatus'>> & Pick<SocketClientOptions, 'onStatus'>

  constructor(options: SocketClientOptions) {
    this.options = {
      createSocket: (url) => new WebSocket(url) as unknown as WebSocketLike,
      heartbeatMs: 15_000,
      baseDelayMs: 1_000,
      maxDelayMs: 30_000,
      random: Math.random,
      ...options,
    }
  }

  get currentStatus() {
    return this.status
  }

  get symbols() {
    return [...this.counts.keys()]
  }

  start() {
    if (!this.stopped) return
    this.stopped = false
    this.attempt = 0
    void this.connect()
  }

  stop() {
    this.stopped = true
    this.clearTimers()
    this.dropSocket(1000)
    this.setStatus('closed', null)
  }

  // Reference-counted: a symbol is subscribed on its first watcher and
  // unsubscribed when the last one releases it.
  acquire(symbols: readonly string[]): () => void {
    const added: string[] = []
    for (const s of symbols) {
      const count = this.counts.get(s) ?? 0
      this.counts.set(s, count + 1)
      if (count === 0) added.push(s)
    }
    if (added.length) this.send({ type: 'subscribe', symbols: added })

    let released = false
    return () => {
      if (released) return
      released = true
      const removed: string[] = []
      for (const s of symbols) {
        const count = (this.counts.get(s) ?? 0) - 1
        if (count <= 0) {
          this.counts.delete(s)
          removed.push(s)
        } else {
          this.counts.set(s, count)
        }
      }
      if (removed.length) this.send({ type: 'unsubscribe', symbols: removed })
    }
  }

  // Messages sent while disconnected are dropped; subscriptions are replayed
  // on every (re)connect, so nothing is lost.
  send(message: object) {
    if (this.socket?.readyState !== OPEN) return false
    this.socket.send(JSON.stringify(message))
    return true
  }

  private async connect() {
    this.setStatus(this.attempt === 0 ? 'connecting' : 'reconnecting', null)
    let url: string
    try {
      url = await this.options.getUrl()
    } catch (error) {
      if (error instanceof NotConfiguredError) {
        this.stopped = true
        this.setStatus('unavailable', null)
        return
      }
      this.scheduleReconnect()
      return
    }
    if (this.stopped) return

    const socket = this.options.createSocket(url)
    this.socket = socket
    socket.onopen = () => {
      this.attempt = 0
      this.lastMessageAt = Date.now()
      this.setStatus('open', null)
      if (this.counts.size) socket.send(JSON.stringify({ type: 'subscribe', symbols: this.symbols }))
      this.startHeartbeat()
    }
    socket.onmessage = (event) => {
      this.lastMessageAt = Date.now()
      let message: unknown
      try {
        message = JSON.parse(String(event.data))
      } catch {
        return
      }
      this.options.onMessage(message)
    }
    socket.onclose = () => {
      if (this.socket !== socket) return
      this.socket = null
      this.stopHeartbeat()
      if (!this.stopped) this.scheduleReconnect()
    }
    socket.onerror = () => {}
  }

  private scheduleReconnect() {
    const delay = backoffDelay(this.attempt, this.options.baseDelayMs, this.options.maxDelayMs, this.options.random)
    this.attempt++
    this.setStatus('reconnecting', delay)
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      void this.connect()
    }, delay)
  }

  // The server answers every ping. Silence for two intervals means the
  // connection is dead even if the browser hasn't noticed yet.
  private startHeartbeat() {
    this.stopHeartbeat()
    this.heartbeatTimer = setInterval(() => {
      if (Date.now() - this.lastMessageAt > this.options.heartbeatMs * 2) {
        this.dropSocket(4000)
        this.stopHeartbeat()
        if (!this.stopped) this.scheduleReconnect()
        return
      }
      this.send({ type: 'ping' })
    }, this.options.heartbeatMs)
  }

  private stopHeartbeat() {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer)
    this.heartbeatTimer = null
  }

  private clearTimers() {
    this.stopHeartbeat()
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    this.reconnectTimer = null
  }

  private dropSocket(code: number) {
    const socket = this.socket
    this.socket = null
    if (!socket) return
    socket.onopen = socket.onmessage = socket.onclose = socket.onerror = null
    try {
      socket.close(code)
    } catch {
      // already closed
    }
  }

  private setStatus(status: SocketStatus, retryInMs: number | null) {
    this.status = status
    this.options.onStatus?.(status, retryInMs)
  }
}
