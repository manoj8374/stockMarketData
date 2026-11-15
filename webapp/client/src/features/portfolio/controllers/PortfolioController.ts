import { makeAutoObservable, reaction } from 'mobx'
import type { PageController } from '../../../common/stores/UiStore'
import { Disposer } from '../../../common/utils/Disposer'
import { clampEmaPeriod, type PortfolioStore } from '../stores/PortfolioStore'

export const EMA_PRESETS = [9, 15, 21, 50, 200] as const
const ALLOCATION_SLOTS = 5

export interface AllocationSlice {
  label: string
  value: number
  share: number
  color: string
}

export class PortfolioController implements PageController {
  emaInput: string
  private readonly store: PortfolioStore
  private readonly disposer = new Disposer()

  constructor(store: PortfolioStore) {
    this.store = store
    this.emaInput = String(store.emaPeriod)
    makeAutoObservable<PortfolioController, 'store' | 'disposer'>(this, { store: false, disposer: false }, { autoBind: true })
  }

  mount() {
    this.disposer.add(
      reaction(
        () => this.store.emaPeriod,
        () => void this.store.load(),
        { fireImmediately: true }
      )
    )
  }

  dispose() {
    this.disposer.dispose()
  }

  refresh() {
    void this.store.load()
  }

  get resource() {
    return this.store.portfolio
  }

  get portfolio() {
    return this.store.portfolio.data
  }

  get asOf() {
    return this.portfolio?.generatedAt ?? null
  }

  get isRefreshing() {
    return this.store.portfolio.isLoading
  }

  get isNotConnected() {
    return this.store.isNotConnected
  }

  get loadError() {
    return this.isNotConnected ? null : this.store.portfolio.error
  }

  get emaPeriod() {
    return this.store.emaPeriod
  }

  choosePeriod(period: number) {
    this.store.setEmaPeriod(period)
    this.emaInput = String(this.store.emaPeriod)
  }

  setEmaInput(value: string) {
    this.emaInput = value
  }

  commitEmaInput() {
    const period = clampEmaPeriod(this.emaInput, this.store.emaPeriod)
    this.emaInput = String(period)
    if (period !== this.store.emaPeriod) this.store.setEmaPeriod(period)
  }

  get holdings() {
    return this.portfolio?.holdings ?? []
  }

  get positions() {
    return this.portfolio?.positions ?? []
  }

  get kpis() {
    const summary = this.portfolio?.summary
    if (!summary) return null
    const previousValue = summary.currentValue - summary.dayPnl
    return {
      ...summary,
      holdingsReturnPct:
        summary.totalInvestment > 0 ? ((summary.currentValue - summary.totalInvestment) / summary.totalInvestment) * 100 : null,
      dayPct: previousValue > 0 ? (summary.dayPnl / previousValue) * 100 : null,
      holdingsPnl: this.holdings.reduce((acc, h) => acc + h.pnl, 0),
    }
  }

  get belowEmaCount() {
    return this.holdings.filter((h) => h.emaSignal === 'below').length
  }

  get allocation(): AllocationSlice[] {
    const byValue = [...this.holdings].filter((h) => h.value > 0).sort((a, b) => b.value - a.value)
    const total = byValue.reduce((acc, h) => acc + h.value, 0)
    if (total <= 0) return []
    const slices = byValue
      .slice(0, ALLOCATION_SLOTS)
      .map((h, i) => ({ label: h.symbol, value: h.value, color: `var(--c${i + 1})` }))
    const rest = byValue.slice(ALLOCATION_SLOTS).reduce((acc, h) => acc + h.value, 0)
    if (rest > 0) slices.push({ label: 'Others', value: rest, color: 'var(--c6)' })
    return slices.map((s) => ({ ...s, share: s.value / total }))
  }

  get hasMoreThanShown() {
    return this.holdings.length > ALLOCATION_SLOTS
  }
}
