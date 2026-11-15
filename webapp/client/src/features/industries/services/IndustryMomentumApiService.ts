import type { ApiClient } from '../../../core/network/ApiClient'
import type { IndustryMomentumResponse, IndustryMomentumService } from './IndustryMomentumService'

export class IndustryMomentumApiService implements IndustryMomentumService {
  private readonly api: ApiClient

  constructor(api: ApiClient) {
    this.api = api
  }

  getIndustryMomentum(minMarketCap: number, { refresh = false, signal }: { refresh?: boolean; signal?: AbortSignal } = {}) {
    return this.api.get<IndustryMomentumResponse>(
      '/api/industry-momentum',
      { minMarketCap, refresh: refresh ? 1 : undefined },
      signal
    )
  }
}
