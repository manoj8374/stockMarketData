import { StockModel, type StockDto } from './StockModel'
import { backScoreWeights, normalizeWeights, rawWeightSum } from './weights'

function dto(overrides: Partial<StockDto> = {}): StockDto {
  return {
    id: 1,
    tradingsymbol: 'ABC',
    name: 'ABC Ltd',
    sector: 'Energy',
    industry: 'Oil',
    current_price: '110.00',
    all_time_high: 125,
    ath_date: '2026-01-01',
    market_cap_cr: 5000,
    diff_from_ath: -12,
    return_1m: 10,
    return_3m: -4,
    return_6m: 20,
    price_1m: 100,
    bref_1m: 100,
    bref_2m: 90,
    bref_4m: 80,
    bref_7m: 100,
    brefdate_1m: '2026-10-10',
    return_1back_2m: 11.11,
    return_1back_4m: 12.5,
    return_1back_7m: -20,
    return_3back_4m: 5,
    return_3back_6m: 5,
    return_3back_9m: null,
    ...overrides,
  }
}

describe('weights', () => {
  it('scales raw weights to percentages', () => {
    expect(normalizeWeights({ 1: 1, 3: 1, 6: 2 }, [1, 3, 6])).toEqual({ 1: 25, 3: 25, 6: 50 })
  })

  it('gives every period 0% when nothing has weight', () => {
    expect(normalizeWeights({ 1: 0, 3: '' }, [1, 3])).toEqual({ 1: 0, 3: 0 })
  })

  it('treats a newly added period without a weight as 0', () => {
    expect(rawWeightSum({ 1: 20, 3: 30, 6: 50 }, [1, 2, 3, 6])).toBe(100)
  })

  it('always derives back-score weights from 1M, 3M and 6M', () => {
    expect(backScoreWeights({ 1: 20, 2: 50, 3: 30, 6: 50 })).toEqual({ 1: 20, 3: 30, 6: 50 })
  })
})

describe('StockModel', () => {
  it('parses numeric strings', () => {
    expect(new StockModel(dto()).price).toBe(110)
  })

  it('computes the weighted momentum score', () => {
    const stock = new StockModel(dto())
    expect(stock.momentumScore([1, 3, 6], { 1: 20, 3: 30, 6: 50 })).toBeCloseTo(0.2 * 10 + 0.3 * -4 + 0.5 * 20)
  })

  it('has no score when a selected period is missing', () => {
    const stock = new StockModel(dto({ return_6m: null }))
    expect(stock.momentumScore([1, 3, 6], { 1: 20, 3: 30, 6: 50 })).toBeNull()
  })

  it('computes the 1M-back score from its three windows', () => {
    const stock = new StockModel(dto())
    expect(stock.backScore(1, { 1: 20, 3: 30, 6: 50 })).toBeCloseTo(0.2 * 11.11 + 0.3 * 12.5 + 0.5 * -20)
  })

  it('has no back-score when a window is missing', () => {
    expect(new StockModel(dto()).backScore(3, { 1: 20, 3: 30, 6: 50 })).toBeNull()
  })

  it('describes the back-score windows', () => {
    const breakdown = new StockModel(dto()).backBreakdown(1)
    expect(breakdown.pivotPrice).toBe(100)
    expect(breakdown.rows.map((r) => r.price)).toEqual([90, 80, 100])
    expect(breakdown.rows[2].returnPct).toBe(-20)
  })

  it('builds a price history from oldest to latest', () => {
    const history = new StockModel(dto()).priceHistory([1, 3, 6])
    expect(history.map((p) => p.monthsAgo)).toEqual([7, 4, 2, 1, 0])
    expect(history[history.length - 1].price).toBe(110)
  })

  it('flags stocks at their all-time high', () => {
    expect(new StockModel(dto({ diff_from_ath: -0.2 })).isAtAllTimeHigh).toBe(true)
    expect(new StockModel(dto()).isAtAllTimeHigh).toBe(false)
  })
})
