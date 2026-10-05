import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import './App.css'
import { useTheme } from './useTheme'

// Must match INDUSTRY_PERIODS in api/_industryStats.js.
const PERIODS = [1, 3, 6]

const BLEND_FIELDS = [
  ['median', 'Median'],
  ['p75', 'P75'],
  ['mean', 'Mean'],
]
const BLEND_KEYS = BLEND_FIELDS.map(([k]) => k)
const DEFAULT_BLEND = { median: 60, p75: 25, mean: 15 }
const DEFAULT_PERIOD_WEIGHTS = { 1: 40, 3: 30, 6: 30 }

// Same gap semantics as the stock screener's return columns (see
// buildGapReturnCols in api/_db.js): each period is measured only since the
// next-smaller one, so no stretch of price action is counted twice.
function periodDescription(m) {
  const idx = PERIODS.indexOf(m)
  return idx === 0 ? `Today vs ${m}M ago` : `${PERIODS[idx - 1]}M ago vs ${m}M ago`
}

const COLUMNS = [
  { key: 'industry', label: 'Industry', type: 'text' },
  { key: 'sector', label: 'Sector', type: 'text' },
  { key: 'eligible', label: 'Stocks', type: 'int', title: 'Stocks included in the calculations (respects the small-cap toggle)' },
  { key: 'score', label: 'Momentum Score', type: 'pct', title: 'Weighted blend of the per-period scores' },
  ...PERIODS.map((m) => ({ key: `mean_${m}m`, label: `${m}M Mean`, type: 'pct', period: m })),
  ...PERIODS.map((m) => ({ key: `median_${m}m`, label: `${m}M Median`, type: 'pct', period: m })),
  ...PERIODS.map((m) => ({ key: `score_${m}m`, label: `${m}M Score`, type: 'score', period: m })),
  ...PERIODS.map((m) => ({ key: `breadth_${m}m`, label: `${m}M Breadth`, type: 'breadth', period: m })),
]

function loadStoredWeights(storageKey, defaults) {
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
function normalize(raw, keys) {
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

function weightNote(raw, keys, normalized) {
  const sum = keys.reduce((acc, k) => acc + Math.max(0, Number(raw[k]) || 0), 0)
  if (!normalized) return 'All weights are 0 — scores unavailable'
  if (sum === 100) return 'Sums to 100%'
  return `Sums to ${sum.toFixed(0)}% — auto-normalized to ` + keys.map((k) => `${(normalized[k] * 100).toFixed(0)}%`).join('/')
}

function formatPct(v) {
  if (v === null || v === undefined) return '—'
  const n = Number(v)
  const sign = n > 0 ? '+' : ''
  return `${sign}${n.toFixed(2)}%`
}

function pctClass(v) {
  if (v === null || v === undefined) return ''
  return Number(v) >= 0 ? 'positive' : 'negative'
}

// minMarketCap comes from the app-wide "hide small caps" toggle (0 = all
// companies). The API always receives it explicitly, so the calculations
// here always match what the Stocks and Sectors tabs show.
export default function IndustryMomentum({ minMarketCap = 0 }) {
  const [theme, setTheme] = useTheme()
  const navigate = useNavigate()

  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [blend, setBlend] = useState(() => loadStoredWeights('industryBlendWeights', DEFAULT_BLEND))
  const [periodWeights, setPeriodWeights] = useState(() =>
    loadStoredWeights('industryPeriodWeights', DEFAULT_PERIOD_WEIGHTS)
  )
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState({ key: 'score', direction: 'desc' })
  const [reloadToken, setReloadToken] = useState(0)
  const bypassCache = useRef(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    const params = new URLSearchParams({ minMarketCap: String(minMarketCap) })
    if (bypassCache.current) params.set('refresh', '1')
    bypassCache.current = false
    fetch(`/api/industry-momentum?${params.toString()}`)
      .then((r) => {
        if (!r.ok) throw new Error(`Request failed: ${r.status}`)
        return r.json()
      })
      .then((json) => {
        if (!cancelled) setData(json)
      })
      .catch((e) => {
        if (!cancelled) setError(e.message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    // A newer request (toggle flipped, or Refresh) supersedes this one --
    // don't let a slow older response overwrite it.
    return () => {
      cancelled = true
    }
  }, [minMarketCap, reloadToken])

  useEffect(() => {
    localStorage.setItem('industryBlendWeights', JSON.stringify(blend))
  }, [blend])

  useEffect(() => {
    localStorage.setItem('industryPeriodWeights', JSON.stringify(periodWeights))
  }, [periodWeights])

  function refresh() {
    bypassCache.current = true
    setReloadToken((t) => t + 1)
  }

  function toggleSort(key) {
    setSort((prev) => {
      if (prev.key !== key) return { key, direction: 'desc' }
      return { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' }
    })
  }

  const normalizedBlend = useMemo(() => normalize(blend, BLEND_KEYS), [blend])
  const normalizedPeriods = useMemo(() => normalize(periodWeights, PERIODS), [periodWeights])

  // Flatten each industry's per-period stats into sortable row fields, and
  // compute the weighted scores:
  //   period score = blend of median / P75 / mean for that period
  //   momentum score = weighted blend of the period scores
  // A period with too few stocks to have stats makes the overall score
  // unavailable (rather than silently re-weighting the remaining periods),
  // unless that period's weight is 0.
  const rows = useMemo(() => {
    if (!data) return []
    return data.industries.map((ind) => {
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
  }, [data, normalizedBlend, normalizedPeriods])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((r) => r.industry.toLowerCase().includes(q) || (r.sector || '').toLowerCase().includes(q))
  }, [rows, search])

  const sorted = useMemo(() => {
    const arr = [...filtered]
    const { key, direction } = sort
    const column = COLUMNS.find((c) => c.key === key)
    const isText = column && column.type === 'text'
    arr.sort((a, b) => {
      const av = a[key]
      const bv = b[key]
      if (av === null || av === undefined) return 1
      if (bv === null || bv === undefined) return -1
      const cmp = isText ? String(av).localeCompare(String(bv)) : Number(av) - Number(bv)
      return direction === 'asc' ? cmp : -cmp
    })
    return arr
  }, [filtered, sort])

  function renderCell(row, col) {
    const val = row[col.key]
    if (col.key === 'industry') return <td key={col.key} className="symbol-cell">{val}</td>
    if (col.type === 'text') return <td key={col.key} className="muted">{val || '—'}</td>
    if (col.type === 'int') return <td key={col.key} className="num">{val}</td>
    if (col.type === 'breadth') {
      const st = row.stats[col.period]
      if (val === null) {
        return (
          <td key={col.key} className="num muted" title={`Only ${st.count} stock(s) with a ${col.period}M return`}>
            —
          </td>
        )
      }
      return (
        <td
          key={col.key}
          className={`num pct ${val >= 50 ? 'positive' : 'negative'}`}
          title={`${st.positive} of ${st.count} stocks had a positive ${col.period}M return`}
        >
          {Number(val).toFixed(0)}% <span className="muted small breadth-count">{st.positive}/{st.count}</span>
        </td>
      )
    }
    if (col.type === 'score') {
      const st = row.stats[col.period]
      const title =
        st.median === null
          ? `Only ${st.count} stock(s) with a ${col.period}M return`
          : `Median ${formatPct(st.median)} · P75 ${formatPct(st.p75)} · Mean ${formatPct(st.mean)} (${st.count} stocks)`
      return (
        <td key={col.key} className={`num pct ${pctClass(val)}`} title={title}>
          {formatPct(val)}
        </td>
      )
    }
    if (col.period) {
      const st = row.stats[col.period]
      return (
        <td key={col.key} className={`num pct ${pctClass(val)}`} title={`${st.count} stocks with a ${col.period}M return`}>
          {formatPct(val)}
        </td>
      )
    }
    return <td key={col.key} className={`num pct ${pctClass(val)}`}>{formatPct(val)}</td>
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="title-block">
          <h1>Industry Momentum &amp; Breadth</h1>
          {data && (
            <span className="muted small">Data as of {new Date(data.generatedAt).toLocaleString()}</span>
          )}
        </div>
        <div className="topbar-actions">
          <button className="btn" onClick={refresh} disabled={loading}>
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
          <button
            className="btn icon-btn"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            aria-label="Toggle theme"
            title="Toggle light / dark mode"
          >
            {theme === 'dark' ? '☀️ Light' : '🌙 Dark'}
          </button>
        </div>
      </header>

      <div className="controls">
        <input
          className="search"
          type="text"
          placeholder="Search industry or sector…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {data && (
          <span className="muted small count">
            {sorted.length.toLocaleString()} industries · {data.eligibleStocks.toLocaleString()} stocks
            {data.minMarketCap
              ? ` (market cap ≥ ₹${Number(data.minMarketCap).toLocaleString('en-IN')} Cr)`
              : ' (all market caps)'}
            {data.excludedIndustries > 0 &&
              ` · ${data.excludedIndustries} industries hidden (fewer than ${data.minStocks} stocks)`}
          </span>
        )}
      </div>

      <div className="momentum-panel">
        <span className="filter-label">Period Score Blend</span>
        {BLEND_FIELDS.map(([k, label]) => (
          <label className="weight-input" key={k}>
            <span className="muted small">{label}</span>
            <input
              type="number"
              min={0}
              value={blend[k]}
              onChange={(e) => setBlend((prev) => ({ ...prev, [k]: e.target.value }))}
            />
            <span className="muted small">%</span>
          </label>
        ))}
        <span className="muted small momentum-note">{weightNote(blend, BLEND_KEYS, normalizedBlend)}</span>
        <button className="btn subtle" onClick={() => setBlend({ ...DEFAULT_BLEND })}>
          Reset
        </button>
      </div>

      <div className="momentum-panel">
        <span className="filter-label">Momentum Weights</span>
        {PERIODS.map((m) => (
          <label className="weight-input" key={m}>
            <span className="muted small">{m}M</span>
            <input
              type="number"
              min={0}
              value={periodWeights[m]}
              onChange={(e) => setPeriodWeights((prev) => ({ ...prev, [m]: e.target.value }))}
            />
            <span className="muted small">%</span>
          </label>
        ))}
        <span className="muted small momentum-note">{weightNote(periodWeights, PERIODS, normalizedPeriods)}</span>
        <button className="btn subtle" onClick={() => setPeriodWeights({ ...DEFAULT_PERIOD_WEIGHTS })}>
          Reset
        </button>
      </div>

      <p className="muted small industry-help">
        Returns are measured between periods ({PERIODS.map((m) => `${m}M: ${periodDescription(m).toLowerCase()}`).join(' · ')}).
        Stocks without a return for a period are left out of that period. Breadth is the share of stocks with a
        positive return. It is shown separately and is not part of the Momentum Score. Click an industry to see its
        stocks.
      </p>

      {error && <div className="banner error">Failed to load data: {error}</div>}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              {COLUMNS.map((col) => (
                <th
                  key={col.key}
                  onClick={() => toggleSort(col.key)}
                  title={col.title || (col.period ? periodDescription(col.period) : undefined)}
                >
                  <span className="th-inner">
                    {col.label}
                    {sort.key === col.key && (
                      <span className="sort-arrow">{sort.direction === 'asc' ? '▲' : '▼'}</span>
                    )}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && !data ? (
              <tr>
                <td colSpan={COLUMNS.length} className="empty-state">Loading…</td>
              </tr>
            ) : sorted.length === 0 ? (
              <tr>
                <td colSpan={COLUMNS.length} className="empty-state">
                  {data ? 'No industries match.' : 'No data.'}
                </td>
              </tr>
            ) : (
              sorted.map((row) => (
                <tr
                  key={`${row.sector}|${row.industry}`}
                  className={row.sector ? 'clickable-row' : undefined}
                  title={row.sector ? 'Open the stocks in this industry' : undefined}
                  onClick={() => {
                    // Same URL shape as the Sectors browse page's drill-down
                    // (encoded so names containing "/" stay one path segment).
                    if (!row.sector) return
                    navigate(`/sectors/${encodeURIComponent(row.sector)}/${encodeURIComponent(row.industry)}`)
                  }}
                >
                  {COLUMNS.map((col) => renderCell(row, col))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
