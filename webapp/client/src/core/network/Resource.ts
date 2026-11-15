import { makeAutoObservable, observableRef, runInAction } from 'mobx'
import { ApiStatus } from './apiStatus'
import { ApiError, isAbortError, toApiError } from './ApiError'

// One remote value with its loading state. A newer load() cancels the
// previous request, so a slow old response can never overwrite fresh data.
export class Resource<T> {
  status: ApiStatus = ApiStatus.IDLE
  data: T | null = null
  error: ApiError | null = null
  loadedAt: Date | null = null
  private controller: AbortController | null = null

  constructor() {
    makeAutoObservable<Resource<T>, 'controller'>(this, { data: observableRef, controller: false }, { autoBind: true })
  }

  get isLoading() {
    return this.status === ApiStatus.LOADING
  }

  get isInitialLoad() {
    return this.isLoading && this.data === null
  }

  get hasFailed() {
    return this.status === ApiStatus.FAILURE
  }

  async load(fetcher: (signal: AbortSignal) => Promise<T>) {
    this.controller?.abort()
    const controller = new AbortController()
    this.controller = controller
    this.status = ApiStatus.LOADING
    this.error = null

    try {
      const data = await fetcher(controller.signal)
      if (controller.signal.aborted) return
      runInAction(() => {
        this.data = data
        this.loadedAt = new Date()
        this.status = ApiStatus.SUCCESS
      })
    } catch (error) {
      if (controller.signal.aborted || isAbortError(error)) return
      runInAction(() => {
        this.error = toApiError(error)
        this.status = ApiStatus.FAILURE
      })
    } finally {
      if (this.controller === controller) this.controller = null
    }
  }

  cancel() {
    this.controller?.abort()
    this.controller = null
    if (this.status === ApiStatus.LOADING) this.status = this.data === null ? ApiStatus.IDLE : ApiStatus.SUCCESS
  }
}
