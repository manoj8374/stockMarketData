import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  BackLink,
  DivergingBar,
  Drawer,
  FloatingPanel,
  HeatPct,
  Icon,
  MiniBar,
  Pagination,
  Segmented,
  Skeleton,
  SortTh,
  Stat,
  StatSkeleton,
  StateBlock,
  WeightBar,
  WeightRow,
} from './ui'
import {
  formatDate,
  formatMarketCap,
  formatMonthYear,
  formatPct,
  formatPrice,
  industryPath,
  isNum,
  loadJSON,
  median,
  saveJSON,
  tone,
} from './format'
import { usePageMeta, useRefreshSignal } from './shell'

const MONTH_OPTIONS = Array.from({ length: 12 }, (_, i) => i + 1)
const DEFAULT_MONTHS = [1, 3, 6]
const DEFAULT_WEIGHTS = { 1: 20, 3: 30, 6: 50 }
const GROUP_LABELS = { prices: 'Price history', returns: 'Returns', ath: 'All-time high', mom: 'Momentum' }
const TEXT_TYPES = new Set(['text', 'stock'])
const HIDDEN_COLUMNS_KEY = 'screenerHiddenColumns'
const DENSITY_KEY = 'screenerDensity'
// Price-history columns start hidden; the Columns menu brings them back.
const DEFAULT_HIDDEN = MONTH_OPTIONS.map((m) => `price_${m}m`)

const BASE_COLUMNS = [
  { key: 'tradingsymbol', label: 'Stock', type: 'stock', group: '', sticky: true },
  { key: 'sector', label: 'Sector', type: 'text', group: '' },
  { key: 'industry', label: 'Industry', type: 'text', group: '' },
  { key: 'market_cap_cr', label: 'Mkt cap', type: 'marketcap', group: '' },
  { key: 'current_price', label: 'Price', type: 'price', group: '' },
]

const TAIL_COLUMNS = [
  { key: 'all_time_high', label: 'ATH', type: 'price', group: 'ath', title: 'All-time high close' },
  { key: 'diff_from_ath', label: 'From ATH', type: 'ath', group: 'ath', title: 'Distance below the all-time high' },
  { key: 'momentum_score', label: 'Score', type: 'momentum', group: 'mom', title: 'Weighted blend of the return periods' },
  {
    key: 'momentum_1m_back',
    label: '1M back',
    type: 'backref',
    backref: 1,
    group: 'mom',
    title: 'The 1M / 3M / 6M score as it stood 1 month ago. Click a value for the breakdown.',
  },
  {
    key: 'momentum_3m_back',
    label: '3M back',
    type: 'backref',
    backref: 3,
    group: 'mom',
    title: 'The 1M / 3M / 6M score as it stood 3 months ago. Click a value for the breakdown.',
  },
]

// Which "N ago from the pivot" fields feed each N-back momentum score.
const BACKREF_CONFIG = {
  1: { agoOffsets: [2, 4, 7], returnKeys: ['return_1back_2m', 'return_1back_4m', 'return_1back_7m'] },
  3: { agoOffsets: [4, 6, 9], returnKeys: ['return_3back_4m', 'return_3back_6m', 'return_3back_9m'] },
}
const BACKREF_AGO_LABELS = ['1M before pivot', '3M before pivot', '6M before pivot']
// Every price offset the API always returns (bref_Xm), used for the quick-look chart.
const BREF_OFFSETS = [1, 2, 3, 4, 6, 7, 9]

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
  const priceCols = months.map((m) => ({
    key: `price_${m}m`,
    label: `${m}M ago`,
    type: 'price',
    group: 'prices',
    title: `Closing price ${m} month${m > 1 ? 's' : ''} ago`,
  }))
  const returnCols = months.map((m, i) => ({
    key: `return_${m}m`,
    label: `${m}M`,
    type: 'pct',
    group: 'returns',
    title: i === 0 ? `Return from ${m}M ago to today` : `Return from ${m}M ago to ${months[i - 1]}M ago`,
  }))
  return [...BASE_COLUMNS, ...priceCols, ...returnCols, ...TAIL_COLUMNS]
}

function loadStoredMonths() {
  const saved = loadJSON('selectedMonths', null)
  if (Array.isArray(saved) && saved.length) {
    const valid = [...new Set(saved.filter((m) => Number.isInteger(m) && m >= 1 && m <= 12))].sort((a, b) => a - b)
    if (valid.length) return valid
  }
  return [...DEFAULT_MONTHS]
}

// First visit after the redesign: carry over anything hidden under the old
// key, plus the new default of hiding the price-history columns.
function loadStoredHiddenColumns() {
  const saved = loadJSON(HIDDEN_COLUMNS_KEY, null)
  if (Array.isArray(saved)) return new Set(saved)
  const legacy = loadJSON('hiddenColumns', [])
  return new Set([...(Array.isArray(legacy) ? legacy : []), ...DEFAULT_HIDDEN])
}

const EMPTY_RANGE = { min: '', max: '' }
const EMPTY_RANGES = () => ({
  market_cap_cr: { ...EMPTY_RANGE },
  diff_from_ath: { ...EMPTY_RANGE },
  momentum_score: { ...EMPTY_RANGE },
})
const PAGE_SIZE_OPTIONS = [25, 50, 100, 200]
const MARKET_CAP_PRESETS = [
  ['≥ ₹1 L Cr', '100000', ''],
  ['₹20k – 1 L Cr', '20000', '100000'],
  ['₹5k – 20k Cr', '5000', '20000'],
  ['Under ₹5k Cr', '', '5000'],
]

function hasRange(r) {
  return Boolean(r) && (r.min !== '' || r.max !== '')
}

// When embedded from the Sectors browse page (fixedSector/fixedIndustry set),
// filtering happens server-side via query params instead of client-side --
// the whole point of drilling into one sector/industry is to avoid pulling
// the full ~3000-row, candle-joined dataset just to look at a handful of
// stocks.
export default function StockScreener({ fixedSector, fixedIndustry, onBack, headerExtra, minMarketCap = 0 } = {}) {
  const navigate = useNavigate()
  const [stocks, setStocks] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [generatedAt, setGeneratedAt] = useState(null)
  const requestId = useRef(0)

  const [selectedMonths, setSelectedMonths] = useState(loadStoredMonths)
  const [hiddenColumns, setHiddenColumns] = useState(loadStoredHiddenColumns)
  const [search, setSearch] = useState('')
  const [ranges, setRanges] = useState(EMPTY_RANGES)
  const [sectorFilter, setSectorFilter] = useState('')
  const [industryFilter, setIndustryFilter] = useState('')
  const [weights, setWeights] = useState(DEFAULT_WEIGHTS)
  const [sort, setSort] = useState({ key: 'momentum_score', direction: 'desc' })
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(50)
  const [density, setDensity] = useState(() => (loadJSON(DENSITY_KEY, 'cozy') === 'compact' ? 'compact' : 'cozy'))

  const [scoringOpen, setScoringOpen] = useState(false)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [columnsAnchor, setColumnsAnchor] = useState(null)
  const [backref, setBackref] = useState(null) // { id, pivot, anchor }
  const [quickId, setQuickId] = useState(null)

  const COLUMNS = useMemo(() => buildColumns(selectedMonths), [selectedMonths])
  const embedded = Boolean(fixedSector)

  // Stock is the sticky identity column and always shows. On a drill-down
  // page every row shares one sector/industry, so those columns are dropped.
  const visibleColumns = useMemo(
    () =>
      COLUMNS.filter((c) => {
        if (embedded && (c.key === 'sector' || c.key === 'industry')) return false
        return c.sticky || !hiddenColumns.has(c.key)
      }),
    [COLUMNS, hiddenColumns, embedded]
  )

  function loadStocks(forceRefresh = false) {
    const id = ++requestId.current
    setLoading(true)
    setError(null)
    const params = new URLSearchParams({ months: selectedMonths.join(','), minMarketCap: String(minMarketCap) })
    if (forceRefresh) params.set('refresh', '1')
    if (fixedSector) params.set('sector', fixedSector)
    if (fixedIndustry) params.set('industry', fixedIndustry)
    fetch(`/api/stocks?${params.toString()}`)
      .then((r) => {
        if (!r.ok) throw new Error(`Request failed: ${r.status}`)
        return r.json()
      })
      .then((data) => {
        if (id !== requestId.current) return
        setStocks(data.stocks)
        setGeneratedAt(data.generatedAt)
      })
      .catch((e) => {
        if (id === requestId.current) setError(e.message)
      })
      .finally(() => {
        if (id === requestId.current) setLoading(false)
      })
  }

  useEffect(() => {
    loadStocks()
    // Reload only when the request inputs change; loadStocks itself is recreated every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMonths, fixedSector, fixedIndustry, minMarketCap])

  useRefreshSignal(() => loadStocks(true))
  usePageMeta(generatedAt, loading)

  useEffect(() => {
    saveJSON('selectedMonths', selectedMonths)
  }, [selectedMonths])

  useEffect(() => {
    saveJSON(HIDDEN_COLUMNS_KEY, [...hiddenColumns])
  }, [hiddenColumns])

  useEffect(() => {
    saveJSON(DENSITY_KEY, density)
  }, [density])

  // If the column currently sorted on gets removed (e.g. unchecking a month)
  // or hidden, fall back to sorting by symbol instead of sorting by a column
  // that no longer renders.
  useEffect(() => {
    if (!visibleColumns.some((c) => c.key === sort.key)) {
      setSort({ key: 'tradingsymbol', direction: 'asc' })
    }
  }, [visibleColumns, sort.key])

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
    const column = COLUMNS.find((c) => c.key === key)
    const firstDirection = column && TEXT_TYPES.has(column.type) ? 'asc' : 'desc'
    setSort((prev) => {
      if (prev.key !== key) return { key, direction: firstDirection }
      return { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' }
    })
    setPage(1)
  }

  function updateRange(field, edge, value) {
    setRanges((prev) => ({ ...prev, [field]: { ...(prev[field] || EMPTY_RANGE), [edge]: value } }))
    setPage(1)
  }

  function setRange(field, range) {
    setRanges((prev) => ({ ...prev, [field]: range }))
    setPage(1)
  }

  function updateWeight(field, value) {
    setWeights((prev) => ({ ...prev, [field]: value }))
  }

  function resetWeights() {
    setWeights((prev) => ({ ...prev, ...selectedMonths.reduce((acc, m) => ({ ...acc, [m]: DEFAULT_WEIGHTS[m] ?? 0 }), {}) }))
  }

  function clearRanges() {
    setRanges(EMPTY_RANGES())
    setPage(1)
  }

  function clearFilters() {
    setSearch('')
    setRanges(EMPTY_RANGES())
    setSectorFilter('')
    setIndustryFilter('')
    setPage(1)
  }

  // Raw weight inputs don't have to sum to 100 -- normalize proportionally so
  // the momentum score always uses weights that do (e.g. 1/1/1 behaves the
  // same as 33.3/33.3/33.3). Normalizes over whichever months are currently
  // selected (default 1/3/6; any extra month the user checks starts at 0%
  // until they assign it weight).
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

  // The 1M-back/3M-back momentum scores are independent of the selected
  // periods (their backing data is always fetched -- see BACKREF_CONFIG), so
  // they normalize the 1M/3M/6M weight *values* directly rather than via
  // normalizedWeights. weights[1]/[3]/[6] persist even if those months get
  // unchecked (toggleMonth never deletes weight entries), so this stays reliable.
  const backrefWeights = useMemo(() => {
    const raw = { 1: Number(weights[1]) || 0, 3: Number(weights[3]) || 0, 6: Number(weights[6]) || 0 }
    const sum = raw[1] + raw[3] + raw[6]
    if (sum <= 0) return { 1: 0, 3: 0, 6: 0 }
    return { 1: (raw[1] / sum) * 100, 3: (raw[3] / sum) * 100, 6: (raw[6] / sum) * 100 }
  }, [weights])

  const stocksWithMomentum = useMemo(() => {
    const present = (v) => v !== null && v !== undefined
    return stocks.map((s) => {
      let momentum_score = null
      const hasAll = selectedMonths.every((m) => present(s[`return_${m}m`]))
      if (hasAll) {
        momentum_score = selectedMonths.reduce(
          (acc, m) => acc + (normalizedWeights[m] / 100) * Number(s[`return_${m}m`]),
          0
        )
      }

      let momentum_1m_back = null
      if (present(s.return_1back_2m) && present(s.return_1back_4m) && present(s.return_1back_7m)) {
        momentum_1m_back =
          (backrefWeights[1] / 100) * Number(s.return_1back_2m) +
          (backrefWeights[3] / 100) * Number(s.return_1back_4m) +
          (backrefWeights[6] / 100) * Number(s.return_1back_7m)
      }

      let momentum_3m_back = null
      if (present(s.return_3back_4m) && present(s.return_3back_6m) && present(s.return_3back_9m)) {
        momentum_3m_back =
          (backrefWeights[1] / 100) * Number(s.return_3back_4m) +
          (backrefWeights[3] / 100) * Number(s.return_3back_6m) +
          (backrefWeights[6] / 100) * Number(s.return_3back_9m)
      }

      return { ...s, momentum_score, momentum_1m_back, momentum_3m_back }
    })
  }, [stocks, normalizedWeights, selectedMonths, backrefWeights])

  const stockById = useMemo(() => {
    const map = new Map()
    for (const s of stocksWithMomentum) map.set(s.id, s)
    return map
  }, [stocksWithMomentum])

  const filterFields = useMemo(
    () => [
      ['market_cap_cr', 'Market cap', '₹ Cr'],
      ...selectedMonths.map((m) => [`return_${m}m`, `${m}M return`, '%']),
      ['diff_from_ath', 'Distance from ATH', '%'],
      ['momentum_score', 'Momentum score', '%'],
    ],
    [selectedMonths]
  )

  // Only relevant on the main (non-embedded) screener -- when embedded from
  // the Sectors browse page the sector/industry is already fixed server-side.
  const sectorOptions = useMemo(() => {
    if (embedded) return []
    return [...new Set(stocks.map((s) => s.sector).filter(Boolean))].sort()
  }, [stocks, embedded])

  const industryOptions = useMemo(() => {
    if (embedded) return []
    const pool = sectorFilter ? stocks.filter((s) => s.sector === sectorFilter) : stocks
    return [...new Set(pool.map((s) => s.industry).filter(Boolean))].sort()
  }, [stocks, sectorFilter, embedded])

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
      if (!embedded && sectorFilter && s.sector !== sectorFilter) return false
      if (!embedded && industryFilter && s.industry !== industryFilter) return false
      for (const [field] of filterFields) {
        const { min, max } = ranges[field] || EMPTY_RANGE
        const val = s[field]
        const missing = val === null || val === undefined
        if (min !== '' && (missing || Number(val) < Number(min))) return false
        if (max !== '' && (missing || Number(val) > Number(max))) return false
      }
      return true
    })
  }, [stocksWithMomentum, search, ranges, filterFields, sectorFilter, industryFilter, embedded])

  const sorted = useMemo(() => {
    const arr = [...filtered]
    const { key, direction } = sort
    // MySQL DECIMAL columns can come back as numeric strings, where naive
    // string comparison sorts wrong, so every non-text column is always
    // compared numerically regardless of the runtime type of the value.
    const column = COLUMNS.find((c) => c.key === key)
    const isText = column && TEXT_TYPES.has(column.type)
    arr.sort((a, b) => {
      const av = a[key]
      const bv = b[key]
      if (av === null || av === undefined) return 1
      if (bv === null || bv === undefined) return -1
      const cmp = isText ? String(av).localeCompare(String(bv)) : Number(av) - Number(bv)
      return direction === 'asc' ? cmp : -cmp
    })
    return arr
  }, [filtered, sort, COLUMNS])

  const activeRangeCount = filterFields.filter(([f]) => hasRange(ranges[f])).length
  const filtersActive = search !== '' || sectorFilter !== '' || industryFilter !== '' || activeRangeCount > 0

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize))
  const currentPage = Math.min(page, totalPages)
  const pageRows = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return sorted.slice(start, start + pageSize)
  }, [sorted, currentPage, pageSize])

  // ----- summary strip -----
  const summary = useMemo(() => {
    const first = selectedMonths[0]
    const withReturn = sorted.filter((s) => isNum(s[`return_${first}m`]))
    const advancing = withReturn.filter((s) => Number(s[`return_${first}m`]) > 0).length
    const scored = sorted.filter((s) => isNum(s.momentum_score))
    const top = scored.reduce((best, s) => (!best || s.momentum_score > best.momentum_score ? s : best), null)
    return {
      first,
      advancing,
      advancingShare: withReturn.length ? advancing / withReturn.length : 0,
      medianScore: median(scored.map((s) => s.momentum_score)),
      top,
      nearAth: sorted.filter((s) => isNum(s.diff_from_ath) && Number(s.diff_from_ath) >= -10).length,
    }
  }, [sorted, selectedMonths])

  // ----- chips -----
  const chips = []
  if (search) chips.push({ key: 'search', label: `Search: “${search}”`, remove: () => { setSearch(''); setPage(1) } })
  if (!embedded && sectorFilter) chips.push({ key: 'sector', label: `Sector: ${sectorFilter}`, remove: () => updateSectorFilter('') })
  if (!embedded && industryFilter)
    chips.push({ key: 'industry', label: `Industry: ${industryFilter}`, remove: () => { setIndustryFilter(''); setPage(1) } })
  for (const [field, label] of filterFields) {
    const r = ranges[field]
    if (!hasRange(r)) continue
    const fmt = (v) => (field === 'market_cap_cr' ? `₹${Number(v).toLocaleString('en-IN')} Cr` : `${v}%`)
    const text =
      r.min !== '' && r.max !== ''
        ? `${label}: ${fmt(r.min)} to ${fmt(r.max)}`
        : r.min !== ''
          ? `${label} ≥ ${fmt(r.min)}`
          : `${label} ≤ ${fmt(r.max)}`
    chips.push({ key: field, label: text, remove: () => setRange(field, { ...EMPTY_RANGE }) })
  }

  // ----- table header groups -----
  const headerGroups = []
  for (const c of visibleColumns) {
    const last = headerGroups[headerGroups.length - 1]
    if (last && c.group && last.group === c.group) last.cols.push(c)
    else headerGroups.push({ group: c.group, cols: [c] })
  }
  const groupStarts = new Set(headerGroups.filter((g) => g.group).map((g) => g.cols[0].key))

  const quickStock = quickId !== null ? stockById.get(quickId) : null
  const backrefStock = backref ? stockById.get(backref.id) : null
  const showSkeleton = loading && stocks.length === 0
  const minCapLabel = minMarketCap ? `stocks ≥ ₹${Number(minMarketCap).toLocaleString('en-IN')} Cr` : 'stocks'

  function renderCell(s, col) {
    const val = s[col.key]
    const gs = groupStarts.has(col.key) ? ' gstart' : ''
    switch (col.type) {
      case 'stock':
        return (
          <td key={col.key} className="sticky">
            <div className="stk">
              <span className="sym">{s.tradingsymbol}</span>
              <span className="nm" title={s.name}>
                {s.name || '—'}
              </span>
            </div>
          </td>
        )
      case 'text':
        return (
          <td key={col.key} className="txt" title={val || undefined}>
            {val || '—'}
          </td>
        )
      case 'marketcap':
        return (
          <td
            key={col.key}
            className={`num${gs}`}
            title={s.market_cap_updated_at ? `As of ${formatDate(s.market_cap_updated_at)}` : undefined}
          >
            {formatMarketCap(val)}
          </td>
        )
      case 'price':
        return (
          <td
            key={col.key}
            className={`num${gs}`}
            title={col.key === 'all_time_high' && s.ath_date ? `Reached ${formatDate(s.ath_date)}` : undefined}
          >
            {formatPrice(val)}
          </td>
        )
      case 'pct':
        return (
          <td key={col.key} className={`num${gs}`}>
            <HeatPct value={val} />
          </td>
        )
      case 'ath': {
        if (!isNum(val)) return <td key={col.key} className={`num${gs}`}>—</td>
        const n = Number(val)
        const closeness = Math.max(0, 100 + n * 2)
        return (
          <td key={col.key} className={`num${gs}`}>
            <span className="ath">
              {n > -0.5 ? <span className="tag up">At ATH</span> : <span>{formatPct(n)}</span>}
              <span className="meter" title="Closeness to the all-time high">
                <i style={{ width: `${closeness}%` }} />
              </span>
            </span>
          </td>
        )
      }
      case 'momentum':
        if (!isNum(val)) return <td key={col.key} className={`num${gs}`}>—</td>
        return (
          <td key={col.key} className={`num${gs}`}>
            <span className={`score ${tone(val)}`}>
              <DivergingBar value={val} max={40} />
              <b className="tone">{formatPct(val)}</b>
            </span>
          </td>
        )
      case 'backref': {
        const open = backref && backref.id === s.id && backref.pivot === col.backref
        return (
          <td key={col.key} className={`num${gs}`}>
            <button
              type="button"
              className={`back-btn ${tone(val)}`}
              aria-haspopup="dialog"
              aria-expanded={Boolean(open)}
              title="Show the breakdown"
              onClick={(e) => {
                e.stopPropagation()
                const anchor = e.currentTarget
                setBackref(open ? null : { id: s.id, pivot: col.backref, anchor })
              }}
              onKeyDown={(e) => e.stopPropagation()}
            >
              {formatPct(val)}
              <Icon name="chevronDown" />
            </button>
          </td>
        )
      }
      default:
        return (
          <td key={col.key} className="num">
            {val ?? '—'}
          </td>
        )
    }
  }

  return (
    <div className={`page ${density === 'compact' ? 'compact' : ''}`}>
      {onBack ? (
        <div className="page-head">
          <BackLink onClick={onBack}>{fixedSector}</BackLink>
          <div className="ph-row">
            <div>
              <h1>{fixedIndustry || fixedSector}</h1>
              <p className="sub">Every stock in this industry, scored the same way as the screener.</p>
            </div>
            {headerExtra}
          </div>
        </div>
      ) : (
        <div className="page-head">
          <h1>Screener</h1>
          <p className="sub">Every NSE equity ranked by weighted price momentum. Click a row for a quick look.</p>
        </div>
      )}

      <div className="stat-strip">
        {showSkeleton ? (
          <StatSkeleton />
        ) : (
          <>
            <Stat
              label="Matching"
              value={sorted.length.toLocaleString('en-IN')}
              sub={`of ${stocks.length.toLocaleString('en-IN')} ${embedded ? 'in this industry' : minCapLabel}`}
            />
            <Stat
              label={`Advancing · ${summary.first}M`}
              value={<span className={`tone ${summary.advancingShare >= 0.5 ? 'up' : 'down'}`}>{summary.advancing.toLocaleString('en-IN')}</span>}
              sub={
                <>
                  <MiniBar fraction={summary.advancingShare} toneClass={summary.advancingShare >= 0.5 ? 'up' : 'down'} />
                  {Math.round(summary.advancingShare * 100)}% of matches
                </>
              }
            />
            <Stat
              label="Median score"
              value={<span className={`tone ${tone(summary.medianScore)}`}>{formatPct(summary.medianScore)}</span>}
              sub={summary.top ? `Top: ${summary.top.tradingsymbol} ${formatPct(summary.top.momentum_score, 1)}` : '—'}
            />
            <Stat label="Near all-time high" value={summary.nearAth.toLocaleString('en-IN')} sub="within 10% of ATH" />
          </>
        )}
      </div>

      <section className="card">
        <button
          type="button"
          className="sc-head"
          aria-expanded={scoringOpen}
          aria-controls="screener-scoring"
          onClick={() => setScoringOpen((o) => !o)}
        >
          <span className="eyebrow">Momentum score</span>
          <span className="formula">
            {rawWeightSum > 0 ? (
              selectedMonths.map((m, i) => (
                <Fragment key={m}>
                  {i > 0 && <span className="f-op">+</span>}
                  <span>
                    <b>{normalizedWeights[m].toFixed(0)}%</b> × {m}M
                  </span>
                </Fragment>
              ))
            ) : (
              <span className="muted">All weights are 0, so every score is 0</span>
            )}
          </span>
          <span className="sc-edit">
            {scoringOpen ? 'Done' : 'Adjust'}
            <Icon name="chevronDown" />
          </span>
        </button>
        {scoringOpen && (
          <div className="sc-body" id="screener-scoring">
            <div>
              <div className="lbl">
                Return periods <span className="muted">{selectedMonths.length} selected</span>
              </div>
              <div className="mchips">
                {MONTH_OPTIONS.map((m) => (
                  <button
                    type="button"
                    key={m}
                    className="mchip"
                    aria-pressed={selectedMonths.includes(m)}
                    onClick={() => toggleMonth(m)}
                  >
                    {m}M
                  </button>
                ))}
              </div>
              <p className="hint">
                Each period starts where the next shorter one ends. With 1M, 3M and 6M that means today→1M ago, 1M→3M ago
                and 3M→6M ago, so no stretch of price action counts twice. A period you add starts at 0% weight.
              </p>
            </div>
            <div>
              <div className="lbl">
                Weights{' '}
                <span className="muted">
                  {rawWeightSum === 100
                    ? 'Adds up to 100%'
                    : `Adds up to ${rawWeightSum.toFixed(0)}% · scaled to ` +
                      selectedMonths.map((m) => `${normalizedWeights[m].toFixed(0)}%`).join(' / ')}
                </span>
              </div>
              <WeightBar items={rawWeightSum > 0 ? selectedMonths.map((m) => [`${m}M`, normalizedWeights[m] / 100]) : null} />
              {selectedMonths.map((m) => (
                <WeightRow key={m} id={`scr-w-${m}`} label={`${m}M`} value={weights[m] ?? 0} onChange={(v) => updateWeight(m, v)} />
              ))}
              <div className="sc-actions">
                <span className="muted small">1M-back and 3M-back scores always use the 1M / 3M / 6M weights.</span>
                <button type="button" className="btn ghost sm" onClick={resetWeights}>
                  Reset to 20 / 30 / 50
                </button>
              </div>
            </div>
          </div>
        )}
      </section>

      <div className="toolbar">
        <div className="search">
          <Icon name="search" />
          <input
            type="search"
            placeholder="Search symbol or company"
            aria-label="Search stocks"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setPage(1)
            }}
          />
        </div>
        {!embedded && (
          <>
            <select value={sectorFilter} onChange={(e) => updateSectorFilter(e.target.value)} aria-label="Sector">
              <option value="">All sectors</option>
              {sectorOptions.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <select
              value={industryFilter}
              onChange={(e) => {
                setIndustryFilter(e.target.value)
                setPage(1)
              }}
              aria-label="Industry"
            >
              <option value="">All industries</option>
              {industryOptions.map((i) => (
                <option key={i} value={i}>
                  {i}
                </option>
              ))}
            </select>
          </>
        )}
        <button type="button" className="btn" onClick={() => setFiltersOpen(true)}>
          <Icon name="sliders" />
          Filters
          {activeRangeCount > 0 && <span className="badge">{activeRangeCount}</span>}
        </button>
        <button
          type="button"
          className="btn"
          aria-expanded={Boolean(columnsAnchor)}
          onClick={(e) => {
            const el = e.currentTarget
            setColumnsAnchor((cur) => (cur ? null : el))
          }}
        >
          <Icon name="columns" />
          Columns
        </button>
        <span className="spacer" />
        <Segmented
          label="Row density"
          options={[
            ['cozy', 'Comfortable'],
            ['compact', 'Compact'],
          ]}
          value={density}
          onChange={setDensity}
        />
      </div>

      {chips.length > 0 && (
        <div className="chips">
          {chips.map((c) => (
            <span className="chip" key={c.key}>
              {c.label}
              <button type="button" onClick={c.remove} aria-label={`Remove ${c.label}`}>
                <Icon name="x" />
              </button>
            </span>
          ))}
          <button type="button" className="btn ghost sm" onClick={clearFilters}>
            Clear all
          </button>
        </div>
      )}

      {error && stocks.length > 0 && (
        <div className="banner error" role="alert">
          <Icon name="alert" />
          Couldn't refresh the data ({error}). Showing the last data that loaded.
        </div>
      )}

      <section className="card table-card">
        {error && stocks.length === 0 ? (
          <StateBlock
            kind="error"
            title="Couldn't load the stocks"
            actions={
              <button type="button" className="btn primary" onClick={() => loadStocks(true)}>
                <Icon name="refresh" />
                Try again
              </button>
            }
          >
            The server returned an error ({error}). Your filters and weights are kept.
          </StateBlock>
        ) : showSkeleton ? (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  {visibleColumns.map((c) => (
                    <th key={c.key} className={c.sticky ? 'sticky' : TEXT_TYPES.has(c.type) ? '' : 'num'}>
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: 10 }, (_, r) => (
                  <tr key={r}>
                    {visibleColumns.map((c, i) => (
                      <td key={c.key} className={c.sticky ? 'sticky' : ''}>
                        <Skeleton width={i === 0 ? 120 : 48 + ((i * 37) % 40)} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : sorted.length === 0 ? (
          <StateBlock
            title="No stocks match these filters"
            actions={
              filtersActive && (
                <button type="button" className="btn" onClick={clearFilters}>
                  Clear all filters
                </button>
              )
            }
          >
            {filtersActive
              ? 'Loosen a range, pick another sector, or clear everything to see the full list.'
              : 'There are no stocks with price data for this selection.'}
          </StateBlock>
        ) : (
          <>
            <div className="tbl-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    {headerGroups.map((g) =>
                      g.group ? (
                        <th key={`g-${g.group}`} colSpan={g.cols.length} className="th-group">
                          {GROUP_LABELS[g.group]}
                          {g.group === 'returns' && <span className="th-group-sub">non-overlapping</span>}
                        </th>
                      ) : (
                        <SortTh
                          key={g.cols[0].key}
                          colKey={g.cols[0].key}
                          label={g.cols[0].label}
                          sort={sort}
                          onSort={toggleSort}
                          rowSpan={2}
                          title={g.cols[0].title}
                          className={g.cols[0].sticky ? 'sticky' : TEXT_TYPES.has(g.cols[0].type) ? '' : 'num'}
                        />
                      )
                    )}
                  </tr>
                  <tr>
                    {visibleColumns
                      .filter((c) => c.group)
                      .map((c) => (
                        <SortTh
                          key={c.key}
                          colKey={c.key}
                          label={c.label}
                          sort={sort}
                          onSort={toggleSort}
                          title={c.title}
                          className={`num${groupStarts.has(c.key) ? ' gstart' : ''}`}
                        />
                      ))}
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((s) => (
                    <tr
                      key={s.id}
                      className="click"
                      tabIndex={0}
                      onClick={() => setQuickId(s.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') setQuickId(s.id)
                      }}
                    >
                      {visibleColumns.map((col) => renderCell(s, col))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination
              page={currentPage}
              totalPages={totalPages}
              total={sorted.length}
              pageSize={pageSize}
              pageSizeOptions={PAGE_SIZE_OPTIONS}
              onPage={(p) => setPage(Math.min(Math.max(1, p), totalPages))}
              onPageSize={(n) => {
                setPageSize(n)
                setPage(1)
              }}
            />
          </>
        )}
      </section>

      {columnsAnchor && (
        <FloatingPanel anchorEl={columnsAnchor} onClose={() => setColumnsAnchor(null)} label="Columns" width={380}>
          <div className="pop-head">
            <b>Columns</b>
            <button type="button" className="btn ghost sm" onClick={() => setHiddenColumns(new Set())}>
              Show all
            </button>
          </div>
          {[
            ['', 'Basics'],
            ['prices', 'Price history'],
            ['returns', 'Returns'],
            ['ath', 'All-time high'],
            ['mom', 'Momentum'],
          ].map(([group, label]) => {
            const cols = COLUMNS.filter(
              (c) => c.group === group && !c.sticky && !(embedded && (c.key === 'sector' || c.key === 'industry'))
            )
            if (!cols.length) return null
            return (
              <div className="colgrp" key={label}>
                <h4>{label}</h4>
                <div className="colchecks">
                  {cols.map((c) => (
                    <label className="check" key={c.key}>
                      <input type="checkbox" checked={!hiddenColumns.has(c.key)} onChange={() => toggleColumn(c.key)} />
                      <span>{c.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            )
          })}
          <p className="pop-foot">The Stock column always stays visible.</p>
        </FloatingPanel>
      )}

      {backref && backrefStock && (
        <FloatingPanel anchorEl={backref.anchor} onClose={() => setBackref(null)} label="Back-score breakdown">
          <BackrefPanel stock={backrefStock} pivot={backref.pivot} backrefWeights={backrefWeights} />
        </FloatingPanel>
      )}

      {filtersOpen && (
        <Drawer
          title="Filters"
          onClose={() => setFiltersOpen(false)}
          footer={
            <>
              <button type="button" className="btn ghost" onClick={clearRanges} disabled={activeRangeCount === 0}>
                Clear ranges
              </button>
              <button type="button" className="btn primary" onClick={() => setFiltersOpen(false)}>
                Show {sorted.length.toLocaleString('en-IN')} {sorted.length === 1 ? 'stock' : 'stocks'}
              </button>
            </>
          }
        >
          <p className="muted small flush">Filters apply as you type. Leave a box empty for no limit.</p>
          {filterFields.map(([field, label, unit]) => {
            const r = ranges[field] || EMPTY_RANGE
            return (
              <div className="ff" key={field}>
                <div className="lbl">
                  {label} <span className="muted">{unit}</span>
                </div>
                {field === 'market_cap_cr' && (
                  <div className="presets">
                    {MARKET_CAP_PRESETS.map(([text, min, max]) => (
                      <button
                        type="button"
                        className="pchip"
                        key={text}
                        aria-pressed={r.min === min && r.max === max}
                        onClick={() => setRange(field, { min, max })}
                      >
                        {text}
                      </button>
                    ))}
                  </div>
                )}
                <div className="range2">
                  <input
                    type="number"
                    placeholder="Min"
                    aria-label={`${label} minimum`}
                    value={r.min}
                    onChange={(e) => updateRange(field, 'min', e.target.value)}
                  />
                  <span className="muted small">to</span>
                  <input
                    type="number"
                    placeholder="Max"
                    aria-label={`${label} maximum`}
                    value={r.max}
                    onChange={(e) => updateRange(field, 'max', e.target.value)}
                  />
                </div>
              </div>
            )
          })}
        </Drawer>
      )}

      {quickStock && (
        <QuickLook
          stock={quickStock}
          months={selectedMonths}
          normalizedWeights={normalizedWeights}
          backrefWeights={backrefWeights}
          onClose={() => setQuickId(null)}
          onOpenIndustry={
            !embedded && quickStock.sector && quickStock.industry
              ? () => navigate(industryPath(quickStock.sector, quickStock.industry))
              : null
          }
        />
      )}
    </div>
  )
}

function BackrefTable({ stock, pivot }) {
  const { rows } = getBackrefBreakdown(stock, pivot)
  return (
    <div className="bgrid">
      <span className="h">Window</span>
      <span className="h">From</span>
      <span className="h num">Close</span>
      <span className="h num">Return</span>
      {rows.map((r) => (
        <Fragment key={r.label}>
          <span>{r.label}</span>
          <span className="muted">{formatDate(r.date)}</span>
          <span className="num">{formatPrice(r.price)}</span>
          <span className={`num tone ${tone(r.returnVal)}`}>{formatPct(r.returnVal)}</span>
        </Fragment>
      ))}
    </div>
  )
}

function BackrefPanel({ stock, pivot, backrefWeights }) {
  const value = pivot === 1 ? stock.momentum_1m_back : stock.momentum_3m_back
  const { pivotDate, pivotPrice } = getBackrefBreakdown(stock, pivot)
  return (
    <>
      <div className="pop-head">
        <b>
          {stock.tradingsymbol} · {pivot}M-back score
        </b>
        <span className={`num tone ${tone(value)}`}>{formatPct(value)}</span>
      </div>
      <p className="pop-sub">
        Scored as if today were {formatDate(pivotDate)} (close ₹{formatPrice(pivotPrice)}).
      </p>
      <BackrefTable stock={stock} pivot={pivot} />
      <p className="pop-foot">
        Weights 1M / 3M / 6M: {backrefWeights[1].toFixed(0)}% / {backrefWeights[3].toFixed(0)}% /{' '}
        {backrefWeights[6].toFixed(0)}%
      </p>
    </>
  )
}

// Closing prices at every month mark the API returned for this stock
// (today, the fixed back-score offsets and the selected periods).
function priceHistory(stock, months) {
  const points = new Map()
  if (isNum(stock.current_price) && Number(stock.current_price) > 0) {
    points.set(0, { offset: 0, price: Number(stock.current_price), date: stock.current_ts })
  }
  for (const m of BREF_OFFSETS) {
    const p = stock[`bref_${m}m`]
    if (isNum(p) && Number(p) > 0) points.set(m, { offset: m, price: Number(p), date: stock[`brefdate_${m}m`] })
  }
  for (const m of months) {
    const p = stock[`price_${m}m`]
    if (isNum(p) && Number(p) > 0 && !points.has(m)) points.set(m, { offset: m, price: Number(p), date: stock[`date_${m}m`] })
  }
  return [...points.values()].sort((a, b) => b.offset - a.offset)
}

function Sparkline({ stock, months }) {
  const pts = priceHistory(stock, months)
  if (pts.length < 2) return null
  const W = 460
  const H = 130
  const px = 6
  const py = 10
  const maxOffset = pts[0].offset
  const prices = pts.map((p) => p.price)
  const lo = Math.min(...prices)
  const hi = Math.max(...prices)
  const x = (offset) => px + ((maxOffset - offset) / (maxOffset || 1)) * (W - 2 * px)
  const y = (v) => H - py - ((v - lo) / (hi - lo || 1)) * (H - 2 * py)
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.offset).toFixed(1)},${y(p.price).toFixed(1)}`).join('')
  const last = pts[pts.length - 1]
  const lineTone = last.price >= pts[0].price ? 'up' : 'down'
  return (
    <figure className={`spark ${lineTone}`}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${stock.tradingsymbol} closing prices over ${maxOffset} months`}>
        {[0.25, 0.5, 0.75].map((f) => (
          <line key={f} className="sg" x1="0" x2={W} y1={py + f * (H - 2 * py)} y2={py + f * (H - 2 * py)} />
        ))}
        <path className="sa" d={`${d}L${x(last.offset).toFixed(1)},${H}L${x(pts[0].offset).toFixed(1)},${H}Z`} />
        <path className="sl" d={d} />
        {pts.map((p) => (
          <circle key={p.offset} className="sp" cx={x(p.offset)} cy={y(p.price)} r={p === last ? 4 : 2.2}>
            <title>{`${p.offset === 0 ? 'Latest' : `${p.offset}M ago`}: ₹${formatPrice(p.price)}`}</title>
          </circle>
        ))}
      </svg>
      <div className="spark-axis">
        <span>
          {formatMonthYear(pts[0].date)} · ₹{formatPrice(pts[0].price)}
        </span>
        <span>
          Low ₹{formatPrice(lo)} · High ₹{formatPrice(hi)}
        </span>
        <span>Latest</span>
      </div>
      <figcaption>Closing price at each month mark ({pts.length} points)</figcaption>
    </figure>
  )
}

function QuickLook({ stock, months, normalizedWeights, backrefWeights, onClose, onOpenIndustry }) {
  const parts = months.map((m, i) => {
    const ret = stock[`return_${m}m`]
    const w = normalizedWeights[m] / 100
    return { m, from: i ? months[i - 1] : 0, ret, w, c: isNum(ret) ? w * Number(ret) : null }
  })
  const maxC = Math.max(0.01, ...parts.map((p) => (isNum(p.c) ? Math.abs(p.c) : 0)))
  const firstReturn = stock[`return_${months[0]}m`]
  const atAth = isNum(stock.diff_from_ath) && Number(stock.diff_from_ath) > -0.5

  return (
    <Drawer
      title="Quick look"
      wide
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn ghost" onClick={onClose}>
            Close
          </button>
          {onOpenIndustry && (
            <button type="button" className="btn" onClick={onOpenIndustry}>
              Open {stock.industry}
              <Icon name="chevronRight" />
            </button>
          )}
        </>
      }
    >
      <div className="ql-head">
        <div>
          <div className="ql-sym">{stock.tradingsymbol}</div>
          <div className="muted">{stock.name}</div>
          <div className="ql-tags">
            {stock.sector && <span className="tagn">{stock.sector}</span>}
            {stock.industry && <span className="tagn">{stock.industry}</span>}
          </div>
        </div>
        <div className="ql-price">
          <b className="num">₹{formatPrice(stock.current_price)}</b>
          <span className={`num tone ${tone(firstReturn)}`}>
            {formatPct(firstReturn)} · {months[0]}M
          </span>
          <span className="muted">{formatMarketCap(stock.market_cap_cr)}</span>
        </div>
      </div>

      <Sparkline stock={stock} months={months} />

      <section>
        <h3 className="h3">
          How the score adds up <span className={`num tone ${tone(stock.momentum_score)}`}>{formatPct(stock.momentum_score)}</span>
        </h3>
        {parts.map((p) => {
          const w = isNum(p.c) ? (Math.abs(p.c) / maxC) * 50 : 0
          return (
            <div className="crow" key={p.m}>
              <span>
                {p.m}M
                <small>{p.from ? `${p.m}M → ${p.from}M ago` : `${p.m}M ago → today`}</small>
              </span>
              <span className={`num tone ${tone(p.ret)}`}>{formatPct(p.ret)}</span>
              <span className="num muted">× {(p.w * 100).toFixed(0)}%</span>
              <span className={`cbar ${tone(p.c)}`} aria-hidden="true">
                <i style={isNum(p.c) && p.c < 0 ? { right: '50%', width: `${w}%` } : { left: '50%', width: `${w}%` }} />
              </span>
              <span className={`num tone ${tone(p.c)}`}>{formatPct(p.c)}</span>
            </div>
          )
        })}
        {!isNum(stock.momentum_score) && (
          <p className="muted small">No score: at least one selected period has no price data for this stock.</p>
        )}
      </section>

      <section>
        <h3 className="h3">All-time high</h3>
        <div className="kv">
          <div>
            <span>ATH</span>
            <b>₹{formatPrice(stock.all_time_high)}</b>
          </div>
          <div>
            <span>Reached</span>
            <b>{formatDate(stock.ath_date)}</b>
          </div>
          <div>
            <span>Distance</span>
            <b className={atAth ? 'tone up' : ''}>{atAth ? 'At ATH' : formatPct(stock.diff_from_ath)}</b>
          </div>
        </div>
      </section>

      {[1, 3].map((pivot) => {
        const value = pivot === 1 ? stock.momentum_1m_back : stock.momentum_3m_back
        return (
          <section key={pivot}>
            <h3 className="h3">
              {pivot}M-back score <span className={`num tone ${tone(value)}`}>{formatPct(value)}</span>
            </h3>
            <BackrefTable stock={stock} pivot={pivot} />
          </section>
        )
      })}
      <p className="muted small flush">
        Back-scores use the 1M / 3M / 6M weights ({backrefWeights[1].toFixed(0)}% / {backrefWeights[3].toFixed(0)}% /{' '}
        {backrefWeights[6].toFixed(0)}%).
      </p>
    </Drawer>
  )
}
