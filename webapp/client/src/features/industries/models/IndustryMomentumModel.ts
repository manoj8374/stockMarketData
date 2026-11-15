import { PERIODS, type BlendKey, type Period } from './industryWeights'

export interface PeriodStatsDto {
  count: number
  mean: number | null
  median: number | null
  p75: number | null
  positive: number | null
  breadth: number | null
}

export interface IndustryMomentumDto {
  sector: string | null
  industry: string
  eligible: number
  periods: Record<Period, PeriodStatsDto>
}

export type Metric = 'score' | 'median' | 'mean' | 'breadth'

export class IndustryMomentumModel {
  readonly sector: string | null
  readonly industry: string
  readonly eligible: number
  private readonly periods: Record<Period, PeriodStatsDto>

  constructor(dto: IndustryMomentumDto) {
    this.sector = dto.sector
    this.industry = dto.industry
    this.eligible = dto.eligible
    this.periods = dto.periods
  }

  get key() {
    return `${this.sector ?? ''}|${this.industry}`
  }

  stats(period: Period) {
    return this.periods[period]
  }

  // One period's score: a blend of the median, P75 and mean return of its
  // stocks. Null when the period has too few stocks to have stats.
  periodScore(period: Period, blend: Record<BlendKey, number> | null) {
    const st = this.periods[period]
    if (!blend || st.median === null || st.p75 === null || st.mean === null) return null
    return blend.median * st.median + blend.p75 * st.p75 + blend.mean * st.mean
  }

  // A weighted period with no stats makes the whole score unavailable,
  // rather than silently re-weighting the remaining periods.
  score(blend: Record<BlendKey, number> | null, periodWeights: Record<Period, number> | null) {
    if (!periodWeights) return null
    let total = 0
    for (const m of PERIODS) {
      if (periodWeights[m] === 0) continue
      const ps = this.periodScore(m, blend)
      if (ps === null) return null
      total += periodWeights[m] * ps
    }
    return total
  }

  metric(metric: Metric, period: Period, blend: Record<BlendKey, number> | null) {
    if (metric === 'score') return this.periodScore(period, blend)
    return this.periods[period][metric]
  }
}
