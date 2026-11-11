import { Fragment, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Breadth,
  DivergingBar,
  HeatPct,
  Icon,
  MiniBar,
  Segmented,
  Skeleton,
  SortTh,
  Stat,
  StatSkeleton,
  StateBlock,
  WeightBar,
  WeightRow,
} from './ui'
import { formatPct, industryPath, isNum, loadJSON, saveJSON, tone } from './format'
import { usePageMeta, useRefreshSignal } from './shell'
import {
  BLEND_FIELDS,
  BLEND_KEYS,
  BLEND_LABELS,
  BLEND_STORAGE_KEY,
  DEFAULT_BLEND,
  DEFAULT_PERIOD_WEIGHTS,
  PERIOD_STORAGE_KEY,
  PERIODS,
  buildIndustryRows,
  loadStoredWeights,
  normalize,
  periodDescription,
  weightNote,
} from './industryScore'

const METRICS = [
  ['score', 'Score'],
  ['median', 'Median'],
  ['mean', 'Mean'],
  ['breadth', 'Breadth'],
]
const METRIC_LABELS = Object.fromEntries(METRICS)
const DEFAULT_METRICS = ['score', 'median', 'breadth']
const METRICS_KEY = 'industryMetrics'

function loadMetrics() {
  const saved = loadJSON(METRICS_KEY, null)
  if (Array.isArray(saved)) {
    const valid = METRICS.map(([k]) => k).filter((k) => saved.includes(k))
    if (valid.length) return valid
  }
  return [...DEFAULT_METRICS]
}

// minMarketCap comes from the app-wide "hide small caps" toggle (0 = all
// companies). The API always receives it explicitly, so the calculations
// here always match what the Stocks and Sectors pages show.
export default function IndustryMomentum({ minMarketCap = 0 }) {
  const navigate = useNavigate()

  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [reload, setReload] = useState({ token: 0, bypass: false })

  const [blend, setBlend] = useState(() => loadStoredWeights(BLEND_STORAGE_KEY, DEFAULT_BLEND))
  const [periodWeights, setPeriodWeights] = useState(() => loadStoredWeights(PERIOD_STORAGE_KEY, DEFAULT_PERIOD_WEIGHTS))
  const [metrics, setMetrics] = useState(loadMetrics)
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState({ key: 'score', direction: 'desc' })
  const [scoringOpen, setScoringOpen] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    const params = new URLSearchParams({ minMarketCap: String(minMarketCap) })
    if (reload.bypass) params.set('refresh', '1')
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
  }, [minMarketCap, reload])

  const refresh = () => setReload((r) => ({ token: r.token + 1, bypass: true }))
  useRefreshSignal(refresh)
  usePageMeta(data?.generatedAt, loading)

  useEffect(() => {
    saveJSON(BLEND_STORAGE_KEY, blend)
  }, [blend])

  useEffect(() => {
    saveJSON(PERIOD_STORAGE_KEY, periodWeights)
  }, [periodWeights])

  useEffect(() => {
    saveJSON(METRICS_KEY, metrics)
  }, [metrics])

  function toggleSort(key) {
    setSort((prev) => {
      if (prev.key !== key) return { key, direction: key === 'industry' ? 'asc' : 'desc' }
      return { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' }
    })
  }

  function toggleMetric(key) {
    setMetrics((prev) => {
      if (prev.includes(key)) return prev.length === 1 ? prev : prev.filter((k) => k !== key)
      return METRICS.map(([k]) => k).filter((k) => k === key || prev.includes(k))
    })
  }

  // A hidden metric column can't stay the sort key.
  useEffect(() => {
    const metric = sort.key.split('_')[0]
    if (sort.key.includes('_') && !metrics.includes(metric)) setSort({ key: 'score', direction: 'desc' })
  }, [metrics, sort.key])

  const normalizedBlend = useMemo(() => normalize(blend, BLEND_KEYS), [blend])
  const normalizedPeriods = useMemo(() => normalize(periodWeights, PERIODS), [periodWeights])

  const rows = useMemo(
    () => (data ? buildIndustryRows(data.industries, normalizedBlend, normalizedPeriods) : []),
    [data, normalizedBlend, normalizedPeriods]
  )

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((r) => r.industry.toLowerCase().includes(q) || (r.sector || '').toLowerCase().includes(q))
  }, [rows, search])

  const sorted = useMemo(() => {
    const arr = [...filtered]
    const { key, direction } = sort
    const isText = key === 'industry'
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

  const scored = useMemo(() => rows.filter((r) => isNum(r.score)).sort((a, b) => b.score - a.score), [rows])
  const maxAbsScore = Math.max(0.01, ...scored.map((r) => Math.abs(r.score)))
  const leadCount = Math.min(5, Math.ceil(scored.length / 2))
  const positiveCount = scored.filter((r) => r.score > 0).length
  const breadth1 = useMemo(() => {
    let positive = 0
    let count = 0
    for (const r of rows) {
      const st = r.stats[1]
      if (isNum(st.positive)) {
        positive += st.positive
        count += st.count
      }
    }
    return count ? { share: positive / count, positive, count } : null
  }, [rows])

  const goToIndustry = (r) => {
    if (r.sector) navigate(industryPath(r.sector, r.industry))
  }

  function renderMetricCell(row, m, metric, first) {
    const st = row.stats[m]
    const cls = `num${first ? ' gstart' : ''}`
    const key = `${metric}_${m}`
    if (metric === 'breadth') {
      return (
        <td
          key={key}
          className={cls}
          title={
            st.breadth === null
              ? `Only ${st.count} stock(s) with a ${m}M return`
              : `${st.positive} of ${st.count} stocks had a positive ${m}M return`
          }
        >
          <Breadth value={st.breadth} positive={st.positive} count={st.count} />
        </td>
      )
    }
    if (metric === 'score') {
      const title =
        st.median === null
          ? `Only ${st.count} stock(s) with a ${m}M return`
          : `Median ${formatPct(st.median)} · P75 ${formatPct(st.p75)} · Mean ${formatPct(st.mean)} (${st.count} stocks)`
      return (
        <td key={key} className={cls} title={title}>
          <HeatPct value={row[`score_${m}m`]} />
        </td>
      )
    }
    const val = row[`${metric}_${m}m`]
    return (
      <td key={key} className={cls} title={`${st.count} stocks with a ${m}M return`}>
        <span className={`tone ${tone(val)}`}>{formatPct(val)}</span>
      </td>
    )
  }

  const leaderRow = (r, rank) => (
    <button type="button" className="lead-row" key={`${r.sector}|${r.industry}`} onClick={() => goToIndustry(r)}>
      <span className="rk">{rank}</span>
      <span className="nm2">
        <b>{r.industry}</b>
        <span>{r.sector}</span>
      </span>
      <span className={`hbar ${tone(r.score)}`} aria-hidden="true">
        <i style={{ width: `${(Math.abs(r.score) / maxAbsScore) * 100}%` }} />
      </span>
      <span className={`num tone ${tone(r.score)}`}>{formatPct(r.score, 1)}</span>
    </button>
  )

  const showSkeleton = loading && !data

  return (
    <div className="page">
      <div className="page-head">
        <h1>Industry momentum</h1>
        <p className="sub">
          Which industries are leading, and how many of their stocks are taking part. Click any industry to see its stocks.
        </p>
      </div>

      <div className="stat-strip">
        {showSkeleton || !data ? (
          <StatSkeleton />
        ) : (
          <>
            <Stat
              label="Industries ranked"
              value={rows.length.toLocaleString('en-IN')}
              sub={`${data.excludedIndustries} hidden · under ${data.minStocks} stocks`}
            />
            <Stat
              label="Stocks covered"
              value={data.eligibleStocks.toLocaleString('en-IN')}
              sub={data.minMarketCap ? `market cap ≥ ₹${Number(data.minMarketCap).toLocaleString('en-IN')} Cr` : 'all market caps'}
            />
            <Stat
              label="Positive score"
              value={
                <span className={`tone ${positiveCount * 2 >= scored.length ? 'up' : 'down'}`}>{positiveCount}</span>
              }
              sub={
                <>
                  <MiniBar
                    fraction={scored.length ? positiveCount / scored.length : 0}
                    toneClass={positiveCount * 2 >= scored.length ? 'up' : 'down'}
                  />
                  of {scored.length} scored industries
                </>
              }
            />
            <Stat
              label="Breadth · 1M"
              value={
                breadth1 ? (
                  <span className={`tone ${breadth1.share >= 0.5 ? 'up' : 'down'}`}>{Math.round(breadth1.share * 100)}%</span>
                ) : (
                  '—'
                )
              }
              sub={breadth1 ? `${breadth1.positive} of ${breadth1.count} stocks rose this month` : 'not enough data'}
            />
          </>
        )}
      </div>

      {showSkeleton ? (
        <div className="lead-grid" aria-hidden="true">
          {['Leading', 'Lagging'].map((t) => (
            <section className="card lead-card" key={t}>
              <header>
                <h3>{t}</h3>
              </header>
              {[0, 1, 2, 3, 4].map((i) => (
                <div className="lead-row" key={i}>
                  <Skeleton width={12} />
                  <Skeleton width="70%" />
                  <Skeleton />
                  <Skeleton />
                </div>
              ))}
            </section>
          ))}
        </div>
      ) : (
        scored.length > 0 && (
          <div className="lead-grid">
            <section className="card lead-card">
              <header>
                <h3>Leading</h3>
                <span className="muted small">Top {leadCount} by score</span>
              </header>
              {scored.slice(0, leadCount).map((r, i) => leaderRow(r, i + 1))}
            </section>
            <section className="card lead-card">
              <header>
                <h3>Lagging</h3>
                <span className="muted small">Bottom {leadCount} by score</span>
              </header>
              {scored
                .slice(-leadCount)
                .reverse()
                .map((r, i) => leaderRow(r, scored.length - i))}
            </section>
          </div>
        )
      )}

      <section className="card">
        <button
          type="button"
          className="sc-head"
          aria-expanded={scoringOpen}
          aria-controls="industry-scoring"
          onClick={() => setScoringOpen((o) => !o)}
        >
          <span className="eyebrow">Industry score</span>
          <span className="formula">
            {normalizedPeriods ? (
              PERIODS.map((m, i) => (
                <Fragment key={m}>
                  {i > 0 && <span className="f-op">+</span>}
                  <span>
                    <b>{Math.round(normalizedPeriods[m] * 100)}%</b> × {m}M
                  </span>
                </Fragment>
              ))
            ) : (
              <span className="muted">All period weights are 0, so no scores</span>
            )}
            <span className="f-sub">
              {normalizedBlend
                ? `each period = ${BLEND_KEYS.map((k) => `${Math.round(normalizedBlend[k] * 100)}% ${BLEND_LABELS[k].toLowerCase()}`).join(' + ')} of its stocks' returns`
                : 'period blend weights are all 0'}
            </span>
          </span>
          <span className="sc-edit">
            {scoringOpen ? 'Done' : 'Adjust'}
            <Icon name="chevronDown" />
          </span>
        </button>
        {scoringOpen && (
          <div className="sc-body even" id="industry-scoring">
            <div>
              <div className="lbl">
                Period score blend <span className="muted">{weightNote(blend, BLEND_KEYS, normalizedBlend)}</span>
              </div>
              <WeightBar items={normalizedBlend ? BLEND_FIELDS.map(([k, l]) => [l, normalizedBlend[k]]) : null} />
              {BLEND_FIELDS.map(([k, l]) => (
                <WeightRow key={k} id={`ind-b-${k}`} label={l} value={blend[k]} onChange={(v) => setBlend((p) => ({ ...p, [k]: v }))} />
              ))}
              <div className="sc-actions">
                <span className="muted small">How each period's score is built from its stocks' returns.</span>
                <button type="button" className="btn ghost sm" onClick={() => setBlend({ ...DEFAULT_BLEND })}>
                  Reset to 60 / 25 / 15
                </button>
              </div>
            </div>
            <div>
              <div className="lbl">
                Period weights <span className="muted">{weightNote(periodWeights, PERIODS, normalizedPeriods)}</span>
              </div>
              <WeightBar items={normalizedPeriods ? PERIODS.map((m) => [`${m}M`, normalizedPeriods[m]]) : null} />
              {PERIODS.map((m) => (
                <WeightRow
                  key={m}
                  id={`ind-p-${m}`}
                  label={`${m}M`}
                  value={periodWeights[m]}
                  onChange={(v) => setPeriodWeights((p) => ({ ...p, [m]: v }))}
                />
              ))}
              <div className="sc-actions">
                <span className="muted small">Breadth is shown but never part of the score.</span>
                <button type="button" className="btn ghost sm" onClick={() => setPeriodWeights({ ...DEFAULT_PERIOD_WEIGHTS })}>
                  Reset to 40 / 30 / 30
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
            placeholder="Search industry or sector"
            aria-label="Search industries"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <span className="spacer" />
        <span className="muted small">Per period, show</span>
        <Segmented label="Metrics per period" options={METRICS} value={metrics} onChange={toggleMetric} />
      </div>

      {error && data && (
        <div className="banner error" role="alert">
          <Icon name="alert" />
          Couldn't refresh the data ({error}). Showing the last data that loaded.
        </div>
      )}

      <section className="card table-card">
        {error && !data ? (
          <StateBlock
            kind="error"
            title="Couldn't load industry momentum"
            actions={
              <button type="button" className="btn primary" onClick={refresh}>
                <Icon name="refresh" />
                Try again
              </button>
            }
          >
            The server returned an error ({error}). Your weights are kept.
          </StateBlock>
        ) : showSkeleton ? (
          <div className="skeleton-list" aria-hidden="true">
            {Array.from({ length: 8 }, (_, i) => (
              <Skeleton key={i} width={`${92 - i * 4}%`} />
            ))}
          </div>
        ) : sorted.length === 0 ? (
          <StateBlock
            title="No industries match"
            actions={
              search && (
                <button type="button" className="btn" onClick={() => setSearch('')}>
                  Clear search
                </button>
              )
            }
          >
            {search
              ? `Nothing matches “${search}”. Try a sector name or a shorter word.`
              : `No industry has ${data?.minStocks ?? 3} or more stocks under the current market-cap setting.`}
          </StateBlock>
        ) : (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <SortTh colKey="industry" label="Industry" sort={sort} onSort={toggleSort} rowSpan={2} className="sticky" />
                  <SortTh
                    colKey="eligible"
                    label="Stocks"
                    sort={sort}
                    onSort={toggleSort}
                    rowSpan={2}
                    className="num"
                    title="Stocks included in the calculations (respects the market-cap toggle)"
                  />
                  <SortTh
                    colKey="score"
                    label="Industry score"
                    sort={sort}
                    onSort={toggleSort}
                    rowSpan={2}
                    className="num"
                    title="Weighted blend of the period scores"
                  />
                  {PERIODS.map((m) => (
                    <th key={m} colSpan={metrics.length} className="th-group">
                      {m}M<span className="th-group-sub">{periodDescription(m).toLowerCase()}</span>
                    </th>
                  ))}
                </tr>
                <tr>
                  {PERIODS.map((m) =>
                    metrics.map((metric, i) => (
                      <SortTh
                        key={`${metric}_${m}m`}
                        colKey={`${metric}_${m}m`}
                        label={METRIC_LABELS[metric]}
                        sort={sort}
                        onSort={toggleSort}
                        className={`num${i === 0 ? ' gstart' : ''}`}
                        title={`${METRIC_LABELS[metric]}, ${periodDescription(m).toLowerCase()}`}
                      />
                    ))
                  )}
                </tr>
              </thead>
              <tbody>
                {sorted.map((row) => (
                  <tr
                    key={`${row.sector}|${row.industry}`}
                    className={row.sector ? 'click' : undefined}
                    tabIndex={row.sector ? 0 : undefined}
                    title={row.sector ? `Open the stocks in ${row.industry}` : undefined}
                    onClick={() => goToIndustry(row)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') goToIndustry(row)
                    }}
                  >
                    <td className="sticky">
                      <div className="ind-cell">
                        <b>{row.industry}</b>
                        <span>{row.sector || '—'}</span>
                      </div>
                    </td>
                    <td className="num">{row.eligible}</td>
                    <td className="num">
                      {isNum(row.score) ? (
                        <span className={`score ${tone(row.score)}`}>
                          <DivergingBar value={row.score} max={maxAbsScore} />
                          <b className="tone">{formatPct(row.score)}</b>
                        </span>
                      ) : (
                        <span className="muted" title="A weighted period has too few stocks with returns">
                          —
                        </span>
                      )}
                    </td>
                    {PERIODS.map((m) => metrics.map((metric, i) => renderMetricCell(row, m, metric, i === 0)))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {data && (
          <p className="tbl-foot">
            Returns don't overlap: {PERIODS.map((m) => `${m}M is ${periodDescription(m).toLowerCase()}`).join(', ')}. Stocks
            without a return for a period are left out of that period. Breadth is the share of stocks with a positive
            return; it is shown next to the score but is not part of it.
            {data.excludedIndustries > 0 &&
              ` ${data.excludedIndustries} ${data.excludedIndustries === 1 ? 'industry is' : 'industries are'} hidden because ${data.excludedIndustries === 1 ? 'it has' : 'they have'} fewer than ${data.minStocks} stocks.`}
          </p>
        )}
      </section>
    </div>
  )
}
