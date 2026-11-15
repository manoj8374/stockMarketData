import { observer } from 'mobx-react-lite'
import { useStores } from '../../../app/useStores'
import { useActivePage, useController } from '../../../common/hooks/useController'
import { Icon, StateBlock } from '../../../common/components'
import { formatCompact, formatPct, formatSignedMoney, tone } from '../../../common/utils/format'
import { WatchlistController } from '../controllers/WatchlistController'
import { displaySymbol } from '../stores/WatchlistStore'
import { LivePrice } from './LivePrice'
import { CandleChartPanel } from './chart/CandleChartPanel'

interface RowProps {
  symbol: string
  selected: boolean
  index: number
  count: number
  controller: WatchlistController
}

// Each row observes only its own TickModel, so a price update re-renders one
// row instead of the whole table.
const WatchRow = observer(function WatchRow({ symbol, selected, index, count, controller }: RowProps) {
  const { live } = useStores()
  const tick = live.tick(symbol)
  return (
    <tr
      className={`click ${selected ? 'selected' : ''}`}
      tabIndex={0}
      aria-selected={selected}
      onClick={() => controller.select(symbol)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') controller.select(symbol)
      }}
    >
      <td className="sticky">
        <span className="sym">{displaySymbol(symbol)}</span>
      </td>
      <td className="num">
        <LivePrice tick={tick} />
      </td>
      <td className="num">
        <span className={`tone ${tone(tick?.change)}`}>{formatSignedMoney(tick?.change)}</span>
      </td>
      <td className="num">
        <span className={`tone ${tone(tick?.changePct)}`}>{formatPct(tick?.changePct)}</span>
      </td>
      <td className="num">{formatCompact(tick?.volume)}</td>
      <td className="row-actions">
        <button
          type="button"
          className="icon-btn plain"
          aria-label={`Move ${displaySymbol(symbol)} up`}
          disabled={index === 0}
          onClick={(e) => {
            e.stopPropagation()
            controller.move(symbol, -1)
          }}
        >
          <Icon name="chevronUp" />
        </button>
        <button
          type="button"
          className="icon-btn plain"
          aria-label={`Move ${displaySymbol(symbol)} down`}
          disabled={index === count - 1}
          onClick={(e) => {
            e.stopPropagation()
            controller.move(symbol, 1)
          }}
        >
          <Icon name="chevronDown" />
        </button>
        <button
          type="button"
          className="icon-btn plain"
          aria-label={`Remove ${displaySymbol(symbol)}`}
          onClick={(e) => {
            e.stopPropagation()
            controller.remove(symbol)
          }}
        >
          <Icon name="trash" />
        </button>
      </td>
    </tr>
  )
})

const AddSymbol = observer(function AddSymbol({ controller }: { controller: WatchlistController }) {
  const { results, suggestions, query } = controller
  const showList = query.trim() !== ''
  return (
    <div className="symbol-search">
      <div className="search">
        <Icon name="search" />
        <input
          type="search"
          placeholder="Add a stock or index, e.g. RELIANCE"
          aria-label="Add to watchlist"
          aria-autocomplete="list"
          aria-controls="symbol-suggestions"
          value={query}
          onChange={(e) => controller.setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && suggestions[0]) controller.add(suggestions[0].symbol)
            if (e.key === 'Escape') controller.setQuery('')
          }}
        />
      </div>
      {showList && (
        <ul className="suggestions" id="symbol-suggestions" role="listbox">
          {results.isLoading && !results.data ? (
            <li className="muted small">Searching…</li>
          ) : results.hasFailed ? (
            <li className="muted small">Search isn't available right now ({results.error?.message}).</li>
          ) : suggestions.length === 0 ? (
            <li className="muted small">No matches for “{query}”.</li>
          ) : (
            suggestions.map((i) => (
              <li key={i.symbol} role="option" aria-selected={false}>
                <button type="button" onClick={() => controller.add(i.symbol)}>
                  <b>{displaySymbol(i.symbol)}</b>
                  <span>{i.name}</span>
                  <span className="tagn">{i.type === 'INDEX' ? 'Index' : i.exchange}</span>
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  )
})

export const WatchlistPage = observer(function WatchlistPage() {
  const { live, watchlist, services } = useStores()
  const controller = useController(
    () => new WatchlistController({ live, watchlist, service: services.live }),
    [live, watchlist, services]
  )
  useActivePage(controller)
  const { symbols, chartSymbol } = controller

  return (
    <div className="page">
      <div className="page-head">
        <h1>Watchlist</h1>
        <p className="sub">
          Live prices over WebSocket. Updates are batched once per frame, and each row re-renders only when its own price moves.
        </p>
      </div>

      {live.status === 'unavailable' ? (
        <section className="card">
          <StateBlock title="Live feed not set up">
            The live relay isn't deployed yet, so there are no streaming prices. Once it runs and LIVE_RELAY_URL is set, this page
            fills in on its own.
          </StateBlock>
        </section>
      ) : (
        <div className={`watch-layout ${chartSymbol ? 'has-chart' : ''}`}>
          <section
            className={`card table-card ${live.isLive ? '' : 'is-stale'}`}
            title={live.isLive ? undefined : 'Showing the last prices received'}
          >
            <div className="card-head">
              <h2>
                Symbols <span>{symbols.length}</span>
              </h2>
              <AddSymbol controller={controller} />
            </div>
            {symbols.length === 0 ? (
              <StateBlock title="Your watchlist is empty">Search above to add a stock or an index.</StateBlock>
            ) : (
              <div className="tbl-wrap">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th className="sticky">Symbol</th>
                      <th className="num">LTP</th>
                      <th className="num">Change</th>
                      <th className="num">Change %</th>
                      <th className="num">Volume</th>
                      <th>
                        <span className="sr-only">Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {symbols.map((symbol, index) => (
                      <WatchRow
                        key={symbol}
                        symbol={symbol}
                        index={index}
                        count={symbols.length}
                        selected={symbol === chartSymbol}
                        controller={controller}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
          {chartSymbol && <CandleChartPanel key={chartSymbol} symbol={chartSymbol} />}
        </div>
      )}
    </div>
  )
})
