import { makeAutoObservable } from 'mobx'
import { Resource } from '../../../core/network/Resource'
import { HoldingModel, PositionModel } from '../models/HoldingModel'
import { NOT_CONNECTED, type PortfolioService, type PortfolioSummaryDto } from '../services/PortfolioService'

export interface Portfolio {
  generatedAt: string
  emaPeriod: number
  holdings: HoldingModel[]
  positions: PositionModel[]
  summary: PortfolioSummaryDto
}

export const DEFAULT_EMA_PERIOD = 15
export const EMA_MIN = 2
export const EMA_MAX = 200
const EMA_KEY = 'portfolioEmaPeriod'

export function clampEmaPeriod(value: unknown, fallback = DEFAULT_EMA_PERIOD) {
  const n = typeof value === 'number' ? value : parseInt(String(value), 10)
  return Number.isFinite(n) ? Math.min(EMA_MAX, Math.max(EMA_MIN, Math.round(n))) : fallback
}

function loadEmaPeriod() {
  try {
    const saved = Number(localStorage.getItem(EMA_KEY))
    return Number.isInteger(saved) && saved >= EMA_MIN && saved <= EMA_MAX ? saved : DEFAULT_EMA_PERIOD
  } catch {
    return DEFAULT_EMA_PERIOD
  }
}

export class PortfolioStore {
  emaPeriod = loadEmaPeriod()
  readonly portfolio = new Resource<Portfolio>()
  private readonly service: PortfolioService

  constructor(service: PortfolioService) {
    this.service = service
    makeAutoObservable<PortfolioStore, 'service'>(this, { service: false, portfolio: false }, { autoBind: true })
  }

  get isNotConnected() {
    return this.portfolio.error?.code === NOT_CONNECTED
  }

  setEmaPeriod(period: number) {
    this.emaPeriod = clampEmaPeriod(period, this.emaPeriod)
    try {
      localStorage.setItem(EMA_KEY, String(this.emaPeriod))
    } catch {
      // storage unavailable; the period still applies for this session
    }
  }

  load() {
    const period = this.emaPeriod
    return this.portfolio.load(async (signal) => {
      const response = await this.service.getPortfolio(period, signal)
      return {
        generatedAt: response.generatedAt,
        emaPeriod: response.emaPeriod,
        holdings: response.holdings.map((dto) => new HoldingModel(dto)),
        positions: response.positions.map((dto) => new PositionModel(dto)),
        summary: response.summary,
      }
    })
  }
}
