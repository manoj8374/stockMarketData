import type { ApiClient } from '../../../core/network/ApiClient'
import type { IndustrySummaryDto, SectorDto } from '../models/GroupSummaryModel'
import type { SectorsService } from './SectorsService'

export class SectorsApiService implements SectorsService {
  private readonly api: ApiClient

  constructor(api: ApiClient) {
    this.api = api
  }

  getSectors(minMarketCap: number, signal?: AbortSignal) {
    return this.api.get<{ sectors: SectorDto[] }>('/api/sectors', { minMarketCap }, signal)
  }

  getIndustries(sector: string, minMarketCap: number, signal?: AbortSignal) {
    return this.api.get<{ industries: IndustrySummaryDto[] }>('/api/industries', { sector, minMarketCap }, signal)
  }
}
