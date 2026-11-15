import type { StockDto } from '../models/StockModel'

export interface StocksQuery {
  months: readonly number[]
  minMarketCap: number
  sector?: string | null
  industry?: string | null
}

export interface StocksResponse {
  generatedAt: string
  months: number[]
  stocks: StockDto[]
}

export interface StocksService {
  getStocks(query: StocksQuery, options?: { refresh?: boolean; signal?: AbortSignal }): Promise<StocksResponse>
}
