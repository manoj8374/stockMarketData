import { Chart, LinearScale, TimeScale, TimeSeriesScale, Tooltip, type FinancialDataPoint } from 'chart.js'
import 'chartjs-adapter-date-fns'
import { CandlestickController, CandlestickElement } from 'chartjs-chart-financial'
import type { Candle } from '../../models/candles'

Chart.register(CandlestickController, CandlestickElement, TimeScale, TimeSeriesScale, LinearScale, Tooltip)

export interface CandleChartHandle {
  update(candles: readonly Candle[]): void
  destroy(): void
}

const toPoints = (candles: readonly Candle[]): FinancialDataPoint[] =>
  candles.map((c) => ({ x: c.t, o: c.o, h: c.h, l: c.l, c: c.c }))

function themeColors() {
  const css = getComputedStyle(document.documentElement)
  const get = (name: string) => css.getPropertyValue(name).trim()
  return { up: get('--up'), down: get('--down'), muted: get('--muted'), line: get('--line-soft'), fg: get('--fg-2') }
}

// The only module that touches Chart.js. Live updates replace the dataset and
// redraw without animation, which is cheap enough to do once per frame.
export function createCandleChart(canvas: HTMLCanvasElement, candles: readonly Candle[]): CandleChartHandle {
  const colors = themeColors()
  const chart = new Chart(canvas, {
    type: 'candlestick',
    data: {
      datasets: [
        {
          data: toPoints(candles),
          backgroundColors: { up: colors.up, down: colors.down, unchanged: colors.muted },
          borderColors: { up: colors.up, down: colors.down, unchanged: colors.muted },
        },
      ],
    },
    options: {
      animation: false,
      maintainAspectRatio: false,
      parsing: false,
      plugins: { legend: { display: false }, tooltip: { intersect: false, mode: 'index' } },
      scales: {
        x: {
          type: 'timeseries',
          time: { unit: 'minute', displayFormats: { minute: 'HH:mm' } },
          ticks: { color: colors.muted, maxRotation: 0, autoSkip: true, maxTicksLimit: 8 },
          grid: { color: colors.line },
        },
        y: { position: 'right', ticks: { color: colors.fg }, grid: { color: colors.line } },
      },
    },
  })

  return {
    update(next) {
      chart.data.datasets[0].data = toPoints(next)
      chart.update('none')
    },
    destroy() {
      chart.destroy()
    },
  }
}
