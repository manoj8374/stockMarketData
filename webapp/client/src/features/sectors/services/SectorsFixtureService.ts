import { quantile } from '../../../common/utils/format'
import { makeFixtureStocks } from '../../screener/services/stockFixtures'
import type { GroupStatsDto, IndustrySummaryDto, SectorDto } from '../models/GroupSummaryModel'
import type { SectorsService } from './SectorsService'

type FixtureStock = ReturnType<typeof makeFixtureStocks>[number]

function stats(stocks: FixtureStock[]): GroupStatsDto {
  const returns = stocks.map((s) => ((s.prices[0] - s.prices[1]) / s.prices[1]) * 100).sort((a, b) => a - b)
  const positive = returns.filter((r) => r > 0).length
  const enough = returns.length >= 3
  return {
    count: stocks.length,
    median_1m: enough ? Math.round(quantile(returns, 0.5) * 100) / 100 : null,
    breadth_1m: enough ? Math.round((positive / returns.length) * 10000) / 100 : null,
    positive_1m: enough ? positive : null,
    with_return_1m: returns.length,
  }
}

function groupBy(stocks: FixtureStock[], key: (s: FixtureStock) => string) {
  const groups = new Map<string, FixtureStock[]>()
  for (const s of stocks) groups.set(key(s), [...(groups.get(key(s)) ?? []), s])
  return groups
}

export class SectorsFixtureService implements SectorsService {
  private readonly stocks = makeFixtureStocks()

  private eligible(minMarketCap: number) {
    return this.stocks.filter((s) => !minMarketCap || s.marketCapCr >= minMarketCap)
  }

  async getSectors(minMarketCap: number) {
    const sectors: SectorDto[] = [...groupBy(this.eligible(minMarketCap), (s) => s.sector)].map(([sector, list]) => ({
      sector,
      industries: new Set(list.map((s) => s.industry)).size,
      ...stats(list),
    }))
    return { sectors }
  }

  async getIndustries(sector: string, minMarketCap: number) {
    const inSector = this.eligible(minMarketCap).filter((s) => s.sector === sector)
    const industries: IndustrySummaryDto[] = [...groupBy(inSector, (s) => s.industry)].map(([industry, list]) => ({
      industry,
      ...stats(list),
    }))
    return { industries }
  }
}
