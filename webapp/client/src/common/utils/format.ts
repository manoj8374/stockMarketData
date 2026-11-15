export type Numeric = number | string | null | undefined

export function isNum(v: Numeric): v is number | string {
  return v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v))
}

export function toNum(v: Numeric): number | null {
  return isNum(v) ? Number(v) : null
}

export function formatPrice(v: Numeric) {
  if (!isNum(v)) return '—'
  return Number(v).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function formatMarketCap(v: Numeric) {
  if (!isNum(v)) return '—'
  const n = Number(v)
  if (n >= 100000) return `₹${(n / 100000).toLocaleString('en-IN', { maximumFractionDigits: 2 })} L Cr`
  return `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 0 })} Cr`
}

export function formatPct(v: Numeric, digits = 2) {
  if (!isNum(v)) return '—'
  const n = Number(v)
  return `${n > 0 ? '+' : ''}${n.toFixed(digits)}%`
}

export function formatMoney(v: Numeric, digits = 2) {
  if (!isNum(v)) return '—'
  const n = Number(v)
  const abs = Math.abs(n).toLocaleString('en-IN', { minimumFractionDigits: digits, maximumFractionDigits: digits })
  return `${n < 0 ? '-' : ''}₹${abs}`
}

export function formatSignedMoney(v: Numeric, digits = 2) {
  if (!isNum(v)) return '—'
  return `${Number(v) > 0 ? '+' : ''}${formatMoney(v, digits)}`
}

export function formatInt(v: Numeric) {
  return isNum(v) ? Number(v).toLocaleString('en-IN') : '—'
}

export function formatCompact(v: Numeric) {
  if (!isNum(v)) return '—'
  const n = Number(v)
  if (Math.abs(n) >= 1e7) return `${(n / 1e7).toFixed(2)} Cr`
  if (Math.abs(n) >= 1e5) return `${(n / 1e5).toFixed(2)} L`
  return n.toLocaleString('en-IN')
}

function toDate(v: string | number | Date | null | undefined) {
  if (v === null || v === undefined || v === '') return null
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? null : d
}

type DateInput = string | number | Date | null | undefined

export function formatDate(v: DateInput) {
  const d = toDate(v)
  return d ? d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'
}

export function formatMonthYear(v: DateInput) {
  const d = toDate(v)
  return d ? d.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }) : '—'
}

export function formatDateTime(v: DateInput) {
  const d = toDate(v)
  return d ? d.toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '—'
}

export function formatTime(v: DateInput) {
  const d = toDate(v)
  return d ? d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—'
}

export type Tone = 'up' | 'down' | ''

export function tone(v: Numeric): Tone {
  if (!isNum(v)) return ''
  return Number(v) >= 0 ? 'up' : 'down'
}

export function median(values: Numeric[]) {
  const a = values.filter(isNum).map(Number).sort((x, y) => x - y)
  if (!a.length) return null
  return quantile(a, 0.5)
}

export function quantile(sortedAsc: number[], q: number) {
  const pos = (sortedAsc.length - 1) * q
  const lo = Math.floor(pos)
  const hi = Math.ceil(pos)
  return sortedAsc[lo] + (sortedAsc[hi] - sortedAsc[lo]) * (pos - lo)
}

export function percentLabel(fraction: number) {
  return `${Math.round(fraction * 100)}%`
}

export function sectorPath(sector: string) {
  return `/sectors/${encodeURIComponent(sector)}`
}

export function industryPath(sector: string, industry: string) {
  return `/sectors/${encodeURIComponent(sector)}/${encodeURIComponent(industry)}`
}
