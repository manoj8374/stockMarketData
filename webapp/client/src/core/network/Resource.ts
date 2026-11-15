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
  private inFlight: Promise<void> | null = null

  constructor() {
    makeAutoObservable<Resource<T>, 'controller' | 'inFlight' | 'run'>(
      this,
      { data: observableRef, controller: false, inFlight: false, run: false },
      { autoBind: true }
    )
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

  // Resolves when the current request settles; lets a second caller wait for
  // a load that is already running instead of starting another one.
  get pending(): Promise<void> {
    return this.inFlight ?? Promise.resolve()
  }

  load(fetcher: (signal: AbortSignal) => Promise<T>) {
    this.controller?.abort()
    const controller = new AbortController()
    this.controller = controller
    this.status = ApiStatus.LOADING
    this.error = null
    const request = this.run(fetcher, controller)
    this.inFlight = request
    return request
  }

  cancel() {
    this.controller?.abort()
    this.controller = null
    this.inFlight = null
    if (this.status === ApiStatus.LOADING) this.status = this.data === null ? ApiStatus.IDLE : ApiStatus.SUCCESS
  }

  private async run(fetcher: (signal: AbortSignal) => Promise<T>, controller: AbortController) {
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
      if (this.controller === controller) {
        this.controller = null
        this.inFlight = null
      }
    }
  }
}
