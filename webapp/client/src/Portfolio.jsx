import { useEffect, useRef, useState } from 'react'
import { HeatPct, Icon, Segmented, Skeleton, StateBlock } from './ui'
import { formatMoney, formatPct, formatPrice, formatSignedMoney, isNum, tone } from './format'
import { usePageMeta, useRefreshSignal } from './shell'

const KITE_LOGIN_URL = 'https://kite.zerodha.com/connect/login?api_key=9cdql2a4r4362vdg&v=3'

const DEFAULT_EMA_PERIOD = 15
const EMA_PRESETS = [9, 15, 21, 50, 200]
const ALLOCATION_COLORS = ['var(--c1)', 'var(--c2)', 'var(--c3)', 'var(--c4)', 'var(--c5)']

function loadStoredEmaPeriod() {
  try {
    const saved = Number(localStorage.getItem('portfolioEmaPeriod'))
    return Number.isInteger(saved) && saved >= 2 && saved <= 200 ? saved : DEFAULT_EMA_PERIOD
  } catch {
    return DEFAULT_EMA_PERIOD
  }
}

function PageHead({ children }) {
  return (
    <div className="page-head">
      <div className="ph-row">
        <div>
          <h1>Portfolio</h1>
          <p className="sub">Live holdings and positions from Zerodha Kite, with a trend check against each stock's EMA.</p>
        </div>
        {children}
      </div>
    </div>
  )
}

export default function Portfolio() {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [notConnected, setNotConnected] = useState(false)
  const [loading, setLoading] = useState(true)
  const [emaPeriod, setEmaPeriod] = useState(loadStoredEmaPeriod)
  const [emaInput, setEmaInput] = useState(() => String(loadStoredEmaPeriod()))
  const requestId = useRef(0)

  function load(period) {
    const id = ++requestId.current
    setLoading(true)
    setError(null)
    setNotConnected(false)
    fetch(`/api/portfolio?ema=${period}`)
      .then((r) => r.json().then((body) => ({ ok: r.ok, status: r.status, body })))
      .then(({ ok, status, body }) => {
        if (id !== requestId.current) return
        if (!ok) {
          if (status === 409 && body.error === 'not_connected') {
            setNotConnected(true)
            return
          }
          throw new Error(body.error || `Request failed: ${status}`)
        }
        setData(body)
      })
      .catch((e) => {
        if (id === requestId.current) setError(e.message)
      })
      .finally(() => {
        if (id === requestId.current) setLoading(false)
      })
  }

  useEffect(() => {
    load(emaPeriod)
    try {
      localStorage.setItem('portfolioEmaPeriod', String(emaPeriod))
    } catch {
      // storage unavailable
    }
  }, [emaPeriod])

  useRefreshSignal(() => load(emaPeriod))
  usePageMeta(data?.generatedAt, loading)

  function choosePeriod(n) {
    setEmaInput(String(n))
    setEmaPeriod(n)
  }

  function commitEmaPeriod() {
    const n = parseInt(emaInput, 10)
    const clamped = Number.isFinite(n) ? Math.min(200, Math.max(2, n)) : emaPeriod
    setEmaInput(String(clamped))
    if (clamped !== emaPeriod) setEmaPeriod(clamped)
  }

  if (notConnected) {
    return (
      <div className="page">
        <PageHead />
        <section className="card connect">
          <span className="connect-icon">
            <Icon name="plug" />
          </span>
          <h2>Connect your Kite account</h2>
          <p>
            Holdings and positions load live from Zerodha Kite. Kite isn't connected yet, or today's session has expired.
            Kite access tokens expire daily, so this can happen once a day.
          </p>
          <a className="btn primary" href={KITE_LOGIN_URL}>
            Connect to Kite
          </a>
          <p className="small muted">You sign in on kite.zerodha.com and come straight back here.</p>
        </section>
      </div>
    )
  }

  if (error && !data) {
    return (
      <div className="page">
        <PageHead />
        <section className="card">
          <StateBlock
            kind="error"
            title="Couldn't load your portfolio"
            actions={
              <>
                <button type="button" className="btn primary" onClick={() => load(emaPeriod)}>
                  <Icon name="refresh" />
                  Try again
                </button>
                <a className="btn" href={KITE_LOGIN_URL}>
                  Reconnect Kite
                </a>
              </>
            }
          >
            {error}. Wait a few seconds and try again. If it keeps failing, reconnect Kite.
          </StateBlock>
        </section>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="page" aria-busy="true">
        <PageHead />
        <div className="kpis">
          {[0, 1, 2, 3].map((i) => (
            <div className="card kpi" key={i} aria-hidden="true">
              <Skeleton width="50%" />
              <Skeleton width="70%" height={22} />
              <Skeleton width="40%" />
            </div>
          ))}
        </div>
        <section className="card skeleton-list" aria-hidden="true">
          {Array.from({ length: 7 }, (_, i) => (
            <Skeleton key={i} />
          ))}
        </section>
      </div>
    )
  }

  const { holdings, positions, summary } = data
  const rows = holdings.map((h) => {
    const value = h.last_price * h.quantity
    const invested = h.average_price * h.quantity
    const gap = isNum(h.ema) && h.ema > 0 ? (h.last_price / h.ema - 1) * 100 : null
    return { ...h, value, invested, gap, returnPct: invested > 0 ? (h.pnl / invested) * 100 : null }
  })
  const holdingsReturn =
    summary.totalInvestment > 0 ? ((summary.currentValue - summary.totalInvestment) / summary.totalInvestment) * 100 : null
  const prevValue = summary.currentValue - summary.dayPnl
  const dayPct = prevValue > 0 ? (summary.dayPnl / prevValue) * 100 : null
  const holdingsPnl = rows.reduce((acc, h) => acc + (Number(h.pnl) || 0), 0)
  const belowEma = rows.filter((h) => h.ema_signal === 'below').length

  const byValue = [...rows].sort((a, b) => b.value - a.value)
  const top = byValue.slice(0, 5)
  const otherValue = byValue.slice(5).reduce((acc, h) => acc + h.value, 0)
  const allocation = [
    ...top.map((h, i) => ({ label: h.tradingsymbol, value: h.value, color: ALLOCATION_COLORS[i] })),
    ...(otherValue > 0 ? [{ label: 'Others', value: otherValue, color: 'var(--c6)' }] : []),
  ].filter((a) => a.value > 0)
  const allocationTotal = allocation.reduce((acc, a) => acc + a.value, 0)
  const share = (v) => (allocationTotal > 0 ? `${Math.round((v / allocationTotal) * 100)}%` : '—')

  return (
    <div className="page">
      <PageHead>
        <div className="ema-ctl">
          <span className="status">
            <i />
            Kite connected
          </span>
          <a className="btn sm" href={KITE_LOGIN_URL}>
            Reconnect
          </a>
        </div>
      </PageHead>

      {error && (
        <div className="banner error" role="alert">
          <Icon name="alert" />
          Couldn't refresh ({error}). Showing the last data that loaded.
        </div>
      )}

      <div className="kpis">
        <div className="card kpi">
          <span className="kpi-k">Invested</span>
          <span className="kpi-v">{formatMoney(summary.totalInvestment, 0)}</span>
          <span className="kpi-s">
            {rows.length} {rows.length === 1 ? 'holding' : 'holdings'}
          </span>
        </div>
        <div className="card kpi">
          <span className="kpi-k">Current value</span>
          <span className="kpi-v">{formatMoney(summary.currentValue, 0)}</span>
          <span className="kpi-s">
            <span className={`tone ${tone(holdingsReturn)}`}>{formatPct(holdingsReturn)}</span> vs invested
          </span>
        </div>
        <div className={`card kpi ${tone(summary.totalPnl)}`}>
          <span className="kpi-k">Total P&amp;L</span>
          <span className="kpi-v tone">{formatSignedMoney(summary.totalPnl, 0)}</span>
          <span className="kpi-s">Holdings plus open positions</span>
        </div>
        <div className={`card kpi ${tone(summary.dayPnl)}`}>
          <span className="kpi-k">Today's P&amp;L</span>
          <span className="kpi-v tone">{formatSignedMoney(summary.dayPnl, 0)}</span>
          <span className="kpi-s">
            <span className="tone">{formatPct(dayPct)}</span> since yesterday's close
          </span>
        </div>
      </div>

      {allocation.length > 0 && (
        <section className="card alloc">
          <div className="lbl flush">
            Allocation by current value <span className="muted">{byValue.length > 5 ? 'largest 5 shown' : ''}</span>
          </div>
          <div className="abar" role="img" aria-label="Allocation by current value">
            {allocation.map((a) => (
              <i key={a.label} style={{ flexGrow: a.value, background: a.color }} title={`${a.label} ${share(a.value)}`} />
            ))}
          </div>
          <div className="legend">
            {allocation.map((a) => (
              <span key={a.label}>
                <i style={{ background: a.color }} />
                {a.label} <b>{share(a.value)}</b>
              </span>
            ))}
          </div>
        </section>
      )}

      <section className="card table-card">
        <div className="card-head">
          <h2>
            Holdings <span>{rows.length}</span>
          </h2>
          <div className="ema-ctl">
            <span className="muted small">Trend line</span>
            <Segmented
              label="EMA period"
              options={EMA_PRESETS.map((n) => [n, `EMA ${n}`])}
              value={emaPeriod}
              onChange={choosePeriod}
              size="sm"
            />
            <label className="small muted" htmlFor="ema-custom">
              Custom
            </label>
            <input
              id="ema-custom"
              type="number"
              min={2}
              max={200}
              value={emaInput}
              onChange={(e) => setEmaInput(e.target.value)}
              onBlur={commitEmaPeriod}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitEmaPeriod()
              }}
            />
            <span className="muted small">days</span>
          </div>
        </div>
        {rows.length === 0 ? (
          <StateBlock title="No holdings">Stocks you hold in your Kite demat account show up here.</StateBlock>
        ) : (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th className="sticky">Stock</th>
                  <th className="num">Qty</th>
                  <th className="num">Avg cost</th>
                  <th className="num">LTP</th>
                  <th className="num">Today</th>
                  <th className="num">EMA {emaPeriod}</th>
                  <th>Trend</th>
                  <th className="num">Value</th>
                  <th className="num">P&amp;L</th>
                  <th className="num">Return</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((h) => (
                  <tr key={h.tradingsymbol}>
                    <td className="sticky">
                      <span className="sym">{h.tradingsymbol}</span>
                    </td>
                    <td className="num">{h.quantity}</td>
                    <td className="num">{formatPrice(h.average_price)}</td>
                    <td className="num">{formatPrice(h.last_price)}</td>
                    <td className="num">
                      <span className={`tone ${tone(h.day_change_percentage)}`}>{formatPct(h.day_change_percentage)}</span>
                    </td>
                    <td className="num">{formatPrice(h.ema)}</td>
                    <td>
                      {h.ema_signal ? (
                        <span className={`pill ${h.ema_signal === 'above' ? 'up' : 'down'}`}>
                          {h.ema_signal === 'above' ? '▲ Above' : '▼ Below'}
                          {isNum(h.gap) && <b>{formatPct(h.gap, 1)}</b>}
                        </span>
                      ) : (
                        <span className="muted" title="Not enough price history for this EMA">
                          —
                        </span>
                      )}
                    </td>
                    <td className="num">{formatMoney(h.value)}</td>
                    <td className="num">
                      <span className={`tone ${tone(h.pnl)}`}>{formatSignedMoney(h.pnl)}</span>
                    </td>
                    <td className="num">
                      <HeatPct value={h.returnPct} />
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td className="sticky">Total</td>
                  <td />
                  <td />
                  <td />
                  <td />
                  <td />
                  <td className="small muted">{belowEma > 0 ? `${belowEma} below EMA` : 'All at or above EMA'}</td>
                  <td className="num">{formatMoney(summary.currentValue)}</td>
                  <td className="num">
                    <span className={`tone ${tone(holdingsPnl)}`}>{formatSignedMoney(holdingsPnl)}</span>
                  </td>
                  <td className="num">
                    <HeatPct value={holdingsReturn} />
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>

      <section className="card table-card">
        <div className="card-head">
          <h2>
            Positions <span>{positions.length}</span>
          </h2>
          <span className="muted small">Today's net positions from Kite</span>
        </div>
        {positions.length === 0 ? (
          <StateBlock title="No open positions">Positions you open today show up here.</StateBlock>
        ) : (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th className="sticky">Stock</th>
                  <th>Product</th>
                  <th className="num">Qty</th>
                  <th className="num">Avg price</th>
                  <th className="num">LTP</th>
                  <th className="num">P&amp;L</th>
                  <th className="num">M2M</th>
                </tr>
              </thead>
              <tbody>
                {positions.map((p) => (
                  <tr key={`${p.tradingsymbol}-${p.product}`}>
                    <td className="sticky">
                      <span className="sym">{p.tradingsymbol}</span>
                    </td>
                    <td>
                      <span className="prod">{p.product}</span>
                    </td>
                    <td className="num">
                      {p.quantity < 0 ? <span className="tone down">{p.quantity} short</span> : p.quantity}
                    </td>
                    <td className="num">{formatPrice(p.average_price)}</td>
                    <td className="num">{formatPrice(p.last_price)}</td>
                    <td className="num">
                      <span className={`tone ${tone(p.pnl)}`}>{formatSignedMoney(p.pnl)}</span>
                    </td>
                    <td className="num">
                      <span className={`tone ${tone(p.m2m)}`}>{formatSignedMoney(p.m2m)}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
