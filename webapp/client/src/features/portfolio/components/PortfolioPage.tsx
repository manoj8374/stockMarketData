import type { ReactNode } from 'react'
import { observer } from 'mobx-react-lite'
import { useStores } from '../../../app/useStores'
import { useActivePage, useController } from '../../../common/hooks/useController'
import { Banner, HeatPct, Icon, Segmented, Skeleton, StateBlock } from '../../../common/components'
import { formatMoney, formatPct, formatPrice, formatSignedMoney, tone } from '../../../common/utils/format'
import { EMA_PRESETS, PortfolioController } from '../controllers/PortfolioController'
import { EMA_MAX, EMA_MIN } from '../stores/PortfolioStore'

const KITE_LOGIN_URL = 'https://kite.zerodha.com/connect/login?api_key=9cdql2a4r4362vdg&v=3'

function PageHead({ children }: { children?: ReactNode }) {
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

const Kpis = observer(function Kpis({ controller }: { controller: PortfolioController }) {
  const k = controller.kpis
  if (!k) return null
  const count = controller.holdings.length
  return (
    <div className="kpis">
      <div className="card kpi">
        <span className="kpi-k">Invested</span>
        <span className="kpi-v">{formatMoney(k.totalInvestment, 0)}</span>
        <span className="kpi-s">
          {count} {count === 1 ? 'holding' : 'holdings'}
        </span>
      </div>
      <div className="card kpi">
        <span className="kpi-k">Current value</span>
        <span className="kpi-v">{formatMoney(k.currentValue, 0)}</span>
        <span className="kpi-s">
          <span className={`tone ${tone(k.holdingsReturnPct)}`}>{formatPct(k.holdingsReturnPct)}</span> vs invested
        </span>
      </div>
      <div className={`card kpi ${tone(k.totalPnl)}`}>
        <span className="kpi-k">Total P&amp;L</span>
        <span className="kpi-v tone">{formatSignedMoney(k.totalPnl, 0)}</span>
        <span className="kpi-s">Holdings plus open positions</span>
      </div>
      <div className={`card kpi ${tone(k.dayPnl)}`}>
        <span className="kpi-k">Today's P&amp;L</span>
        <span className="kpi-v tone">{formatSignedMoney(k.dayPnl, 0)}</span>
        <span className="kpi-s">
          <span className="tone">{formatPct(k.dayPct)}</span> since yesterday's close
        </span>
      </div>
    </div>
  )
})

const Allocation = observer(function Allocation({ controller }: { controller: PortfolioController }) {
  const slices = controller.allocation
  if (!slices.length) return null
  const pct = (share: number) => `${Math.round(share * 100)}%`
  return (
    <section className="card alloc">
      <div className="lbl flush">
        Allocation by current value <span className="muted">{controller.hasMoreThanShown ? 'largest 5 shown' : ''}</span>
      </div>
      <div className="abar" role="img" aria-label="Allocation by current value">
        {slices.map((s) => (
          <i key={s.label} style={{ flexGrow: s.value, background: s.color }} title={`${s.label} ${pct(s.share)}`} />
        ))}
      </div>
      <div className="legend">
        {slices.map((s) => (
          <span key={s.label}>
            <i style={{ background: s.color }} />
            {s.label} <b>{pct(s.share)}</b>
          </span>
        ))}
      </div>
    </section>
  )
})

const Holdings = observer(function Holdings({ controller }: { controller: PortfolioController }) {
  const { holdings, kpis, emaPeriod } = controller
  return (
    <section className="card table-card">
      <div className="card-head">
        <h2>
          Holdings <span>{holdings.length}</span>
        </h2>
        <div className="ema-ctl">
          <span className="muted small">Trend line</span>
          <Segmented<number>
            label="EMA period"
            options={EMA_PRESETS.map((n) => [n, `EMA ${n}`] as const)}
            value={emaPeriod}
            onChange={controller.choosePeriod}
            size="sm"
          />
          <label className="small muted" htmlFor="ema-custom">
            Custom
          </label>
          <input
            id="ema-custom"
            type="number"
            min={EMA_MIN}
            max={EMA_MAX}
            value={controller.emaInput}
            onChange={(e) => controller.setEmaInput(e.target.value)}
            onBlur={controller.commitEmaInput}
            onKeyDown={(e) => {
              if (e.key === 'Enter') controller.commitEmaInput()
            }}
          />
          <span className="muted small">days</span>
        </div>
      </div>
      {holdings.length === 0 ? (
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
              {holdings.map((h) => (
                <tr key={h.symbol}>
                  <td className="sticky">
                    <span className="sym">{h.symbol}</span>
                  </td>
                  <td className="num">{h.quantity}</td>
                  <td className="num">{formatPrice(h.averagePrice)}</td>
                  <td className="num">{formatPrice(h.lastPrice)}</td>
                  <td className="num">
                    <span className={`tone ${tone(h.dayChangePct)}`}>{formatPct(h.dayChangePct)}</span>
                  </td>
                  <td className="num">{formatPrice(h.ema)}</td>
                  <td>
                    {h.emaSignal ? (
                      <span className={`pill ${h.emaSignal === 'above' ? 'up' : 'down'}`}>
                        {h.emaSignal === 'above' ? '▲ Above' : '▼ Below'}
                        {h.gapToEma !== null && <b>{formatPct(h.gapToEma, 1)}</b>}
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
            {kpis && (
              <tfoot>
                <tr>
                  <td className="sticky">Total</td>
                  <td />
                  <td />
                  <td />
                  <td />
                  <td />
                  <td className="small muted">
                    {controller.belowEmaCount > 0 ? `${controller.belowEmaCount} below EMA` : 'All at or above EMA'}
                  </td>
                  <td className="num">{formatMoney(kpis.currentValue)}</td>
                  <td className="num">
                    <span className={`tone ${tone(kpis.holdingsPnl)}`}>{formatSignedMoney(kpis.holdingsPnl)}</span>
                  </td>
                  <td className="num">
                    <HeatPct value={kpis.holdingsReturnPct} />
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
    </section>
  )
})

const Positions = observer(function Positions({ controller }: { controller: PortfolioController }) {
  const { positions } = controller
  return (
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
                <tr key={p.key}>
                  <td className="sticky">
                    <span className="sym">{p.symbol}</span>
                  </td>
                  <td>
                    <span className="prod">{p.product}</span>
                  </td>
                  <td className="num">{p.isShort ? <span className="tone down">{p.quantity} short</span> : p.quantity}</td>
                  <td className="num">{formatPrice(p.averagePrice)}</td>
                  <td className="num">{formatPrice(p.lastPrice)}</td>
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
  )
})

export const PortfolioPage = observer(function PortfolioPage() {
  const { portfolio } = useStores()
  const controller = useController(() => new PortfolioController(portfolio), [portfolio])
  useActivePage(controller)
  const { loadError, isNotConnected } = controller

  if (isNotConnected) {
    return (
      <div className="page">
        <PageHead />
        <section className="card connect">
          <span className="connect-icon">
            <Icon name="plug" />
          </span>
          <h2>Connect your Kite account</h2>
          <p>
            Holdings and positions load live from Zerodha Kite. Kite isn't connected yet, or today's session has expired. Kite
            access tokens expire daily, so this can happen once a day.
          </p>
          <a className="btn primary" href={KITE_LOGIN_URL}>
            Connect to Kite
          </a>
          <p className="small muted">You sign in on kite.zerodha.com and come straight back here.</p>
        </section>
      </div>
    )
  }

  if (loadError && !controller.portfolio) {
    return (
      <div className="page">
        <PageHead />
        <section className="card">
          <StateBlock
            kind="error"
            title="Couldn't load your portfolio"
            actions={
              <>
                <button type="button" className="btn primary" onClick={controller.refresh}>
                  <Icon name="refresh" />
                  Try again
                </button>
                <a className="btn" href={KITE_LOGIN_URL}>
                  Reconnect Kite
                </a>
              </>
            }
          >
            {loadError.message}. Wait a few seconds and try again. If it keeps failing, reconnect Kite.
          </StateBlock>
        </section>
      </div>
    )
  }

  if (!controller.portfolio) {
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
      {loadError && <Banner>Couldn't refresh ({loadError.message}). Showing the last data that loaded.</Banner>}
      <Kpis controller={controller} />
      <Allocation controller={controller} />
      <Holdings controller={controller} />
      <Positions controller={controller} />
    </div>
  )
})
