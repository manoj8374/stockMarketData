import { makeFixtureStocks, toStockDto } from './stockFixtures'
import type { StocksQuery, StocksResponse, StocksService } from './StocksService'

export class StocksFixtureService implements StocksService {
  private readonly stocks = makeFixtureStocks()
  calls = 0

  async getStocks(query: StocksQuery): Promise<StocksResponse> {
    this.calls++
    const months = [...query.months].sort((a, b) => a - b)
    const stocks = this.stocks
      .filter((s) => !query.minMarketCap || s.marketCapCr >= query.minMarketCap)
      .filter((s) => !query.sector || s.sector === query.sector)
      .filter((s) => !query.industry || s.industry === query.industry)
      .map((s) => toStockDto(s, months))
    return { generatedAt: '2026-11-10T10:00:00.000Z', months, stocks }
  }
}
