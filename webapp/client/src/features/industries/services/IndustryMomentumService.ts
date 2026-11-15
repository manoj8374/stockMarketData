import type { IndustryMomentumDto } from '../models/IndustryMomentumModel'

export interface IndustryMomentumResponse {
  generatedAt: string
  minMarketCap: number | null
  minStocks: number
  periods: number[]
  eligibleStocks: number
  excludedIndustries: number
  industries: IndustryMomentumDto[]
}

export interface IndustryMomentumService {
  getIndustryMomentum(
    minMarketCap: number,
    options?: { refresh?: boolean; signal?: AbortSignal }
  ): Promise<IndustryMomentumResponse>
}
