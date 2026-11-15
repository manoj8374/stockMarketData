import { useEffect, useRef } from 'react'
import { reaction } from 'mobx'
import { observer } from 'mobx-react-lite'
import { useStores } from '../../../../app/useStores'
import { Skeleton } from '../../../../common/components'
import { formatPct, formatSignedMoney, tone } from '../../../../common/utils/format'
import { displaySymbol } from '../../stores/WatchlistStore'
import { LivePrice } from '../LivePrice'
import { createCandleChart, type CandleChartHandle } from './candleChart'

const ChartCanvas = observer(function ChartCanvas({ symbol }: { symbol: string }) {
  const { live, preferences } = useStores()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const theme = preferences.theme
  const hasCandles = live.candles.has(symbol)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !hasCandles) return undefined
    let chart: CandleChartHandle | null = createCandleChart(canvas, live.candles.get(symbol) ?? [])
    const stop = reaction(
      () => live.candles.get(symbol),
      (candles) => chart?.update(candles ?? [])
    )
    return () => {
      stop()
      chart?.destroy()
      chart = null
    }
  }, [live, symbol, theme, hasCandles])

  if (!hasCandles) {
    return (
      <div className="chart-placeholder" aria-busy="true">
        <Skeleton height={200} />
        <span className="muted small">Loading 1-minute candles…</span>
      </div>
    )
  }
  return (
    <div className="chart-box">
      <canvas ref={canvasRef} role="img" aria-label={`${displaySymbol(symbol)} 1-minute candlestick chart`} />
    </div>
  )
})

export const CandleChartPanel = observer(function CandleChartPanel({ symbol }: { symbol: string }) {
  const { live } = useStores()
  const tick = live.tick(symbol)
  const candles = live.candles.get(symbol)

  useEffect(() => live.watchCandles(symbol), [live, symbol])

  return (
    <section className="card chart-card" aria-label={`${displaySymbol(symbol)} chart`}>
      <div className="card-head">
        <h2>
          {displaySymbol(symbol)} <span>1 min</span>
        </h2>
        <div className="chart-quote num">
          <LivePrice tick={tick} />
          <span className={`tone ${tone(tick?.change)}`}>{formatSignedMoney(tick?.change)}</span>
          <span className={`tone ${tone(tick?.changePct)}`}>{formatPct(tick?.changePct)}</span>
        </div>
      </div>
      <ChartCanvas symbol={symbol} />
      <p className="chart-foot muted small">
        {candles
          ? `${candles.length} candles. The last one builds live from incoming ticks.`
          : 'Requesting history from the relay.'}
      </p>
    </section>
  )
})
