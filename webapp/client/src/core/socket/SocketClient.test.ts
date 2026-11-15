import { backoffDelay, NotConfiguredError, SocketClient, type SocketStatus, type WebSocketLike } from './SocketClient'

class FakeSocket implements WebSocketLike {
  static instances: FakeSocket[] = []
  readyState = 0
  sent: unknown[] = []
  closedWith: number | undefined
  onopen: WebSocketLike['onopen'] = null
  onmessage: WebSocketLike['onmessage'] = null
  onclose: WebSocketLike['onclose'] = null
  onerror: WebSocketLike['onerror'] = null
  readonly url: string

  constructor(url: string) {
    this.url = url
    FakeSocket.instances.push(this)
  }

  send(data: string) {
    this.sent.push(JSON.parse(data))
  }

  close(code?: number) {
    this.closedWith = code
    this.readyState = 3
  }

  open() {
    this.readyState = 1
    this.onopen?.({})
  }

  receive(message: object) {
    this.onmessage?.({ data: JSON.stringify(message) })
  }

  drop() {
    this.readyState = 3
    this.onclose?.({ code: 1006 })
  }
}

const flush = () => Promise.resolve().then(() => Promise.resolve())

function setup(overrides: Partial<ConstructorParameters<typeof SocketClient>[0]> = {}) {
  const statuses: Array<[SocketStatus, number | null]> = []
  const messages: unknown[] = []
  const client = new SocketClient({
    getUrl: async () => 'ws://relay/ws?token=t',
    createSocket: (url) => new FakeSocket(url),
    onMessage: (m) => messages.push(m),
    onStatus: (s, retry) => statuses.push([s, retry]),
    heartbeatMs: 1000,
    baseDelayMs: 1000,
    maxDelayMs: 8000,
    random: () => 1,
    ...overrides,
  })
  return { client, statuses, messages, latest: () => FakeSocket.instances[FakeSocket.instances.length - 1] }
}

describe('backoffDelay', () => {
  it('doubles each attempt up to the cap, jittered into the upper half', () => {
    expect([0, 1, 2, 3, 4, 5].map((a) => backoffDelay(a, 1000, 8000, () => 1))).toEqual([1000, 2000, 4000, 8000, 8000, 8000])
    expect(backoffDelay(2, 1000, 8000, () => 0)).toBe(2000)
  })
})

describe('SocketClient', () => {
  beforeEach(() => {
    jest.useFakeTimers()
    FakeSocket.instances = []
  })
  afterEach(() => jest.useRealTimers())

  it('connects and replays subscriptions made before the socket opened', async () => {
    const { client, latest } = setup()
    client.acquire(['NSE:A', 'NSE:B'])
    client.start()
    await flush()
    latest().open()
    expect(latest().sent).toEqual([{ type: 'subscribe', symbols: ['NSE:A', 'NSE:B'] }])
    expect(client.currentStatus).toBe('open')
  })

  it('reference-counts symbols across watchers', async () => {
    const { client, latest } = setup()
    client.start()
    await flush()
    latest().open()
    const releaseA = client.acquire(['NSE:X'])
    const releaseB = client.acquire(['NSE:X', 'NSE:Y'])
    releaseA()
    releaseB()
    releaseB()
    expect(latest().sent).toEqual([
      { type: 'subscribe', symbols: ['NSE:X'] },
      { type: 'subscribe', symbols: ['NSE:Y'] },
      { type: 'unsubscribe', symbols: ['NSE:X', 'NSE:Y'] },
    ])
  })

  it('passes parsed messages through and ignores garbage', async () => {
    const { client, latest, messages } = setup()
    client.start()
    await flush()
    latest().open()
    latest().receive({ type: 'ticks', ticks: [] })
    latest().onmessage?.({ data: 'not json' })
    expect(messages).toEqual([{ type: 'ticks', ticks: [] }])
  })

  it('reconnects with backoff and resubscribes after a drop', async () => {
    const { client, latest, statuses } = setup()
    client.acquire(['NSE:A'])
    client.start()
    await flush()
    latest().open()
    latest().drop()
    expect(statuses.at(-1)).toEqual(['reconnecting', 1000])

    jest.advanceTimersByTime(1000)
    await flush()
    expect(FakeSocket.instances).toHaveLength(2)
    latest().drop()
    expect(statuses.at(-1)).toEqual(['reconnecting', 2000])

    jest.advanceTimersByTime(2000)
    await flush()
    latest().open()
    expect(latest().sent).toEqual([{ type: 'subscribe', symbols: ['NSE:A'] }])
    expect(client.currentStatus).toBe('open')
  })

  it('resets the backoff after a successful connection', async () => {
    const { client, latest, statuses } = setup()
    client.start()
    await flush()
    latest().drop()
    jest.advanceTimersByTime(1000)
    await flush()
    latest().open()
    latest().drop()
    expect(statuses.at(-1)).toEqual(['reconnecting', 1000])
  })

  it('pings and treats silence as a dead connection', async () => {
    const { client, latest } = setup()
    client.start()
    await flush()
    const first = latest()
    first.open()
    jest.advanceTimersByTime(1000)
    expect(first.sent).toContainEqual({ type: 'ping' })
    jest.advanceTimersByTime(2000)
    expect(first.closedWith).toBe(4000)
    expect(client.currentStatus).toBe('reconnecting')
  })

  it('keeps the connection while messages keep arriving', async () => {
    const { client, latest } = setup()
    client.start()
    await flush()
    latest().open()
    for (let i = 0; i < 5; i++) {
      jest.advanceTimersByTime(1000)
      latest().receive({ type: 'pong' })
    }
    expect(latest().closedWith).toBeUndefined()
  })

  it('stops for good when the relay is not configured', async () => {
    const { client, statuses } = setup({
      getUrl: async () => {
        throw new NotConfiguredError()
      },
    })
    client.start()
    await flush()
    jest.advanceTimersByTime(60_000)
    expect(statuses.at(-1)).toEqual(['unavailable', null])
    expect(FakeSocket.instances).toHaveLength(0)
  })

  it('retries when fetching the token fails', async () => {
    let calls = 0
    const { client, latest } = setup({
      getUrl: async () => {
        calls++
        if (calls === 1) throw new Error('offline')
        return 'ws://relay/ws?token=t'
      },
    })
    client.start()
    await flush()
    jest.advanceTimersByTime(1000)
    await flush()
    expect(latest()).toBeDefined()
    expect(calls).toBe(2)
  })

  it('does not reconnect after stop()', async () => {
    const { client, latest } = setup()
    client.start()
    await flush()
    latest().open()
    client.stop()
    jest.advanceTimersByTime(60_000)
    expect(FakeSocket.instances).toHaveLength(1)
    expect(client.currentStatus).toBe('closed')
  })
})
