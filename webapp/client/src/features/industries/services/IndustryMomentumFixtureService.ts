import { quantile } from '../../../common/utils/format'
import { makeFixtureStocks } from '../../screener/services/stockFixtures'
import type { PeriodStatsDto } from '../models/IndustryMomentumModel'
import { PERIODS } from '../models/industryWeights'
import type { IndustryMomentumResponse, IndustryMomentumService } from './IndustryMomentumService'

const MIN_STOCKS = 3
const round2 = (v: number) => Math.round(v * 100) / 100

function periodStats(values: number[]): PeriodStatsDto {
  if (values.length < MIN_STOCKS) return { count: values.length, mean: null, median: null, p75: null, positive: null, breadth: null }
  const sorted = [...values].sort((a, b) => a - b)
  const positive = values.filter((v) => v > 0).length
  return {
    count: values.length,
    mean: round2(values.reduce((a, b) => a + b, 0) / values.length),
    median: round2(quantile(sorted, 0.5)),
    p75: round2(quantile(sorted, 0.75)),
    positive,
    breadth: round2((positive / values.length) * 100),
  }
}

export class IndustryMomentumFixtureService implements IndustryMomentumService {
  private readonly stocks = makeFixtureStocks()

  async getIndustryMomentum(minMarketCap: number): Promise<IndustryMomentumResponse> {
    const eligible = this.stocks.filter((s) => !minMarketCap || s.marketCapCr >= minMarketCap)
    const groups = new Map<string, typeof eligible>()
    for (const s of eligible) {
      const key = `${s.sector}|${s.industry}`
      groups.set(key, [...(groups.get(key) ?? []), s])
    }
    const previous = { 1: 0, 3: 1, 6: 3 } as const
    let excluded = 0
    const industries = []
    for (const rows of groups.values()) {
      if (rows.length < MIN_STOCKS) {
        excluded++
        continue
      }
      const periods = {} as Record<(typeof PERIODS)[number], PeriodStatsDto>
      for (const m of PERIODS) {
        periods[m] = periodStats(rows.map((s) => ((s.prices[previous[m]] - s.prices[m]) / s.prices[m]) * 100))
      }
      industries.push({ sector: rows[0].sector, industry: rows[0].industry, eligible: rows.length, periods })
    }
    return {
      generatedAt: '2026-11-10T10:00:00.000Z',
      minMarketCap: minMarketCap || null,
      minStocks: MIN_STOCKS,
      periods: [...PERIODS],
      eligibleStocks: eligible.length,
      excludedIndustries: excluded,
      industries,
    }
  }
}
