import type { ApiClient } from '../core/network/ApiClient'
import type { AuthService } from '../features/auth/services/AuthService'
import { AuthApiService } from '../features/auth/services/AuthApiService'

export interface Services {
  auth: AuthService
}

export function createApiServices(api: ApiClient): Services {
  return {
    auth: new AuthApiService(api),
  }
}
