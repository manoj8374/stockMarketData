import { toNum, type Numeric } from '../../../common/utils/format'
import { BACK_SCORE_MONTHS } from './weights'

export interface StockDto {
  id: number
  tradingsymbol: string
  name: string | null
  sector: string | null
  industry: string | null
  current_price: Numeric
  current_ts?: string | null
  all_time_high: Numeric
  ath_date: string | null
  market_cap_cr: Numeric
  market_cap_updated_at?: string | null
  diff_from_ath: Numeric
  [field: string]: unknown
}

export type BackPivot = 1 | 3

// For each back-score pivot: the three older month marks it looks back to.
// 1M-back measures 1→2, 2→4 and 4→7 months ago, the same non-overlapping
// windows as today's 1M/3M/6M score, shifted one month into the past.
const BACK_WINDOWS: Record<BackPivot, readonly [number, number, number]> = {
  1: [2, 4, 7],
  3: [4, 6, 9],
}

export const PRICE_HISTORY_OFFSETS = [1, 2, 3, 4, 6, 7, 9]

export interface BackRow {
  label: string
  date: string | null
  price: number | null
  returnPct: number | null
}

export interface PricePoint {
  monthsAgo: number
  price: number
  date: string | null
}

export class StockModel {
  readonly id: number
  readonly symbol: string
  readonly name: string
  readonly sector: string | null
  readonly industry: string | null
  readonly price: number | null
  readonly priceAt: string | null
  readonly allTimeHigh: number | null
  readonly athDate: string | null
  readonly marketCapCr: number | null
  readonly marketCapUpdatedAt: string | null
  readonly diffFromAth: number | null
  private readonly dto: StockDto

  constructor(dto: StockDto) {
    this.dto = dto
    this.id = dto.id
    this.symbol = dto.tradingsymbol
    this.name = dto.name ?? ''
    this.sector = dto.sector
    this.industry = dto.industry
    this.price = toNum(dto.current_price)
    this.priceAt = dto.current_ts ?? null
    this.allTimeHigh = toNum(dto.all_time_high)
    this.athDate = dto.ath_date
    this.marketCapCr = toNum(dto.market_cap_cr)
    this.marketCapUpdatedAt = dto.market_cap_updated_at ?? null
    this.diffFromAth = toNum(dto.diff_from_ath)
  }

  get isAtAllTimeHigh() {
    return this.diffFromAth !== null && this.diffFromAth > -0.5
  }

  priceMonthsAgo(months: number) {
    return toNum((this.dto[`price_${months}m`] ?? this.dto[`bref_${months}m`]) as Numeric)
  }

  dateMonthsAgo(months: number) {
    return ((this.dto[`date_${months}m`] ?? this.dto[`brefdate_${months}m`]) as string | null | undefined) ?? null
  }

  returnFor(months: number) {
    return toNum(this.dto[`return_${months}m`] as Numeric)
  }

  // Weighted blend of the selected periods' returns. Null when any selected
  // period has no price data, rather than silently re-weighting the rest.
  momentumScore(months: readonly number[], weightsPct: Record<number, number>) {
    let score = 0
    for (const m of months) {
      const r = this.returnFor(m)
      if (r === null) return null
      score += (weightsPct[m] / 100) * r
    }
    return score
  }

  backReturns(pivot: BackPivot) {
    return BACK_WINDOWS[pivot].map((ago) => toNum(this.dto[`return_${pivot}back_${ago}m`] as Numeric))
  }

  backScore(pivot: BackPivot, weightsPct: Record<number, number>) {
    const returns = this.backReturns(pivot)
    if (returns.some((r) => r === null)) return null
    return BACK_SCORE_MONTHS.reduce((acc, m, i) => acc + (weightsPct[m] / 100) * (returns[i] as number), 0)
  }

  backBreakdown(pivot: BackPivot) {
    const returns = this.backReturns(pivot)
    const labels = ['1M before pivot', '3M before pivot', '6M before pivot']
    return {
      pivotDate: this.dateMonthsAgo(pivot),
      pivotPrice: this.priceMonthsAgo(pivot),
      rows: BACK_WINDOWS[pivot].map<BackRow>((ago, i) => ({
        label: labels[i],
        date: this.dateMonthsAgo(ago),
        price: this.priceMonthsAgo(ago),
        returnPct: returns[i],
      })),
    }
  }

  // Closing price at every month mark the API returned, oldest first.
  priceHistory(selectedMonths: readonly number[]): PricePoint[] {
    const points = new Map<number, PricePoint>()
    if (this.price !== null && this.price > 0) points.set(0, { monthsAgo: 0, price: this.price, date: this.priceAt })
    for (const m of [...PRICE_HISTORY_OFFSETS, ...selectedMonths]) {
      const price = this.priceMonthsAgo(m)
      if (price !== null && price > 0 && !points.has(m)) points.set(m, { monthsAgo: m, price, date: this.dateMonthsAgo(m) })
    }
    return [...points.values()].sort((a, b) => b.monthsAgo - a.monthsAgo)
  }
}
