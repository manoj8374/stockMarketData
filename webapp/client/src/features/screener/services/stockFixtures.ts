import type { StockDto } from '../models/StockModel'

const INDUSTRIES: Array<[sector: string, industry: string, drift: number]> = [
  ['Financial Services', 'Private Sector Bank', 1.2],
  ['Financial Services', 'Public Sector Bank', 2],
  ['Information Technology', 'Computers - Software & Consulting', -1.3],
  ['Automobile and Auto Components', '2/3 Wheelers', 2.4],
  ['Automobile and Auto Components', 'Automobiles-Trucks/Lcv', 1.1],
  ['Healthcare', 'Pharmaceuticals', 0.5],
  ['Capital Goods', 'Heavy Electrical Equipment', 3],
  ['Metals & Mining', 'Iron & Steel', 1.8],
]

const TODAY = new Date('2026-11-10T10:00:00Z')

function seeded(seed: number) {
  let t = seed >>> 0
  return () => {
    t = (t + 0x6d2b79f5) >>> 0
    let r = Math.imul(t ^ (t >>> 15), 1 | t)
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296
  }
}

const round2 = (v: number) => Math.round(v * 100) / 100

function monthsAgo(m: number) {
  const d = new Date(TODAY)
  d.setMonth(d.getMonth() - m)
  return d.toISOString()
}

interface FixtureStock {
  id: number
  symbol: string
  name: string
  sector: string
  industry: string
  marketCapCr: number
  prices: number[]
  allTimeHigh: number
  missingOlderData: boolean
}

export function makeFixtureStocks(count = 64): FixtureStock[] {
  const rand = seeded(7)
  return Array.from({ length: count }, (_, i) => {
    const [sector, industry, drift] = INDUSTRIES[i % INDUSTRIES.length]
    const prices = [round2(50 + rand() * 3000)]
    for (let m = 1; m <= 12; m++) prices.push(round2(prices[m - 1] / (1 + (drift + (rand() - 0.5) * 14) / 100)))
    return {
      id: i + 1,
      symbol: `STK${String(i + 1).padStart(3, '0')}`,
      name: `Sample Company ${i + 1} Ltd`,
      sector,
      industry,
      marketCapCr: i % 9 === 0 ? 900 + i : Math.round(2500 + rand() * 250000),
      prices,
      allTimeHigh: round2(Math.max(...prices) * (i % 11 === 0 ? 1 : 1 + rand() * 0.3)),
      missingOlderData: i % 23 === 5,
    }
  })
}

const pct = (from: number | null, to: number | null) => (from && to ? round2(((to - from) / from) * 100) : null)

export function toStockDto(s: FixtureStock, months: readonly number[]): StockDto {
  const sorted = [...months].sort((a, b) => a - b)
  const priceAt = (m: number) => (s.missingOlderData && m >= 6 ? null : s.prices[m])
  const dto: StockDto = {
    id: s.id,
    tradingsymbol: s.symbol,
    name: s.name,
    sector: s.sector,
    industry: s.industry,
    current_price: s.prices[0],
    current_ts: TODAY.toISOString(),
    all_time_high: s.allTimeHigh,
    ath_date: monthsAgo(14),
    market_cap_cr: s.marketCapCr,
    market_cap_updated_at: TODAY.toISOString(),
    diff_from_ath: pct(s.allTimeHigh, s.prices[0]),
  }
  sorted.forEach((m, i) => {
    dto[`price_${m}m`] = priceAt(m)
    dto[`date_${m}m`] = monthsAgo(m)
    dto[`return_${m}m`] = pct(priceAt(m), i === 0 ? s.prices[0] : priceAt(sorted[i - 1]))
  })
  for (const m of [1, 2, 3, 4, 6, 7, 9]) {
    dto[`bref_${m}m`] = priceAt(m)
    dto[`brefdate_${m}m`] = monthsAgo(m)
  }
  const back = (pivot: number, ago: number, baseline: number) =>
    (dto[`return_${pivot}back_${ago}m`] = pct(priceAt(ago), priceAt(baseline)))
  back(1, 2, 1)
  back(1, 4, 2)
  back(1, 7, 4)
  back(3, 4, 3)
  back(3, 6, 4)
  back(3, 9, 6)
  return dto
}
