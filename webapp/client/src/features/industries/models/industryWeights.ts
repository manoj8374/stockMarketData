export const PERIODS = [1, 3, 6] as const
export type Period = (typeof PERIODS)[number]

export const BLEND_KEYS = ['median', 'p75', 'mean'] as const
export type BlendKey = (typeof BLEND_KEYS)[number]
export const BLEND_LABELS: Record<BlendKey, string> = { median: 'Median', p75: 'P75', mean: 'Mean' }

export type BlendWeights = Record<BlendKey, number | string>
export type PeriodWeights = Record<Period, number | string>

export const DEFAULT_BLEND: BlendWeights = { median: 60, p75: 25, mean: 15 }
export const DEFAULT_PERIOD_WEIGHTS: PeriodWeights = { 1: 40, 3: 30, 6: 30 }

// Inputs don't have to add up to 100; they are scaled to fractions of 1.
// Negative inputs count as 0. Null when nothing has any weight.
export function normalize<K extends string | number>(raw: Record<K, number | string>, keys: readonly K[]) {
  let sum = 0
  const values = {} as Record<K, number>
  for (const k of keys) {
    values[k] = Math.max(0, Number(raw[k]) || 0)
    sum += values[k]
  }
  if (sum <= 0) return null
  const out = {} as Record<K, number>
  for (const k of keys) out[k] = values[k] / sum
  return out
}

export function weightNote<K extends string | number>(raw: Record<K, number | string>, keys: readonly K[]) {
  const normalized = normalize(raw, keys)
  if (!normalized) return 'All weights are 0, so no scores'
  const sum = keys.reduce((acc, k) => acc + Math.max(0, Number(raw[k]) || 0), 0)
  if (sum === 100) return 'Adds up to 100%'
  return `Adds up to ${sum.toFixed(0)}% · scaled to ${keys.map((k) => `${(normalized[k] * 100).toFixed(0)}%`).join(' / ')}`
}

export function periodDescription(m: Period) {
  const idx = PERIODS.indexOf(m)
  return idx === 0 ? `today vs ${m}M ago` : `${PERIODS[idx - 1]}M ago vs ${m}M ago`
}

export function sanitizeWeights<T extends Record<string, number | string>>(saved: unknown, defaults: T): T {
  if (!saved || typeof saved !== 'object') return { ...defaults }
  const out = { ...defaults }
  for (const key of Object.keys(defaults) as Array<keyof T>) {
    const v = (saved as Record<string, unknown>)[key as string]
    const usable = (typeof v === 'number' || (typeof v === 'string' && v.trim() !== '')) && Number.isFinite(Number(v))
    if (usable) out[key] = v as T[keyof T]
  }
  return out
}
