// Industry Momentum scoring, shared by the Industry Momentum page and the
// industry drill-down header on the Sectors page.

// Must match INDUSTRY_PERIODS in api/_industryStats.js.
export const PERIODS = [1, 3, 6]

export const BLEND_FIELDS = [
  ['median', 'Median'],
  ['p75', 'P75'],
  ['mean', 'Mean'],
]
export const BLEND_KEYS = BLEND_FIELDS.map(([k]) => k)
export const BLEND_LABELS = Object.fromEntries(BLEND_FIELDS)
export const DEFAULT_BLEND = { median: 60, p75: 25, mean: 15 }
export const DEFAULT_PERIOD_WEIGHTS = { 1: 40, 3: 30, 6: 30 }
export const BLEND_STORAGE_KEY = 'industryBlendWeights'
export const PERIOD_STORAGE_KEY = 'industryPeriodWeights'

// Same gap semantics as the stock screener's return columns (see
// buildGapReturnCols in api/_db.js): each period is measured only since the
// next-smaller one, so no stretch of price action is counted twice.
export function periodDescription(m) {
  const idx = PERIODS.indexOf(m)
  return idx === 0 ? `Today vs ${m}M ago` : `${PERIODS[idx - 1]}M ago vs ${m}M ago`
}

export function loadStoredWeights(storageKey, defaults) {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey))
    if (saved && typeof saved === 'object') {
      const out = {}
      for (const k of Object.keys(defaults)) {
        const v = saved[k]
        const usable =
          (typeof v === 'number' || (typeof v === 'string' && v.trim() !== '')) && Number.isFinite(Number(v))
        out[k] = usable ? v : defaults[k]
      }
      return out
    }
  } catch {
    // ignore malformed storage
  }
  return { ...defaults }
}

// Raw weight inputs don't have to sum to 100 -- normalize proportionally to
// fractions (same "auto-normalize" behavior as the stock screener's weights).
// Negative inputs count as 0. Returns null if nothing has any weight.
export function normalize(raw, keys) {
  const vals = {}
  let sum = 0
  for (const k of keys) {
    vals[k] = Math.max(0, Number(raw[k]) || 0)
    sum += vals[k]
  }
  if (sum <= 0) return null
  const out = {}
  for (const k of keys) out[k] = vals[k] / sum
  return out
}

export function weightNote(raw, keys, normalized) {
  const sum = keys.reduce((acc, k) => acc + Math.max(0, Number(raw[k]) || 0), 0)
  if (!normalized) return 'All weights are 0, so no scores'
  if (sum === 100) return 'Adds up to 100%'
  return `Adds up to ${sum.toFixed(0)}% · scaled to ` + keys.map((k) => `${(normalized[k] * 100).toFixed(0)}%`).join(' / ')
}

// Flattens each industry's per-period stats into sortable row fields and
// computes the weighted scores:
//   period score   = blend of median / P75 / mean for that period
//   momentum score = weighted blend of the period scores
// A period with too few stocks to have stats makes the overall score
// unavailable (rather than silently re-weighting the remaining periods),
// unless that period's weight is 0.
export function buildIndustryRows(industries, normalizedBlend, normalizedPeriods) {
  return industries.map((ind) => {
    const row = { sector: ind.sector, industry: ind.industry, eligible: ind.eligible, stats: ind.periods }
    for (const m of PERIODS) {
      const st = ind.periods[m]
      row[`mean_${m}m`] = st.mean
      row[`median_${m}m`] = st.median
      row[`breadth_${m}m`] = st.breadth
      row[`score_${m}m`] =
        normalizedBlend && st.median !== null
          ? normalizedBlend.median * st.median + normalizedBlend.p75 * st.p75 + normalizedBlend.mean * st.mean
          : null
    }
    let score = null
    if (normalizedPeriods) {
      let acc = 0
      let complete = true
      for (const m of PERIODS) {
        if (normalizedPeriods[m] === 0) continue
        const ps = row[`score_${m}m`]
        if (ps === null) {
          complete = false
          break
        }
        acc += normalizedPeriods[m] * ps
      }
      score = complete ? acc : null
    }
    row.score = score
    return row
  })
}
