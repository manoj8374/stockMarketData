import type { ApiClient } from '../../../core/network/ApiClient'
import type { StocksQuery, StocksResponse, StocksService } from './StocksService'

export class StocksApiService implements StocksService {
  private readonly api: ApiClient

  constructor(api: ApiClient) {
    this.api = api
  }

  getStocks(query: StocksQuery, { refresh = false, signal }: { refresh?: boolean; signal?: AbortSignal } = {}) {
    return this.api.get<StocksResponse>(
      '/api/stocks',
      {
        months: query.months.join(','),
        minMarketCap: query.minMarketCap,
        sector: query.sector,
        industry: query.industry,
        refresh: refresh ? 1 : undefined,
      },
      signal
    )
  }
}
