import { useEffect, useMemo, useState } from 'react'
import './App.css'

const COLUMNS = [
  { key: 'tradingsymbol', label: 'Symbol', type: 'text' },
  { key: 'name', label: 'Name', type: 'text' },
  { key: 'current_price', label: 'Current Price', type: 'price' },
  { key: 'price_1m', label: '1M Ago Price', type: 'price' },
  { key: 'price_3m', label: '3M Ago Price', type: 'price' },
  { key: 'price_6m', label: '6M Ago Price', type: 'price' },
  { key: 'return_1m', label: '1M Returns', type: 'pct' },
  { key: 'return_3m', label: '3M Returns', type: 'pct' },
  { key: 'return_6m', label: '6M Returns', type: 'pct' },
]

function formatPrice(v) {
  if (v === null || v === undefined) return '—'
  return Number(v).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function formatPct(v) {
  if (v === null || v === undefined) return '—'
  const n = Number(v)
  const sign = n > 0 ? '+' : ''
  return `${sign}${n.toFixed(2)}%`
}

function useTheme() {
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem('theme')
    if (saved) return saved
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  })

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('theme', theme)
  }, [theme])

  return [theme, setTheme]
}

const EMPTY_RANGE = { min: '', max: '' }
const PAGE_SIZE_OPTIONS = [25, 50, 100, 200]

export default function App() {
  const [theme, setTheme] = useTheme()
  const [stocks, setStocks] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [generatedAt, setGeneratedAt] = useState(null)

  const [search, setSearch] = useState('')
  const [showFilters, setShowFilters] = useState(false)
  const [ranges, setRanges] = useState({
    return_1m: { ...EMPTY_RANGE },
    return_3m: { ...EMPTY_RANGE },
    return_6m: { ...EMPTY_RANGE },
  })
  const [sort, setSort] = useState({ key: 'tradingsymbol', direction: 'asc' })
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(50)

  function loadStocks(forceRefresh = false) {
    setLoading(true)
    setError(null)
    fetch(forceRefresh ? '/api/stocks?refresh=1' : '/api/stocks')
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
  }, [])

  function refresh() {
    loadStocks(true)
  }

  function toggleSort(key) {
    setSort((prev) => {
      if (prev.key !== key) return { key, direction: 'desc' }
      return { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' }
    })
    setPage(1)
  }

  function updateRange(field, edge, value) {
    setRanges((prev) => ({ ...prev, [field]: { ...prev[field], [edge]: value } }))
    setPage(1)
  }

  function clearFilters() {
    setSearch('')
    setRanges({
      return_1m: { ...EMPTY_RANGE },
      return_3m: { ...EMPTY_RANGE },
      return_6m: { ...EMPTY_RANGE },
    })
    setPage(1)
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return stocks.filter((s) => {
      if (q && !s.tradingsymbol.toLowerCase().includes(q) && !(s.name || '').toLowerCase().includes(q)) {
        return false
      }
      for (const field of ['return_1m', 'return_3m', 'return_6m']) {
        const { min, max } = ranges[field]
        const val = s[field]
        if (min !== '' && (val === null || val < Number(min))) return false
        if (max !== '' && (val === null || val > Number(max))) return false
      }
      return true
    })
  }, [stocks, search, ranges])

  const sorted = useMemo(() => {
    const arr = [...filtered]
    const { key, direction } = sort
    arr.sort((a, b) => {
      const av = a[key]
      const bv = b[key]
      if (av === null || av === undefined) return 1
      if (bv === null || bv === undefined) return -1
      let cmp
      if (typeof av === 'string') {
        cmp = av.localeCompare(bv)
      } else {
        cmp = av - bv
      }
      return direction === 'asc' ? cmp : -cmp
    })
    return arr
  }, [filtered, sort])

  const filtersActive =
    search !== '' ||
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
          <h1>NSE Equities — Price Returns</h1>
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
        <button className="btn" onClick={() => setShowFilters((s) => !s)}>
          Filters {showFilters ? '▲' : '▼'}
        </button>
        {filtersActive && (
          <button className="btn subtle" onClick={clearFilters}>
            Clear filters
          </button>
        )}
        <span className="muted small count">{sorted.length.toLocaleString()} stocks</span>
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

      {showFilters && (
        <div className="filters-panel">
          {[
            ['return_1m', '1M Return %'],
            ['return_3m', '3M Return %'],
            ['return_6m', '6M Return %'],
          ].map(([field, label]) => (
            <div className="filter-row" key={field}>
              <span className="filter-label">{label}</span>
              <input
                type="number"
                placeholder="Min"
                value={ranges[field].min}
                onChange={(e) => updateRange(field, 'min', e.target.value)}
              />
              <span className="muted">to</span>
              <input
                type="number"
                placeholder="Max"
                value={ranges[field].max}
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
              {COLUMNS.map((col) => (
                <th
                  key={col.key}
                  onClick={() => toggleSort(col.key)}
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
                <td colSpan={COLUMNS.length} className="empty-state">
                  Loading…
                </td>
              </tr>
            ) : sorted.length === 0 ? (
              <tr>
                <td colSpan={COLUMNS.length} className="empty-state">
                  No stocks match your filters.
                </td>
              </tr>
            ) : (
              pageRows.map((s) => (
                <tr key={s.id}>
                  <td className="symbol-cell">{s.tradingsymbol}</td>
                  <td className="name-cell" title={s.name}>{s.name}</td>
                  <td className="num">{formatPrice(s.current_price)}</td>
                  <td className="num">{formatPrice(s.price_1m)}</td>
                  <td className="num">{formatPrice(s.price_3m)}</td>
                  <td className="num">{formatPrice(s.price_6m)}</td>
                  <td className={`num pct ${pctClass(s.return_1m)}`}>{formatPct(s.return_1m)}</td>
                  <td className={`num pct ${pctClass(s.return_3m)}`}>{formatPct(s.return_3m)}</td>
                  <td className={`num pct ${pctClass(s.return_6m)}`}>{formatPct(s.return_6m)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function pctClass(v) {
  if (v === null || v === undefined) return ''
  return Number(v) >= 0 ? 'positive' : 'negative'
}
