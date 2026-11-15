export type WeightInput = number | string
export type Weights = Record<number, WeightInput>

export const MONTH_OPTIONS = Array.from({ length: 12 }, (_, i) => i + 1)
export const DEFAULT_MONTHS = [1, 3, 6]
export const DEFAULT_WEIGHTS: Weights = { 1: 20, 3: 30, 6: 50 }
export const BACK_SCORE_MONTHS = [1, 3, 6] as const

export function rawWeightSum(weights: Weights, months: readonly number[]) {
  return months.reduce((acc, m) => acc + (Number(weights[m]) || 0), 0)
}

// Raw inputs don't have to add up to 100: they are scaled proportionally, so
// 1/1/1 behaves like 33/33/33. Returns percentages keyed by month.
export function normalizeWeights(weights: Weights, months: readonly number[]): Record<number, number> {
  const sum = rawWeightSum(weights, months)
  const out: Record<number, number> = {}
  for (const m of months) out[m] = sum > 0 ? ((Number(weights[m]) || 0) / sum) * 100 : 0
  return out
}

// Back-scores always use the 1M/3M/6M weight values, even when those
// periods aren't currently selected.
export function backScoreWeights(weights: Weights) {
  return normalizeWeights(weights, BACK_SCORE_MONTHS)
}

export function gapDescription(months: readonly number[], index: number) {
  const m = months[index]
  return index === 0 ? `${m}M ago → today` : `${m}M ago → ${months[index - 1]}M ago`
}
