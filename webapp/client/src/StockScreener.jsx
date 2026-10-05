import { Fragment, useEffect, useMemo, useState } from 'react'
import { Tooltip } from 'react-tooltip'
import 'react-tooltip/dist/react-tooltip.css'
import './App.css'
import { useTheme } from './useTheme'

const MONTH_OPTIONS = Array.from({ length: 12 }, (_, i) => i + 1)
const DEFAULT_MONTHS = [1, 3, 6]
const DEFAULT_WEIGHTS = { 1: 20, 3: 30, 6: 50 }

const BASE_COLUMNS = [
  { key: 'tradingsymbol', label: 'Symbol', type: 'text', sticky: 'symbol' },
  { key: 'name', label: 'Name', type: 'text', sticky: 'name' },
  { key: 'sector', label: 'Sector', type: 'text' },
  { key: 'industry', label: 'Industry', type: 'text' },
  { key: 'market_cap_cr', label: 'Market Cap', type: 'marketcap' },
  { key: 'current_price', label: 'Current Price', type: 'price' },
]

const TAIL_COLUMNS = [
  { key: 'all_time_high', label: 'All Time High', type: 'price' },
  { key: 'diff_from_ath', label: 'Diff from ATH', type: 'pct' },
  { key: 'momentum_score', label: 'Momentum Score', type: 'pct' },
  { key: 'momentum_1m_back', label: '1M-back Momentum', type: 'pct', backref: 1 },
  { key: 'momentum_3m_back', label: '3M-back Momentum', type: 'pct', backref: 3 },
]

// Which "N ago from the pivot" fields feed each N-back momentum score, and
// the label for each one when the cell is expanded to show its breakdown.
const BACKREF_CONFIG = {
  1: { agoOffsets: [2, 4, 7], returnKeys: ['return_1back_2m', 'return_1back_4m', 'return_1back_7m'] },
  3: { agoOffsets: [4, 6, 9], returnKeys: ['return_3back_4m', 'return_3back_6m', 'return_3back_9m'] },
}
const BACKREF_AGO_LABELS = ['1M ago (from pivot)', '3M ago (from pivot)', '6M ago (from pivot)']

function getBackrefBreakdown(stock, pivot) {
  const { agoOffsets, returnKeys } = BACKREF_CONFIG[pivot]
  return {
    pivotDate: stock[`brefdate_${pivot}m`],
    pivotPrice: stock[`bref_${pivot}m`],
    rows: agoOffsets.map((offset, idx) => ({
      label: BACKREF_AGO_LABELS[idx],
      date: stock[`brefdate_${offset}m`],
      price: stock[`bref_${offset}m`],
      returnVal: stock[returnKeys[idx]],
    })),
  }
}

function buildColumns(months) {
  const priceCols = months.map((m) => ({ key: `price_${m}m`, label: `${m}M Ago Price`, type: 'price' }))
  const returnCols = months.map((m) => ({ key: `return_${m}m`, label: `${m}M Returns`, type: 'pct' }))
  return [...BASE_COLUMNS, ...priceCols, ...returnCols, ...TAIL_COLUMNS]
}

function loadStoredMonths() {
  try {
    const saved = JSON.parse(localStorage.getItem('selectedMonths'))
    if (Array.isArray(saved) && saved.length) {
      return [...new Set(saved.filter((m) => Number.isInteger(m) && m >= 1 && m <= 12))].sort((a, b) => a - b)
    }
  } catch {
    // ignore malformed storage
  }
  return [...DEFAULT_MONTHS]
}

function loadStoredHiddenColumns() {
  try {
    const saved = JSON.parse(localStorage.getItem('hiddenColumns'))
    if (Array.isArray(saved)) return new Set(saved)
  } catch {
    // ignore malformed storage
  }
  return new Set()
}

function formatPrice(v) {
  if (v === null || v === undefined) return '—'
  return Number(v).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function formatMarketCap(v) {
  if (v === null || v === undefined) return '—'
  const n = Number(v)
  if (n >= 100000) return `₹${(n / 100000).toLocaleString('en-IN', { maximumFractionDigits: 2 })} L Cr`
  return `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 0 })} Cr`
}

function formatPct(v) {
  if (v === null || v === undefined) return '—'
  const n = Number(v)
  const sign = n > 0 ? '+' : ''
  return `${sign}${n.toFixed(2)}%`
}

const EMPTY_RANGE = { min: '', max: '' }
const PAGE_SIZE_OPTIONS = [25, 50, 100, 200]

// When embedded from the Sectors browse page (fixedSector/fixedIndustry set),
// filtering happens server-side via query params instead of client-side --
// the whole point of drilling into one sector/industry is to avoid pulling
// the full ~3000-row, candle-joined dataset just to look at a handful of
// stocks.
export default function StockScreener({ fixedSector, fixedIndustry, onBack } = {}) {
  const [theme, setTheme] = useTheme()
  const [stocks, setStocks] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [generatedAt, setGeneratedAt] = useState(null)

  const [selectedMonths, setSelectedMonths] = useState(loadStoredMonths)
  const [hiddenColumns, setHiddenColumns] = useState(loadStoredHiddenColumns)
  const [search, setSearch] = useState('')
  const [showFilters, setShowFilters] = useState(false)
  const [showColumns, setShowColumns] = useState(false)
  const [ranges, setRanges] = useState({
    market_cap_cr: { ...EMPTY_RANGE },
    diff_from_ath: { ...EMPTY_RANGE },
    momentum_score: { ...EMPTY_RANGE },
  })
  const [sectorFilter, setSectorFilter] = useState('')
  const [industryFilter, setIndustryFilter] = useState('')
  const [weights, setWeights] = useState(DEFAULT_WEIGHTS)
  const [sort, setSort] = useState({ key: 'tradingsymbol', direction: 'asc' })
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(50)

  const COLUMNS = useMemo(() => buildColumns(selectedMonths), [selectedMonths])

  // Symbol/Name stay visible always -- they're the sticky identity columns,
  // hiding them would leave rows unreadable while scrolling.
  const visibleColumns = useMemo(
    () => COLUMNS.filter((c) => c.sticky || !hiddenColumns.has(c.key)),
    [COLUMNS, hiddenColumns]
  )

  function loadStocks(forceRefresh = false) {
    setLoading(true)
    setError(null)
    const params = new URLSearchParams({ months: selectedMonths.join(',') })
    if (forceRefresh) params.set('refresh', '1')
    if (fixedSector) params.set('sector', fixedSector)
    if (fixedIndustry) params.set('industry', fixedIndustry)
    fetch(`/api/stocks?${params.toString()}`)
      .then((r) => {
        if (!r.ok) throw new Error(`Request failed: ${r.status}`)
        return r.json()
      })
      .then((data) => {
        setStocks(data.stocks)
        setGeneratedAt(data.generatedAt)
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    loadStocks()
  }, [selectedMonths, fixedSector, fixedIndustry])

  useEffect(() => {
    localStorage.setItem('selectedMonths', JSON.stringify(selectedMonths))
  }, [selectedMonths])

  useEffect(() => {
    localStorage.setItem('hiddenColumns', JSON.stringify([...hiddenColumns]))
  }, [hiddenColumns])

  // If the column currently sorted on gets removed (e.g. unchecking a month)
  // or hidden, fall back to sorting by symbol instead of sorting by a column
  // that no longer renders.
  useEffect(() => {
    if (!visibleColumns.some((c) => c.key === sort.key)) {
      setSort({ key: 'tradingsymbol', direction: 'asc' })
    }
  }, [visibleColumns, sort.key])

  function refresh() {
    loadStocks(true)
  }

  function toggleMonth(m) {
    setSelectedMonths((prev) => {
      const next = prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m]
      return next.length ? [...next].sort((a, b) => a - b) : prev
    })
    // New months start at 0% weight so enabling one never silently changes an
    // existing momentum ranking until the user explicitly assigns it weight.
    setWeights((prev) => {
      if (m in prev) return prev
      return { ...prev, [m]: 0 }
    })
    setPage(1)
  }

  function toggleColumn(key) {
    setHiddenColumns((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function toggleSort(key) {
    setSort((prev) => {
      if (prev.key !== key) return { key, direction: 'desc' }
      return { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' }
    })
    setPage(1)
  }

  function updateRange(field, edge, value) {
    setRanges((prev) => ({ ...prev, [field]: { ...(prev[field] || EMPTY_RANGE), [edge]: value } }))
    setPage(1)
  }

  function updateWeight(field, value) {
    setWeights((prev) => ({ ...prev, [field]: value }))
  }

  function clearFilters() {
    setSearch('')
    setRanges({
      market_cap_cr: { ...EMPTY_RANGE },
      diff_from_ath: { ...EMPTY_RANGE },
      momentum_score: { ...EMPTY_RANGE },
    })
    setSectorFilter('')
    setIndustryFilter('')
    setPage(1)
  }

  // Raw weight inputs don't have to sum to 100 -- normalize proportionally so
  // the momentum score always uses weights that do, per the "auto-normalize"
  // requirement (e.g. 1/1/1 behaves the same as 33.3/33.3/33.3). Normalizes
  // over whichever months are currently selected (default 1/3/6; any extra
  // month the user checks starts at 0% until they assign it weight).
  const normalizedWeights = useMemo(() => {
    const raw = {}
    let sum = 0
    for (const m of selectedMonths) {
      const v = Number(weights[m]) || 0
      raw[m] = v
      sum += v
    }
    const normalized = {}
    for (const m of selectedMonths) {
      normalized[m] = sum > 0 ? (raw[m] / sum) * 100 : 0
    }
    return normalized
  }, [weights, selectedMonths])

  const rawWeightSum = selectedMonths.reduce((acc, m) => acc + (Number(weights[m]) || 0), 0)

  // The 1M-back/3M-back momentum scores are independent of the Time Periods
  // checkboxes (their backing data is always fetched -- see BACKREF_CONFIG),
  // so they normalize the 1M/3M/6M weight *values* directly rather than via
  // normalizedWeights, which only covers whatever months are currently
  // selected. weights[1]/[3]/[6] persist even if those months get unchecked
  // (toggleMonth never deletes weight entries), so this stays reliable.
  const backrefWeights = useMemo(() => {
    const raw = { 1: Number(weights[1]) || 0, 3: Number(weights[3]) || 0, 6: Number(weights[6]) || 0 }
    const sum = raw[1] + raw[3] + raw[6]
    if (sum <= 0) return { 1: 0, 3: 0, 6: 0 }
    return { 1: (raw[1] / sum) * 100, 3: (raw[3] / sum) * 100, 6: (raw[6] / sum) * 100 }
  }, [weights])

  const stocksWithMomentum = useMemo(() => {
    return stocks.map((s) => {
      let momentum_score = null
      const hasAll = selectedMonths.every((m) => s[`return_${m}m`] !== null && s[`return_${m}m`] !== undefined)
      if (hasAll) {
        momentum_score = selectedMonths.reduce(
          (acc, m) => acc + (normalizedWeights[m] / 100) * Number(s[`return_${m}m`]),
          0
        )
      }

      let momentum_1m_back = null
      if (
        s.return_1back_2m !== null && s.return_1back_2m !== undefined &&
        s.return_1back_4m !== null && s.return_1back_4m !== undefined &&
        s.return_1back_7m !== null && s.return_1back_7m !== undefined
      ) {
        momentum_1m_back =
          (backrefWeights[1] / 100) * Number(s.return_1back_2m) +
          (backrefWeights[3] / 100) * Number(s.return_1back_4m) +
          (backrefWeights[6] / 100) * Number(s.return_1back_7m)
      }

      let momentum_3m_back = null
      if (
        s.return_3back_4m !== null && s.return_3back_4m !== undefined &&
        s.return_3back_6m !== null && s.return_3back_6m !== undefined &&
        s.return_3back_9m !== null && s.return_3back_9m !== undefined
      ) {
        momentum_3m_back =
          (backrefWeights[1] / 100) * Number(s.return_3back_4m) +
          (backrefWeights[3] / 100) * Number(s.return_3back_6m) +
          (backrefWeights[6] / 100) * Number(s.return_3back_9m)
      }

      return { ...s, momentum_score, momentum_1m_back, momentum_3m_back }
    })
  }, [stocks, normalizedWeights, selectedMonths, backrefWeights])

  // Lookup used by the react-tooltip render callback to find the full stock
  // object for whichever row is currently hovered (its dataset can only
  // carry the id as a string, not the object itself).
  const stockById = useMemo(() => {
    const map = {}
    for (const s of stocksWithMomentum) map[s.id] = s
    return map
  }, [stocksWithMomentum])

  const filterFields = useMemo(
    () => ['market_cap_cr', ...selectedMonths.map((m) => `return_${m}m`), 'diff_from_ath', 'momentum_score'],
    [selectedMonths]
  )

  // Only relevant on the main (non-embedded) Stocks tab -- when embedded from
  // the Sectors browse page the sector/industry is already fixed server-side.
  const sectorOptions = useMemo(() => {
    if (fixedSector) return []
    return [...new Set(stocks.map((s) => s.sector).filter(Boolean))].sort()
  }, [stocks, fixedSector])

  const industryOptions = useMemo(() => {
    if (fixedSector) return []
    const pool = sectorFilter ? stocks.filter((s) => s.sector === sectorFilter) : stocks
    return [...new Set(pool.map((s) => s.industry).filter(Boolean))].sort()
  }, [stocks, sectorFilter, fixedSector])

  function updateSectorFilter(value) {
    setSectorFilter(value)
    setIndustryFilter('') // industry options depend on sector; a stale pick from another sector would just filter everything out
    setPage(1)
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return stocksWithMomentum.filter((s) => {
      if (q && !s.tradingsymbol.toLowerCase().includes(q) && !(s.name || '').toLowerCase().includes(q)) {
        return false
      }
      if (!fixedSector && sectorFilter && s.sector !== sectorFilter) return false
      if (!fixedSector && industryFilter && s.industry !== industryFilter) return false
      for (const field of filterFields) {
        const { min, max } = ranges[field] || EMPTY_RANGE
        const val = s[field]
        if (min !== '' && (val === null || val < Number(min))) return false
        if (max !== '' && (val === null || val > Number(max))) return false
      }
      return true
    })
  }, [stocksWithMomentum, search, ranges, filterFields, sectorFilter, industryFilter, fixedSector])

  const sorted = useMemo(() => {
    const arr = [...filtered]
    const { key, direction } = sort
    // MySQL DECIMAL columns can come back as numeric strings (e.g. "9.96"),
    // where naive string comparison sorts wrong ("90.16" < "9.96" alphabetically
    // in some cases). Columns marked 'price'/'pct' in COLUMNS are always
    // compared numerically regardless of the runtime type of the value.
    const column = COLUMNS.find((c) => c.key === key)
    const isNumericColumn = column && (column.type === 'price' || column.type === 'pct' || column.type === 'marketcap')

    arr.sort((a, b) => {
      const av = a[key]
      const bv = b[key]
      if (av === null || av === undefined) return 1
      if (bv === null || bv === undefined) return -1
      let cmp
      if (isNumericColumn) {
        cmp = Number(av) - Number(bv)
      } else if (typeof av === 'string') {
        cmp = av.localeCompare(bv)
      } else {
        cmp = av - bv
      }
      return direction === 'asc' ? cmp : -cmp
    })
    return arr
  }, [filtered, sort, COLUMNS])

  const filtersActive =
    search !== '' ||
    sectorFilter !== '' ||
    industryFilter !== '' ||
    Object.values(ranges).some((r) => r.min !== '' || r.max !== '')

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize))
  const currentPage = Math.min(page, totalPages)
  const pageRows = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return sorted.slice(start, start + pageSize)
  }, [sorted, currentPage, pageSize])

  return (
    <div className="app">
      <header className="topbar">
        <div className="title-block">
          {onBack ? (
            <>
              <button className="btn subtle" onClick={onBack}>‹ Back to Sectors</button>
              <h1>{fixedSector}{fixedIndustry ? ` › ${fixedIndustry}` : ''}</h1>
            </>
          ) : (
            <h1>NSE Equities — Price Returns</h1>
          )}
          {generatedAt && (
            <span className="muted small">
              Data as of {new Date(generatedAt).toLocaleString()}
            </span>
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
          placeholder="Search symbol or company name…"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value)
            setPage(1)
          }}
        />
        {!fixedSector && (
          <>
            <select value={sectorFilter} onChange={(e) => updateSectorFilter(e.target.value)}>
              <option value="">All Sectors</option>
              {sectorOptions.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            <select
              value={industryFilter}
              onChange={(e) => { setIndustryFilter(e.target.value); setPage(1) }}
            >
              <option value="">All Industries</option>
              {industryOptions.map((i) => (
                <option key={i} value={i}>{i}</option>
              ))}
            </select>
          </>
        )}
        <button className="btn" onClick={() => setShowFilters((s) => !s)}>
          Filters {showFilters ? '▲' : '▼'}
        </button>
        {filtersActive && (
          <button className="btn subtle" onClick={clearFilters}>
            Clear filters
          </button>
        )}
        <button className="btn" onClick={() => setShowColumns((s) => !s)}>
          Columns {showColumns ? '▲' : '▼'}
        </button>
        {hiddenColumns.size > 0 && (
          <button className="btn subtle" onClick={() => setHiddenColumns(new Set())}>
            Show all columns
          </button>
        )}
        <span className="muted small count">{sorted.length.toLocaleString()} stocks</span>
      </div>

      {showColumns && (
        <div className="columns-panel">
          {COLUMNS.filter((c) => !c.sticky).map((c) => (
            <label className="column-check" key={c.key}>
              <input
                type="checkbox"
                checked={!hiddenColumns.has(c.key)}
                onChange={() => toggleColumn(c.key)}
              />
              <span className="muted small">{c.label}</span>
            </label>
          ))}
        </div>
      )}

      <div className="months-panel">
        <span className="filter-label">Time Periods</span>
        {MONTH_OPTIONS.map((m) => (
          <label className="month-check" key={m}>
            <input
              type="checkbox"
              checked={selectedMonths.includes(m)}
              onChange={() => toggleMonth(m)}
            />
            <span className="muted small">{m}M</span>
          </label>
        ))}
      </div>

      <div className="pagination">
        <span className="muted small">
          Showing {sorted.length === 0 ? 0 : (currentPage - 1) * pageSize + 1}–
          {Math.min(currentPage * pageSize, sorted.length)} of {sorted.length.toLocaleString()}
        </span>
        <div className="pagination-controls">
          <label className="muted small page-size-label">
            Rows per page{' '}
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value))
                setPage(1)
              }}
            >
              {PAGE_SIZE_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <button className="btn" onClick={() => setPage(1)} disabled={currentPage === 1}>
            «
          </button>
          <button className="btn" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={currentPage === 1}>
            ‹ Prev
          </button>
          <span className="muted small page-indicator">
            Page {currentPage} of {totalPages}
          </span>
          <button
            className="btn"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={currentPage === totalPages}
          >
            Next ›
          </button>
          <button className="btn" onClick={() => setPage(totalPages)} disabled={currentPage === totalPages}>
            »
          </button>
        </div>
      </div>

      <div className="momentum-panel">
        <span className="filter-label">Momentum Weights</span>
        {selectedMonths.map((m) => (
          <label className="weight-input" key={m}>
            <span className="muted small">{m}M</span>
            <input
              type="number"
              value={weights[m] ?? 0}
              onChange={(e) => updateWeight(m, e.target.value)}
            />
            <span className="muted small">%</span>
          </label>
        ))}
        <span className="muted small momentum-note">
          {rawWeightSum === 100
            ? 'Sums to 100%'
            : `Sums to ${rawWeightSum.toFixed(0)}% — auto-normalized to ` +
              selectedMonths.map((m) => `${normalizedWeights[m].toFixed(0)}%`).join('/')}
        </span>
        <button
          className="btn subtle"
          onClick={() =>
            setWeights(
              selectedMonths.reduce((acc, m) => ({ ...acc, [m]: DEFAULT_WEIGHTS[m] ?? 0 }), {})
            )
          }
        >
          Reset
        </button>
      </div>

      {showFilters && (
        <div className="filters-panel">
          {[
            ['market_cap_cr', 'Market Cap (₹ Cr)'],
            ...selectedMonths.map((m) => [`return_${m}m`, `${m}M Return %`]),
            ['diff_from_ath', 'Diff from ATH %'],
            ['momentum_score', 'Momentum Score'],
          ].map(([field, label]) => (
            <div className="filter-row" key={field}>
              <span className="filter-label">{label}</span>
              <input
                type="number"
                placeholder="Min"
                value={(ranges[field] || EMPTY_RANGE).min}
                onChange={(e) => updateRange(field, 'min', e.target.value)}
              />
              <span className="muted">to</span>
              <input
                type="number"
                placeholder="Max"
                value={(ranges[field] || EMPTY_RANGE).max}
                onChange={(e) => updateRange(field, 'max', e.target.value)}
              />
            </div>
          ))}
        </div>
      )}

      {error && <div className="banner error">Failed to load data: {error}</div>}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              {visibleColumns.map((col) => (
                <th
                  key={col.key}
                  onClick={() => toggleSort(col.key)}
                  className={col.sticky ? `sticky-${col.sticky}` : ''}
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
            {loading && stocks.length === 0 ? (
              <tr>
                <td colSpan={visibleColumns.length} className="empty-state">
                  Loading…
                </td>
              </tr>
            ) : sorted.length === 0 ? (
              <tr>
                <td colSpan={visibleColumns.length} className="empty-state">
                  No stocks match your filters.
                </td>
              </tr>
            ) : (
              pageRows.map((s) => (
                <tr key={s.id}>
                  {visibleColumns.map((col) => {
                    const val = s[col.key]
                    if (col.key === 'tradingsymbol') {
                      return <td key={col.key} className="symbol-cell sticky-symbol">{val}</td>
                    }
                    if (col.key === 'name') {
                      return <td key={col.key} className="name-cell sticky-name" title={val}>{val}</td>
                    }
                    if (col.type === 'marketcap') {
                      return (
                        <td
                          key={col.key}
                          className="num"
                          title={s.market_cap_updated_at ? `As of ${new Date(s.market_cap_updated_at).toLocaleDateString()}` : undefined}
                        >
                          {formatMarketCap(val)}
                        </td>
                      )
                    }
                    if (col.key === 'all_time_high') {
                      return (
                        <td key={col.key} className="num" title={s.ath_date ? `As of ${new Date(s.ath_date).toLocaleDateString()}` : undefined}>
                          {formatPrice(val)}
                        </td>
                      )
                    }
                    if (col.backref) {
                      return (
                        <td
                          key={col.key}
                          className={`num pct expandable ${pctClass(val)}`}
                          data-tooltip-id="backref-tooltip"
                          data-stock-id={s.id}
                          data-pivot={col.backref}
                          data-label={col.label}
                        >
                          {formatPct(val)} <span className="expand-arrow">▸</span>
                        </td>
                      )
                    }
                    if (col.type === 'price') {
                      return <td key={col.key} className="num">{formatPrice(val)}</td>
                    }
                    if (col.type === 'pct') {
                      return <td key={col.key} className={`num pct ${pctClass(val)}`}>{formatPct(val)}</td>
                    }
                    if (col.type === 'text') {
                      return <td key={col.key}>{val || '—'}</td>
                    }
                    return <td key={col.key} className="num">{val}</td>
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Tooltip
        id="backref-tooltip"
        className="backref-tooltip"
        place="bottom"
        opacity={1}
        delayHide={100}
        render={({ activeAnchor }) => {
          if (!activeAnchor) return null
          const { stockId, pivot, label } = activeAnchor.dataset
          const stock = stockById[stockId]
          if (!stock) return null
          return <BackrefBreakdown stock={stock} pivot={Number(pivot)} label={label} />
        }}
      />
    </div>
  )
}

function pctClass(v) {
  if (v === null || v === undefined) return ''
  return Number(v) >= 0 ? 'positive' : 'negative'
}

function formatDate(v) {
  if (!v) return '—'
  return new Date(v).toLocaleDateString()
}

function BackrefBreakdown({ stock, pivot, label }) {
  const { pivotDate, pivotPrice, rows } = getBackrefBreakdown(stock, pivot)
  return (
    <div className="backref-breakdown">
      <div className="backref-pivot">
        <strong>{label}</strong> — pivot: {formatDate(pivotDate)} @ {formatPrice(pivotPrice)}
      </div>
      {/* CSS grid, not a <table> -- table-layout kept computing an
          unconstrained ~900px intrinsic width regardless of any CSS
          override (even a forced inline !important width had no effect),
          clipping the Price/Return columns. Grid columns are deterministic. */}
      <div className="backref-grid">
        <div className="backref-grid-header">Period</div>
        <div className="backref-grid-header">Date</div>
        <div className="backref-grid-header num">Price</div>
        <div className="backref-grid-header num">Return</div>
        {rows.map((r) => (
          <Fragment key={r.label}>
            <div>{r.label}</div>
            <div>{formatDate(r.date)}</div>
            <div className="num">{formatPrice(r.price)}</div>
            <div className={`num pct ${pctClass(r.returnVal)}`}>{formatPct(r.returnVal)}</div>
          </Fragment>
        ))}
      </div>
    </div>
  )
}
