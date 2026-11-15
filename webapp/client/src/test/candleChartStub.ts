import type { Candle } from '../features/live/models/candles'

// Stands in for the Chart.js module in tests (jsdom has no canvas).
export const charts: Array<{ candles: readonly Candle[]; updates: number; destroyed: boolean }> = []

export function createCandleChart(_canvas: HTMLCanvasElement, candles: readonly Candle[]) {
  const chart = { candles, updates: 0, destroyed: false }
  charts.push(chart)
  return {
    update(next: readonly Candle[]) {
      chart.candles = next
      chart.updates++
    },
    destroy() {
      chart.destroyed = true
    },
  }
}
