import { IndustryMomentumModel, type PeriodStatsDto } from './IndustryMomentumModel'
import { normalize, sanitizeWeights, weightNote, DEFAULT_BLEND } from './industryWeights'

const stats = (median: number | null, p75 = 0, mean = 0): PeriodStatsDto => ({
  count: median === null ? 2 : 8,
  median,
  p75: median === null ? null : p75,
  mean: median === null ? null : mean,
  positive: median === null ? null : 5,
  breadth: median === null ? null : 62.5,
})

const model = new IndustryMomentumModel({
  sector: 'Energy',
  industry: 'Oil',
  eligible: 8,
  periods: { 1: stats(2, 4, 3), 3: stats(-1, 1, 0), 6: stats(null) },
})

describe('industry weights', () => {
  it('normalizes to fractions and ignores negatives', () => {
    expect(normalize({ a: 60, b: -10, c: 40 }, ['a', 'b', 'c'] as const)).toEqual({ a: 0.6, b: 0, c: 0.4 })
  })

  it('returns null when nothing has weight', () => {
    expect(normalize({ a: 0 }, ['a'] as const)).toBeNull()
    expect(weightNote({ a: 0 }, ['a'] as const)).toMatch(/no scores/)
  })

  it('keeps only usable saved weights', () => {
    expect(sanitizeWeights({ median: '70', p75: 'x', mean: null }, DEFAULT_BLEND)).toEqual({ median: '70', p75: 25, mean: 15 })
  })
})

describe('IndustryMomentumModel', () => {
  const blend = { median: 0.6, p75: 0.25, mean: 0.15 }

  it('blends median, P75 and mean into a period score', () => {
    expect(model.periodScore(1, blend)).toBeCloseTo(0.6 * 2 + 0.25 * 4 + 0.15 * 3)
  })

  it('has no score when a weighted period lacks stats', () => {
    expect(model.score(blend, { 1: 0.4, 3: 0.3, 6: 0.3 })).toBeNull()
  })

  it('ignores a period whose weight is 0', () => {
    const score = model.score(blend, { 1: 0.5, 3: 0.5, 6: 0 })
    expect(score).toBeCloseTo(0.5 * model.periodScore(1, blend)! + 0.5 * model.periodScore(3, blend)!)
  })

  it('reads raw metrics per period', () => {
    expect(model.metric('median', 3, blend)).toBe(-1)
    expect(model.metric('breadth', 1, blend)).toBe(62.5)
  })
})
