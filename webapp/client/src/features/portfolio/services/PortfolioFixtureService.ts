import { ApiError } from '../../../core/network/ApiError'
import type { HoldingDto, PositionDto } from '../models/HoldingModel'
import { NOT_CONNECTED, type PortfolioResponse, type PortfolioService } from './PortfolioService'

const HOLDINGS: Array<[string, number, number, number, number]> = [
  ['HDFCBANK', 120, 1620.5, 1935.4, 0.8],
  ['TCS', 30, 3890, 3054.2, -1.1],
  ['BHEL', 400, 212.3, 266.45, 2.4],
  ['SUNPHARMA', 80, 1520, 1700.55, 0.3],
  ['TATASTEEL', 600, 138.2, 175.4, -0.6],
  ['APOLLOHOSP', 15, 6250, 7830.5, 1.2],
  ['NEWLISTING', 10, 500, 520, 0.5],
]

export class PortfolioFixtureService implements PortfolioService {
  connected = true

  async getPortfolio(emaPeriod: number): Promise<PortfolioResponse> {
    if (!this.connected) throw new ApiError(NOT_CONNECTED, 409, NOT_CONNECTED)
    const holdings: HoldingDto[] = HOLDINGS.map(([symbol, qty, avg, ltp, dayPct]) => {
      const ema = symbol === 'NEWLISTING' ? null : ltp * (1 - (dayPct / 100) * (emaPeriod / 15))
      return {
        tradingsymbol: symbol,
        quantity: qty,
        average_price: avg,
        last_price: ltp,
        pnl: (ltp - avg) * qty,
        day_change: (ltp * dayPct) / 100,
        day_change_percentage: dayPct,
        ema,
        ema_signal: ema === null ? null : ltp < ema ? 'below' : 'above',
      }
    })
    const positions: PositionDto[] = [
      { tradingsymbol: 'SBIN', product: 'MIS', quantity: -50, average_price: 860, last_price: 857.7, pnl: 115, m2m: 115 },
      { tradingsymbol: 'INFY', product: 'CNC', quantity: 20, average_price: 1470, last_price: 1488.75, pnl: 375, m2m: 210 },
    ]
    const totalInvestment = holdings.reduce((a, h) => a + h.average_price * h.quantity, 0)
    const currentValue = holdings.reduce((a, h) => a + h.last_price * h.quantity, 0)
    return {
      generatedAt: '2026-11-10T10:00:00.000Z',
      emaPeriod,
      holdings,
      positions,
      summary: {
        totalInvestment,
        currentValue,
        totalPnl: holdings.reduce((a, h) => a + h.pnl, 0) + positions.reduce((a, p) => a + p.pnl, 0),
        dayPnl: holdings.reduce((a, h) => a + (h.day_change ?? 0) * h.quantity, 0),
      },
    }
  }
}
