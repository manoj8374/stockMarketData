import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import StockScreener from './StockScreener'
import { BackLink, Breadth, Icon, Segmented, Skeleton, StateBlock } from './ui'
import { formatPct, industryPath, isNum, loadJSON, saveJSON, sectorPath, tone } from './format'
import { usePageMeta, useRefreshSignal } from './shell'
import {
  BLEND_KEYS,
  BLEND_STORAGE_KEY,
  DEFAULT_BLEND,
  DEFAULT_PERIOD_WEIGHTS,
  PERIOD_STORAGE_KEY,
  PERIODS,
  buildIndustryRows,
  loadStoredWeights,
  normalize,
} from './industryScore'

// Small fetch helper: loads `url` whenever it changes or the top bar's
// Refresh is pressed, ignoring responses that arrive after a newer request.
function useJson(url, pick) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [reload, setReload] = useState(0)
  const pickRef = useRef(pick)

  useEffect(() => {
    pickRef.current = pick
  })

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(`Request failed: ${r.status}`)
        return r.json()
      })
      .then((json) => {
        if (!cancelled) setData(pickRef.current(json))
      })
      .catch((e) => {
        if (!cancelled) setError(e.message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [url, reload])

  const retry = () => setReload((n) => n + 1)
  useRefreshSignal(retry)
  return { data, loading, error, retry }
}

function ErrorState({ error, onRetry, what }) {
  return (
    <StateBlock
      kind="error"
      title={`Couldn't load ${what}`}
      actions={
        <button type="button" className="btn primary" onClick={onRetry}>
          <Icon name="refresh" />
          Try again
        </button>
      }
    >
      The server returned an error ({error}). Try again in a moment.
    </StateBlock>
  )
}

const SECTOR_SORTS = [
  ['count', 'Most stocks'],
  ['median', '1M median'],
  ['name', 'A–Z'],
]

function SectorGrid({ minMarketCap }) {
  const navigate = useNavigate()
  const { data, loading, error, retry } = useJson(`/api/sectors?minMarketCap=${minMarketCap}`, (j) => j.sectors)
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState(() => {
    const saved = loadJSON('sectorSort', 'count')
    return SECTOR_SORTS.some(([k]) => k === saved) ? saved : 'count'
  })
  usePageMeta(null, loading)

  useEffect(() => {
    saveJSON('sectorSort', sortBy)
  }, [sortBy])

  const sectors = useMemo(() => data || [], [data])
  const total = sectors.reduce((acc, s) => acc + Number(s.count || 0), 0)
  const list = useMemo(() => {
    const q = search.trim().toLowerCase()
    const out = sectors.filter((s) => !q || s.sector.toLowerCase().includes(q))
    const byName = (a, b) => a.sector.localeCompare(b.sector)
    if (sortBy === 'name') out.sort(byName)
    else if (sortBy === 'median')
      out.sort((a, b) => {
        if (!isNum(a.median_1m)) return 1
        if (!isNum(b.median_1m)) return -1
        return b.median_1m - a.median_1m || byName(a, b)
      })
    else out.sort((a, b) => b.count - a.count || byName(a, b))
    return out
  }, [sectors, search, sortBy])

  let body
  if (error && !data) {
    body = (
      <div className="card span-all">
        <ErrorState error={error} onRetry={retry} what="the sectors" />
      </div>
    )
  } else if (loading && !data) {
    body = Array.from({ length: 6 }, (_, i) => (
      <div className="scard" key={i} aria-hidden="true">
        <Skeleton width="60%" height={14} />
        <Skeleton width="35%" height={24} />
        <Skeleton height={4} />
        <Skeleton width="80%" />
      </div>
    ))
  } else if (list.length === 0) {
    body = (
      <div className="card span-all">
        <StateBlock
          title="No sectors found"
          actions={
            search && (
              <button type="button" className="btn" onClick={() => setSearch('')}>
                Clear search
              </button>
            )
          }
        >
          {search ? `Nothing matches “${search}”.` : 'No sectors have stocks under the current market-cap setting.'}
        </StateBlock>
      </div>
    )
  } else {
    body = list.map((s) => {
      const share = total ? s.count / total : 0
      return (
        <button type="button" className="scard" key={s.sector} onClick={() => navigate(sectorPath(s.sector))}>
          <span className="scard-top">
            <h3>{s.sector}</h3>
            <Icon name="chevronRight" />
          </span>
          <span className="scount">
            <b>{Number(s.count).toLocaleString('en-IN')}</b>
            stocks
            {isNum(s.industries) && ` · ${s.industries} ${Number(s.industries) === 1 ? 'industry' : 'industries'}`}
          </span>
          <span className="share" title={`${Math.round(share * 100)}% of all stocks`}>
            <i style={{ width: `${share * 100}%` }} />
          </span>
          <span className="sfoot">
            <span>
              1M median <b className={`tone ${tone(s.median_1m)}`}>{formatPct(s.median_1m, 1)}</b>
            </span>
            <span>
              Breadth{' '}
              <b className={isNum(s.breadth_1m) ? `tone ${s.breadth_1m >= 50 ? 'up' : 'down'}` : ''}>
                {isNum(s.breadth_1m) ? `${Number(s.breadth_1m).toFixed(0)}%` : '—'}
              </b>
            </span>
          </span>
        </button>
      )
    })
  }

  return (
    <div className="page">
      <div className="page-head">
        <h1>Sectors</h1>
        <p className="sub">Browse the universe by sector, then open an industry to see its stocks.</p>
      </div>
      {error && data && (
        <div className="banner error" role="alert">
          <Icon name="alert" />
          Couldn't refresh ({error}). Showing the last data that loaded.
        </div>
      )}
      <div className="toolbar">
        <div className="search">
          <Icon name="search" />
          <input
            type="search"
            placeholder="Search sectors"
            aria-label="Search sectors"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <span className="spacer" />
        <span className="muted small">Sort</span>
        <Segmented label="Sort sectors" options={SECTOR_SORTS} value={sortBy} onChange={setSortBy} />
      </div>
      <div className="sgrid">{body}</div>
      <p className="muted small flush">
        1M median is the middle 1-month return of the sector's stocks. Breadth is the share of them that rose over the
        month. Both need at least 3 stocks with a 1-month return.
      </p>
    </div>
  )
}

function IndustryList({ sector, minMarketCap }) {
  const navigate = useNavigate()
  const { data, loading, error, retry } = useJson(
    `/api/industries?sector=${encodeURIComponent(sector)}&minMarketCap=${minMarketCap}`,
    (j) => j.industries
  )
  usePageMeta(null, loading)

  const industries = useMemo(() => [...(data || [])].sort((a, b) => b.count - a.count || a.industry.localeCompare(b.industry)), [data])
  const total = industries.reduce((acc, i) => acc + Number(i.count || 0), 0)
  const max = Math.max(1, ...industries.map((i) => Number(i.count || 0)))

  let body
  if (error && !data) body = <ErrorState error={error} onRetry={retry} what="the industries" />
  else if (loading && !data)
    body = Array.from({ length: 5 }, (_, i) => (
      <div className="irow" key={i} aria-hidden="true">
        <Skeleton width="60%" />
        <Skeleton />
        <span className="c-share">
          <Skeleton />
        </span>
        <Skeleton />
        <span className="c-breadth">
          <Skeleton />
        </span>
        <span />
      </div>
    ))
  else if (industries.length === 0)
    body = (
      <StateBlock title="No industries here">
        No stocks in this sector pass the current market-cap setting. Turn off “Hide under ₹2,000 Cr” to include smaller
        companies.
      </StateBlock>
    )
  else
    body = (
      <>
        <div className="irow ihead" aria-hidden="true">
          <span>Industry</span>
          <span className="num">Stocks</span>
          <span className="c-share">Share of sector</span>
          <span className="num">1M median</span>
          <span className="c-breadth">1M breadth</span>
          <span />
        </div>
        {industries.map((ind) => (
          <button type="button" className="irow" key={ind.industry} onClick={() => navigate(industryPath(sector, ind.industry))}>
            <span className="nm2">
              <b>{ind.industry}</b>
              {ind.count < 3 && <span>Too few stocks for industry momentum</span>}
            </span>
            <span className="num">{ind.count}</span>
            <span className="ishare c-share">
              <span className="share">
                <i style={{ width: `${(ind.count / max) * 100}%` }} />
              </span>
              {total ? Math.round((ind.count / total) * 100) : 0}%
            </span>
            <span className={`num tone ${tone(ind.median_1m)}`}>{formatPct(ind.median_1m, 1)}</span>
            <span className="c-breadth">
              <Breadth value={ind.breadth_1m} positive={ind.positive_1m} count={ind.with_return_1m} />
            </span>
            <Icon name="chevronRight" />
          </button>
        ))}
      </>
    )

  return (
    <div className="page">
      <div className="page-head">
        <BackLink onClick={() => navigate('/sectors')}>All sectors</BackLink>
        <h1>{sector}</h1>
        <p className="sub">
          {data
            ? `${total.toLocaleString('en-IN')} stocks across ${industries.length} ${industries.length === 1 ? 'industry' : 'industries'}. Pick one to see its stocks.`
            : 'Pick an industry to see its stocks.'}
        </p>
      </div>
      {error && data && (
        <div className="banner error" role="alert">
          <Icon name="alert" />
          Couldn't refresh ({error}). Showing the last data that loaded.
        </div>
      )}
      <section className="card ilist">{body}</section>
    </div>
  )
}

// Header numbers for one industry, taken from the Industry Momentum data with
// the user's saved industry weights so they match that page.
function IndustryHeaderStats({ sector, industry, minMarketCap }) {
  const { data, loading, error } = useJson(`/api/industry-momentum?minMarketCap=${minMarketCap}`, (j) => j)

  if (loading && !data)
    return (
      <div className="head-stats" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <div className="hs" key={i}>
            <Skeleton width="70%" />
            <Skeleton width="50%" height={16} />
          </div>
        ))}
      </div>
    )
  if (error || !data) return null

  const blend = normalize(loadStoredWeights(BLEND_STORAGE_KEY, DEFAULT_BLEND), BLEND_KEYS)
  const periods = normalize(loadStoredWeights(PERIOD_STORAGE_KEY, DEFAULT_PERIOD_WEIGHTS), PERIODS)
  const match = data.industries.find((i) => i.sector === sector && i.industry === industry)
  if (!match) {
    return <p className="muted small head-note">Too few stocks for industry momentum stats (needs {data.minStocks}).</p>
  }
  const [row] = buildIndustryRows([match], blend, periods)
  const st = row.stats[1]
  return (
    <div className="head-stats">
      <div className="hs">
        <span>Industry score</span>
        <b className={`tone ${tone(row.score)}`}>{formatPct(row.score)}</b>
      </div>
      <div className="hs">
        <span>1M breadth</span>
        <b>
          {isNum(st.breadth) ? `${Number(st.breadth).toFixed(0)}%` : '—'}
          {isNum(st.breadth) && (
            <span className="muted small">
              {' '}
              {st.positive}/{st.count}
            </span>
          )}
        </b>
      </div>
      <div className="hs">
        <span>1M median</span>
        <b className={`tone ${tone(st.median)}`}>{formatPct(st.median)}</b>
      </div>
    </div>
  )
}

export default function SectorsBrowser({ minMarketCap = 0 }) {
  const { sector, industry } = useParams()
  const navigate = useNavigate()

  if (sector && industry) {
    return (
      <StockScreener
        key={`${sector}\u0000${industry}`}
        fixedSector={sector}
        fixedIndustry={industry}
        minMarketCap={minMarketCap}
        onBack={() => navigate(sectorPath(sector))}
        headerExtra={<IndustryHeaderStats sector={sector} industry={industry} minMarketCap={minMarketCap} />}
      />
    )
  }
  if (sector) return <IndustryList key={sector} sector={sector} minMarketCap={minMarketCap} />
  return <SectorGrid minMarketCap={minMarketCap} />
}
