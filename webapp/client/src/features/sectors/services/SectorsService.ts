import type { IndustrySummaryDto, SectorDto } from '../models/GroupSummaryModel'

export interface SectorsService {
  getSectors(minMarketCap: number, signal?: AbortSignal): Promise<{ sectors: SectorDto[] }>
  getIndustries(sector: string, minMarketCap: number, signal?: AbortSignal): Promise<{ industries: IndustrySummaryDto[] }>
}
