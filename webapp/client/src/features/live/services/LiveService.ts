import type { SocketStatus } from '../../../core/socket/SocketClient'

export interface InstrumentDto {
  symbol: string
  name: string
  exchange: string
  type: 'EQ' | 'INDEX' | string
}

export interface OptionStrikeDto {
  strike: number
  ce: string
  pe: string
}

export interface OptionChainDto {
  underlying: string
  spotSymbol: string
  lotSize: number | null
  expiries: string[]
  expiry: string
  strikes: OptionStrikeDto[]
}

export interface LiveService {
  getSocketUrl(): Promise<string>
  search(query: string, signal?: AbortSignal): Promise<InstrumentDto[]>
  getOptionChain(underlying: string, expiry?: string, signal?: AbortSignal): Promise<OptionChainDto>
}

// The socket layer the live store talks to: SocketClient in the app, a fake in tests.
export interface LiveTransport {
  start(): void
  stop(): void
  acquire(symbols: readonly string[]): () => void
  send(message: object): boolean
}

export interface TransportHandlers {
  onMessage: (message: unknown) => void
  onStatus: (status: SocketStatus, retryInMs: number | null) => void
}

export type TransportFactory = (handlers: TransportHandlers) => LiveTransport
