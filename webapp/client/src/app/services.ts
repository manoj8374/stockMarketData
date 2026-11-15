import type { ApiClient } from '../core/network/ApiClient'
import type { AuthService } from '../features/auth/services/AuthService'
import { AuthApiService } from '../features/auth/services/AuthApiService'
import type { StocksService } from '../features/screener/services/StocksService'
import { StocksApiService } from '../features/screener/services/StocksApiService'

export interface Services {
  auth: AuthService
  stocks: StocksService
}

export function createApiServices(api: ApiClient): Services {
  return {
    auth: new AuthApiService(api),
    stocks: new StocksApiService(api),
  }
}
