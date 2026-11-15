import { Resource } from './Resource'
import { ApiStatus } from './apiStatus'
import { ApiError } from './ApiError'

function deferred<T>() {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe('Resource', () => {
  it('moves through loading to success', async () => {
    const resource = new Resource<number>()
    const pending = resource.load(async () => 42)
    expect(resource.status).toBe(ApiStatus.LOADING)
    expect(resource.isInitialLoad).toBe(true)
    await pending
    expect(resource.status).toBe(ApiStatus.SUCCESS)
    expect(resource.data).toBe(42)
    expect(resource.loadedAt).toBeInstanceOf(Date)
  })

  it('keeps the previous data while reloading', async () => {
    const resource = new Resource<string>()
    await resource.load(async () => 'first')
    const next = deferred<string>()
    const pending = resource.load(() => next.promise)
    expect(resource.data).toBe('first')
    expect(resource.isInitialLoad).toBe(false)
    next.resolve('second')
    await pending
    expect(resource.data).toBe('second')
  })

  it('ignores a slow response that a newer request replaced', async () => {
    const resource = new Resource<string>()
    const slow = deferred<string>()
    const fast = deferred<string>()
    const first = resource.load(() => slow.promise)
    const second = resource.load(() => fast.promise)
    fast.resolve('new')
    await second
    slow.resolve('old')
    await first
    expect(resource.data).toBe('new')
  })

  it('aborts the previous request signal', async () => {
    const resource = new Resource<string>()
    let firstSignal: AbortSignal | undefined
    const pending = resource.load((signal) => {
      firstSignal = signal
      return new Promise(() => {})
    })
    void resource.load(async () => 'x')
    expect(firstSignal?.aborted).toBe(true)
    void pending
  })

  it('stores the error on failure', async () => {
    const resource = new Resource<string>()
    await resource.load(async () => {
      throw new ApiError('boom', 500)
    })
    expect(resource.status).toBe(ApiStatus.FAILURE)
    expect(resource.error?.message).toBe('boom')
    expect(resource.hasFailed).toBe(true)
  })
})
