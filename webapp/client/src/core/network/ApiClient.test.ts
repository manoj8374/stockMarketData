import { ApiClient } from './ApiClient'
import { ApiError } from './ApiError'

function jsonResponse(body: unknown, status = 200) {
  return Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) } as Response)
}

describe('ApiClient', () => {
  it('builds the query string and skips empty values', () => {
    const client = new ApiClient({ fetchImpl: jest.fn() })
    expect(client.buildUrl('/api/stocks', { months: '1,3', sector: '', industry: null, minMarketCap: 0 })).toBe(
      '/api/stocks?months=1%2C3&minMarketCap=0'
    )
  })

  it('returns the parsed body on success', async () => {
    const fetchImpl = jest.fn(() => jsonResponse({ ok: true }))
    const client = new ApiClient({ fetchImpl })
    await expect(client.get('/api/session')).resolves.toEqual({ ok: true })
    expect(fetchImpl).toHaveBeenCalledWith('/api/session', expect.objectContaining({ method: 'GET' }))
  })

  it('sends JSON bodies on POST', async () => {
    const fetchImpl = jest.fn((_url: string, _init?: RequestInit) => jsonResponse({ ok: true }))
    await new ApiClient({ fetchImpl }).post('/api/login', { username: 'a' })
    const init = fetchImpl.mock.calls[0][1]
    expect(init?.body).toBe('{"username":"a"}')
    expect(init?.headers).toEqual({ 'Content-Type': 'application/json' })
  })

  it('turns an error response into an ApiError with the server code', async () => {
    const client = new ApiClient({ fetchImpl: () => jsonResponse({ error: 'not_connected' }, 409) })
    const error = await client.get<never>('/api/portfolio').catch((e: ApiError) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect(error.status).toBe(409)
    expect(error.code).toBe('not_connected')
  })

  it('reports 401s to onUnauthorized', async () => {
    const onUnauthorized = jest.fn()
    const client = new ApiClient({ fetchImpl: () => jsonResponse({ error: 'Unauthorized' }, 401), onUnauthorized })
    await expect(client.get('/api/stocks')).rejects.toBeInstanceOf(ApiError)
    expect(onUnauthorized).toHaveBeenCalledWith('/api/stocks')
  })

  it('maps network failures to a readable error', async () => {
    const client = new ApiClient({ fetchImpl: () => Promise.reject(new TypeError('Failed to fetch')) })
    const error = await client.get<never>('/api/stocks').catch((e: ApiError) => e)
    expect(error.isNetworkError).toBe(true)
  })

  it('lets aborts through untouched', async () => {
    const abort = Object.assign(new Error('aborted'), { name: 'AbortError' })
    const client = new ApiClient({ fetchImpl: () => Promise.reject(abort) })
    await expect(client.get('/api/stocks')).rejects.toBe(abort)
  })
})
