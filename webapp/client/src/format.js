// Shared number/date formatting and small helpers used by every page.

const isNil = (v) => v === null || v === undefined || v === ''

export function isNum(v) {
  return !isNil(v) && Number.isFinite(Number(v))
}

export function formatPrice(v) {
  if (!isNum(v)) return '—'
  return Number(v).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function formatMarketCap(v) {
  if (!isNum(v)) return '—'
  const n = Number(v)
  if (n >= 100000) return `₹${(n / 100000).toLocaleString('en-IN', { maximumFractionDigits: 2 })} L Cr`
  return `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 0 })} Cr`
}

export function formatPct(v, digits = 2) {
  if (!isNum(v)) return '—'
  const n = Number(v)
  return `${n > 0 ? '+' : ''}${n.toFixed(digits)}%`
}

export function formatMoney(v, digits = 2) {
  if (!isNum(v)) return '—'
  const n = Number(v)
  const abs = Math.abs(n).toLocaleString('en-IN', { minimumFractionDigits: digits, maximumFractionDigits: digits })
  return `${n < 0 ? '-' : ''}₹${abs}`
}

export function formatSignedMoney(v, digits = 2) {
  if (!isNum(v)) return '—'
  return `${Number(v) > 0 ? '+' : ''}${formatMoney(v, digits)}`
}

export function formatInt(v) {
  return isNum(v) ? Number(v).toLocaleString('en-IN') : '—'
}

function toDate(v) {
  if (!v) return null
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? null : d
}

export function formatDate(v) {
  const d = toDate(v)
  return d ? d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'
}

export function formatMonthYear(v) {
  const d = toDate(v)
  return d ? d.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }) : '—'
}

export function formatDateTime(v) {
  const d = toDate(v)
  return d ? d.toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '—'
}

// 'up' for zero and above, 'down' below zero, '' when there's no value --
// the same split the app has always used for green/red.
export function tone(v) {
  if (!isNum(v)) return ''
  return Number(v) >= 0 ? 'up' : 'down'
}

export function median(values) {
  const a = values.filter(isNum).map(Number).sort((x, y) => x - y)
  if (!a.length) return null
  const pos = (a.length - 1) / 2
  const lo = Math.floor(pos)
  const hi = Math.ceil(pos)
  return a[lo] + (a[hi] - a[lo]) * (pos - lo)
}

export function percentLabel(fraction) {
  return `${Math.round(fraction * 100)}%`
}

export function loadJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key)
    return raw === null ? fallback : JSON.parse(raw)
  } catch {
    return fallback
  }
}

export function saveJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // storage unavailable -- the setting still works for this session
  }
}

// Sector/industry names can contain "/" (e.g. "Automobiles-Trucks/Lcv"), so
// each one is encoded as a single path segment.
export function sectorPath(sector) {
  return `/sectors/${encodeURIComponent(sector)}`
}

export function industryPath(sector, industry) {
  return `/sectors/${encodeURIComponent(sector)}/${encodeURIComponent(industry)}`
}
