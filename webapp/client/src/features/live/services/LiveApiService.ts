import { ApiClient } from '../../../core/network/ApiClient'
import { ApiError } from '../../../core/network/ApiError'
import { NotConfiguredError } from '../../../core/socket/SocketClient'
import type { InstrumentDto, LiveService, OptionChainDto } from './LiveService'

interface LiveTokenDto {
  relayUrl: string | null
  token: string | null
}

const TOKEN_REUSE_MS = 8 * 60 * 1000

// The web app signs a short-lived token (/api/live-token); the relay, which
// lives on another domain, accepts it as a bearer token or ?token= on the socket.
export class LiveApiService implements LiveService {
  private readonly api: ApiClient
  private cached: { relayUrl: string; token: string; at: number } | null = null

  constructor(api: ApiClient) {
    this.api = api
  }

  async getSocketUrl() {
    const { relayUrl, token } = await this.connection(true)
    return `${relayUrl.replace(/^http/, 'ws')}/ws?token=${encodeURIComponent(token)}`
  }

  async search(query: string, signal?: AbortSignal) {
    const { relay, headers } = await this.relay()
    const { results } = await relay.get<{ results: InstrumentDto[] }>('/instruments/search', { q: query }, signal, headers)
    return results
  }

  async getOptionChain(underlying: string, expiry?: string, signal?: AbortSignal) {
    const { relay, headers } = await this.relay()
    return relay.get<OptionChainDto>('/option-chain', { underlying, expiry }, signal, headers)
  }

  private async relay() {
    let connection
    try {
      connection = await this.connection(false)
    } catch (error) {
      if (error instanceof NotConfiguredError) throw new ApiError(error.message, 503, 'not_configured')
      throw error
    }
    return {
      relay: new ApiClient({ baseUrl: connection.relayUrl, credentials: 'omit' }),
      headers: { Authorization: `Bearer ${connection.token}` },
    }
  }

  private async connection(fresh: boolean) {
    if (!fresh && this.cached && Date.now() - this.cached.at < TOKEN_REUSE_MS) return this.cached
    const { relayUrl, token } = await this.api.get<LiveTokenDto>('/api/live-token')
    if (!relayUrl || !token) throw new NotConfiguredError()
    this.cached = { relayUrl, token, at: Date.now() }
    return this.cached
  }
}
