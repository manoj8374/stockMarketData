import { useEffect, useState } from 'react'

const KITE_LOGIN_URL = 'https://kite.zerodha.com/connect/login?api_key=9cdql2a4r4362vdg&v=3'

function formatMoney(v) {
  if (v === null || v === undefined) return '—'
  return `₹${Number(v).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
}

function formatPct(v) {
  if (v === null || v === undefined) return '—'
  const n = Number(v)
  const sign = n > 0 ? '+' : ''
  return `${sign}${n.toFixed(2)}%`
}

function pnlClass(v) {
  if (v === null || v === undefined) return ''
  return Number(v) >= 0 ? 'positive' : 'negative'
}

function formatEma(v) {
  if (v === null || v === undefined) return '—'
  return Number(v).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// LTP below its EMA reads as bearish (price under its trend line) -- shown
// in the "negative" color for consistency with how the rest of the app
// colors downside, even though this isn't itself a P&L figure.
function emaSignalLabel(signal) {
  if (signal === 'below') return { text: 'Below', cls: 'negative' }
  if (signal === 'above') return { text: 'Above', cls: 'positive' }
  return { text: '—', cls: '' }
}

const DEFAULT_EMA_PERIOD = 15

function loadStoredEmaPeriod() {
  const saved = Number(localStorage.getItem('portfolioEmaPeriod'))
  return Number.isInteger(saved) && saved >= 2 && saved <= 200 ? saved : DEFAULT_EMA_PERIOD
}

export default function Portfolio() {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [notConnected, setNotConnected] = useState(false)
  const [loading, setLoading] = useState(true)
  const [emaPeriod, setEmaPeriod] = useState(loadStoredEmaPeriod)
  const [emaInput, setEmaInput] = useState(String(loadStoredEmaPeriod()))

  function load(period) {
    setLoading(true)
    setError(null)
    setNotConnected(false)
    fetch(`/api/portfolio?ema=${period}`)
      .then((r) => r.json().then((data) => ({ ok: r.ok, status: r.status, data })))
      .then(({ ok, status, data }) => {
        if (!ok) {
          if (status === 409 && data.error === 'not_connected') {
            setNotConnected(true)
            return
          }
          throw new Error(data.error || `Request failed: ${status}`)
        }
        setData(data)
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load(emaPeriod)
    localStorage.setItem('portfolioEmaPeriod', String(emaPeriod))
  }, [emaPeriod])

  function commitEmaPeriod() {
    const n = parseInt(emaInput, 10)
    const clamped = Number.isFinite(n) ? Math.min(200, Math.max(2, n)) : emaPeriod
    setEmaInput(String(clamped))
    if (clamped !== emaPeriod) setEmaPeriod(clamped)
  }

  if (loading) return <div className="empty-state">Loading portfolio…</div>

  if (notConnected) {
    return (
      <div className="portfolio-connect">
        <p>Kite isn't connected yet, or the token has expired.</p>
        <a className="btn" href={KITE_LOGIN_URL}>Connect to Kite</a>
      </div>
    )
  }

  if (error) {
    return (
      <div className="portfolio-connect">
        <div className="banner error">Failed to load portfolio: {error}</div>
        <a className="btn" href={KITE_LOGIN_URL}>Reconnect to Kite</a>
      </div>
    )
  }

  const { holdings, positions, summary, generatedAt } = data

  return (
    <div>
      <div className="controls">
        <span className="muted small">Data as of {new Date(generatedAt).toLocaleString()}</span>
        <button className="btn" onClick={() => load(emaPeriod)}>Refresh</button>
        <a className="btn subtle" href={KITE_LOGIN_URL}>Reconnect to Kite</a>
      </div>

      <div className="summary-cards">
        <div className="summary-card">
          <span className="muted small">Total Investment</span>
          <strong>{formatMoney(summary.totalInvestment)}</strong>
        </div>
        <div className="summary-card">
          <span className="muted small">Current Value</span>
          <strong>{formatMoney(summary.currentValue)}</strong>
        </div>
        <div className="summary-card">
          <span className="muted small">Total P&amp;L</span>
          <strong className={pnlClass(summary.totalPnl)}>{formatMoney(summary.totalPnl)}</strong>
        </div>
        <div className="summary-card">
          <span className="muted small">Day's P&amp;L</span>
          <strong className={pnlClass(summary.dayPnl)}>{formatMoney(summary.dayPnl)}</strong>
        </div>
      </div>

      <div className="holdings-head-row">
        <h3>Holdings</h3>
        <label className="ema-period-input">
          <span className="muted small">EMA period</span>
          <input
            type="number"
            min={2}
            max={200}
            value={emaInput}
            onChange={(e) => setEmaInput(e.target.value)}
            onBlur={commitEmaPeriod}
            onKeyDown={(e) => { if (e.key === 'Enter') commitEmaPeriod() }}
          />
          <span className="muted small">days</span>
        </label>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Symbol</th>
              <th>Qty</th>
              <th>Avg Price</th>
              <th>LTP</th>
              <th>EMA({emaPeriod})</th>
              <th>vs EMA</th>
              <th>Current Value</th>
              <th>P&amp;L</th>
              <th>Day Change</th>
            </tr>
          </thead>
          <tbody>
            {holdings.length === 0 ? (
              <tr><td colSpan={9} className="empty-state">No holdings.</td></tr>
            ) : (
              holdings.map((h) => {
                const signal = emaSignalLabel(h.ema_signal)
                return (
                <tr key={h.tradingsymbol}>
                  <td className="symbol-cell">{h.tradingsymbol}</td>
                  <td className="num">{h.quantity}</td>
                  <td className="num">{formatMoney(h.average_price)}</td>
                  <td className="num">{formatMoney(h.last_price)}</td>
                  <td className="num">{formatEma(h.ema)}</td>
                  <td className={`num pct ${signal.cls}`}>{signal.text}</td>
                  <td className="num">{formatMoney(h.last_price * h.quantity)}</td>
                  <td className={`num pct ${pnlClass(h.pnl)}`}>{formatMoney(h.pnl)}</td>
                  <td className={`num pct ${pnlClass(h.day_change)}`}>{formatPct(h.day_change_percentage)}</td>
                </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      <h3>Positions</h3>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Symbol</th>
              <th>Product</th>
              <th>Qty</th>
              <th>Avg Price</th>
              <th>LTP</th>
              <th>P&amp;L</th>
              <th>M2M</th>
            </tr>
          </thead>
          <tbody>
            {positions.length === 0 ? (
              <tr><td colSpan={7} className="empty-state">No open positions.</td></tr>
            ) : (
              positions.map((p) => (
                <tr key={`${p.tradingsymbol}-${p.product}`}>
                  <td className="symbol-cell">{p.tradingsymbol}</td>
                  <td>{p.product}</td>
                  <td className="num">{p.quantity}</td>
                  <td className="num">{formatMoney(p.average_price)}</td>
                  <td className="num">{formatMoney(p.last_price)}</td>
                  <td className={`num pct ${pnlClass(p.pnl)}`}>{formatMoney(p.pnl)}</td>
                  <td className={`num pct ${pnlClass(p.m2m)}`}>{formatMoney(p.m2m)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
