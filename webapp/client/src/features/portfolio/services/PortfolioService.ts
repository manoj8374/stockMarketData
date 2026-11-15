import type { HoldingDto, PositionDto } from '../models/HoldingModel'

export interface PortfolioSummaryDto {
  totalInvestment: number
  currentValue: number
  totalPnl: number
  dayPnl: number
}

export interface PortfolioResponse {
  generatedAt: string
  emaPeriod: number
  holdings: HoldingDto[]
  positions: PositionDto[]
  summary: PortfolioSummaryDto
}

export const NOT_CONNECTED = 'not_connected'

export interface PortfolioService {
  getPortfolio(emaPeriod: number, signal?: AbortSignal): Promise<PortfolioResponse>
}
