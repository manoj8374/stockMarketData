import type { ApiClient } from '../core/network/ApiClient'
import type { AuthService } from '../features/auth/services/AuthService'
import { AuthApiService } from '../features/auth/services/AuthApiService'
import type { StocksService } from '../features/screener/services/StocksService'
import { StocksApiService } from '../features/screener/services/StocksApiService'
import type { SectorsService } from '../features/sectors/services/SectorsService'
import { SectorsApiService } from '../features/sectors/services/SectorsApiService'
import type { IndustryMomentumService } from '../features/industries/services/IndustryMomentumService'
import { IndustryMomentumApiService } from '../features/industries/services/IndustryMomentumApiService'
import type { PortfolioService } from '../features/portfolio/services/PortfolioService'
import { PortfolioApiService } from '../features/portfolio/services/PortfolioApiService'

export interface Services {
  auth: AuthService
  stocks: StocksService
  sectors: SectorsService
  industryMomentum: IndustryMomentumService
  portfolio: PortfolioService
}

export function createApiServices(api: ApiClient): Services {
  return {
    auth: new AuthApiService(api),
    stocks: new StocksApiService(api),
    sectors: new SectorsApiService(api),
    industryMomentum: new IndustryMomentumApiService(api),
    portfolio: new PortfolioApiService(api),
  }
}
