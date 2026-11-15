import { ApiError, isAbortError } from './ApiError'

export type QueryValue = string | number | boolean | null | undefined
export type Query = Record<string, QueryValue>

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

interface RequestOptions {
  query?: Query
  body?: unknown
  signal?: AbortSignal
  headers?: Record<string, string>
}

export interface ApiClientOptions {
  baseUrl?: string
  fetchImpl?: FetchLike
  onUnauthorized?: (path: string) => void
}

export class ApiClient {
  private readonly baseUrl: string
  private readonly fetchImpl: FetchLike
  private readonly onUnauthorized?: (path: string) => void

  constructor({ baseUrl = '', fetchImpl, onUnauthorized }: ApiClientOptions = {}) {
    this.baseUrl = baseUrl
    this.fetchImpl = fetchImpl ?? ((input, init) => fetch(input, init))
    this.onUnauthorized = onUnauthorized
  }

  get<T>(path: string, query?: Query, signal?: AbortSignal, headers?: Record<string, string>) {
    return this.request<T>('GET', path, { query, signal, headers })
  }

  post<T>(path: string, body?: unknown, signal?: AbortSignal) {
    return this.request<T>('POST', path, { body, signal })
  }

  buildUrl(path: string, query?: Query) {
    const params = new URLSearchParams()
    for (const [key, value] of Object.entries(query ?? {})) {
      if (value !== undefined && value !== null && value !== '') params.set(key, String(value))
    }
    const qs = params.toString()
    return `${this.baseUrl}${path}${qs ? `?${qs}` : ''}`
  }

  private async request<T>(method: string, path: string, { query, body, signal, headers }: RequestOptions): Promise<T> {
    let response: Response
    try {
      response = await this.fetchImpl(this.buildUrl(path, query), {
        method,
        signal,
        credentials: 'include',
        headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...headers },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      })
    } catch (error) {
      if (isAbortError(error)) throw error
      throw new ApiError("Couldn't reach the server. Check your connection and try again.", 0, 'network')
    }

    const payload = await response.json().catch(() => null)
    if (!response.ok) {
      const code = typeof payload?.error === 'string' ? payload.error : null
      const error = new ApiError(code ?? `Request failed (${response.status})`, response.status, code)
      if (error.isUnauthorized) this.onUnauthorized?.(path)
      throw error
    }
    return payload as T
  }
}
