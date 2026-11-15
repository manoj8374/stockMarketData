export class ApiError extends Error {
  readonly status: number
  readonly code: string | null

  constructor(message: string, status: number, code: string | null = null) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }

  get isUnauthorized() {
    return this.status === 401
  }

  get isNetworkError() {
    return this.status === 0
  }
}

export function isAbortError(error: unknown) {
  return error instanceof Error && error.name === 'AbortError'
}

export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error
  if (error instanceof Error) return new ApiError(error.message, 0)
  return new ApiError('Something went wrong', 0)
}
