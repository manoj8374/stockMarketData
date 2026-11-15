import type { ApiClient } from '../../../core/network/ApiClient'
import type { PortfolioResponse, PortfolioService } from './PortfolioService'

export class PortfolioApiService implements PortfolioService {
  private readonly api: ApiClient

  constructor(api: ApiClient) {
    this.api = api
  }

  getPortfolio(emaPeriod: number, signal?: AbortSignal) {
    return this.api.get<PortfolioResponse>('/api/portfolio', { ema: emaPeriod }, signal)
  }
}
