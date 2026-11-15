import { useEffect, useRef } from 'react'
import { observer } from 'mobx-react-lite'
import { useStores } from '../../../app/useStores'
import { useActivePage, useController } from '../../../common/hooks/useController'
import { ErrorState, Segmented, Skeleton, Stat, StatSkeleton, StateBlock } from '../../../common/components'
import { formatCompact, formatDate, formatInt, formatPct, formatPrice, tone } from '../../../common/utils/format'
import { OptionChainController, STRIKE_WINDOWS } from '../controllers/OptionChainController'
import type { OptionStrikeDto } from '../services/LiveService'
import { LivePrice } from './LivePrice'

function OiBar({ oi, max, side }: { oi: number | null | undefined; max: number; side: 'call' | 'put' }) {
  const width = oi && max ? (oi / max) * 100 : 0
  return (
    <span className={`oi-cell oi-${side}`}>
      <span className="oi-bar" aria-hidden="true">
        <i style={{ width: `${width}%` }} />
      </span>
      {formatCompact(oi)}
    </span>
  )
}

const StrikeRow = observer(function StrikeRow({ row, controller }: { row: OptionStrikeDto; controller: OptionChainController }) {
  const { live } = useStores()
  const ce = live.tick(row.ce)
  const pe = live.tick(row.pe)
  const isAtm = row.strike === controller.atmStrike
  const maxOi = controller.maxOi
  return (
    <tr className={isAtm ? 'atm' : undefined} data-strike={row.strike}>
      <td className={`num ${controller.isCallInTheMoney(row.strike) ? 'itm' : ''}`}>
        <OiBar oi={ce?.oi} max={maxOi} side="call" />
      </td>
      <td className={`num ${controller.isCallInTheMoney(row.strike) ? 'itm' : ''}`}>
        <span className={`tone ${tone(ce?.changePct)}`}>{formatPct(ce?.changePct, 1)}</span>
      </td>
      <td className={`num ${controller.isCallInTheMoney(row.strike) ? 'itm' : ''}`}>
        <LivePrice tick={ce} />
      </td>
      <td className="num strike">
        {formatInt(row.strike)}
        {isAtm && <span className="tag">ATM</span>}
      </td>
      <td className={`num ${controller.isPutInTheMoney(row.strike) ? 'itm' : ''}`}>
        <LivePrice tick={pe} />
      </td>
      <td className={`num ${controller.isPutInTheMoney(row.strike) ? 'itm' : ''}`}>
        <span className={`tone ${tone(pe?.changePct)}`}>{formatPct(pe?.changePct, 1)}</span>
      </td>
      <td className={`num ${controller.isPutInTheMoney(row.strike) ? 'itm' : ''}`}>
        <OiBar oi={pe?.oi} max={maxOi} side="put" />
      </td>
    </tr>
  )
})

const ChainTable = observer(function ChainTable({ controller }: { controller: OptionChainController }) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const atm = controller.atmStrike
  const centred = useRef(false)

  useEffect(() => {
    if (centred.current || atm === null || controller.spot === null) return
    const row = wrapRef.current?.querySelector<HTMLElement>(`tr[data-strike="${atm}"]`)
    const wrap = wrapRef.current
    if (row && wrap) {
      wrap.scrollTop = row.offsetTop - wrap.clientHeight / 2 + row.offsetHeight / 2
      centred.current = true
    }
  }, [atm, controller.spot])

  return (
    <div className="tbl-wrap chain-wrap" ref={wrapRef}>
      <table className="tbl chain">
        <thead>
          <tr>
            <th colSpan={3} className="th-group">
              Calls
            </th>
            <th rowSpan={2} className="num strike">
              Strike
            </th>
            <th colSpan={3} className="th-group">
              Puts
            </th>
          </tr>
          <tr>
            <th className="num">OI</th>
            <th className="num">Chg %</th>
            <th className="num">LTP</th>
            <th className="num">LTP</th>
            <th className="num">Chg %</th>
            <th className="num">OI</th>
          </tr>
        </thead>
        <tbody>
          {controller.visibleStrikes.map((row) => (
            <StrikeRow key={row.strike} row={row} controller={controller} />
          ))}
        </tbody>
      </table>
    </div>
  )
})

const Summary = observer(function Summary({ controller }: { controller: OptionChainController }) {
  const { live } = useStores()
  const chain = controller.chain
  if (!chain) {
    return (
      <div className="stat-strip">
        <StatSkeleton />
      </div>
    )
  }
  const spotTick = live.tick(chain.spotSymbol)
  const pcr = controller.pcr
  return (
    <div className="stat-strip">
      <Stat
        label={`${chain.underlying} spot`}
        value={<LivePrice tick={spotTick} />}
        sub={<span className={`tone ${tone(spotTick?.changePct)}`}>{formatPct(spotTick?.changePct)} today</span>}
      />
      <Stat label="ATM strike" value={formatInt(controller.atmStrike)} sub="nearest strike to spot" />
      <Stat
        label="Put-call ratio"
        value={pcr === null ? '—' : <span className={`tone ${pcr >= 1 ? 'up' : 'down'}`}>{pcr.toFixed(2)}</span>}
        sub="put OI ÷ call OI, strikes on screen"
      />
      <Stat
        label="Expiry"
        value={controller.daysToExpiry === null ? '—' : `${controller.daysToExpiry}d`}
        sub={`${formatDate(controller.selectedExpiry)}${chain.lotSize ? ` · lot ${chain.lotSize}` : ''}`}
      />
    </div>
  )
})

export const OptionChainPage = observer(function OptionChainPage() {
  const { live, optionChains } = useStores()
  const controller = useController(() => new OptionChainController({ live, chains: optionChains }), [live, optionChains])
  useActivePage(controller)
  const { chain, loadError } = controller
  const notSetUp = live.status === 'unavailable' || loadError?.code === 'not_configured'

  return (
    <div className="page">
      <div className="page-head">
        <h1>Option chain</h1>
        <p className="sub">
          NIFTY options around the at-the-money strike, streamed live. The window re-centres as the index moves and the
          subscriptions follow it.
        </p>
      </div>

      {notSetUp ? (
        <section className="card">
          <StateBlock title="Live feed not set up">
            The option chain streams from the live relay, which isn't deployed yet. Once it runs and LIVE_RELAY_URL is set, this
            page fills in on its own.
          </StateBlock>
        </section>
      ) : (
        <>
          <Summary controller={controller} />
          <div className="toolbar">
            {chain && (
              <label className="small muted">
                Expiry{' '}
                <select value={controller.selectedExpiry ?? ''} onChange={(e) => controller.setExpiry(e.target.value)}>
                  {chain.expiries.map((e) => (
                    <option key={e} value={e}>
                      {formatDate(e)}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <span className="spacer" />
            <span className="muted small">Strikes each side</span>
            <Segmented<number>
              label="Strikes each side of ATM"
              options={STRIKE_WINDOWS.map((n) => [n, `±${n}`] as const)}
              value={controller.strikesEachSide}
              onChange={controller.setStrikesEachSide}
            />
          </div>
          <section className="card table-card">
            {loadError && !chain ? (
              <ErrorState what="the option chain" message={loadError.message} onRetry={controller.refresh} />
            ) : controller.isInitialLoad ? (
              <div className="skeleton-list" aria-busy="true">
                {Array.from({ length: 10 }, (_, i) => (
                  <Skeleton key={i} />
                ))}
              </div>
            ) : (
              <ChainTable controller={controller} />
            )}
            <p className="tbl-foot">
              Shaded cells are in the money. Spot {formatPrice(controller.spot)}. Bars compare open interest across the strikes on
              screen.
            </p>
          </section>
        </>
      )}
    </div>
  )
})
