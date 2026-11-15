import { makeAutoObservable, observableRef, reaction } from 'mobx'
import type { Resource } from '../../../core/network/Resource'
import type { PageController } from '../../../common/stores/UiStore'
import type { PreferencesStore } from '../../../common/stores/PreferencesStore'
import { Disposer } from '../../../common/utils/Disposer'
import { compareBy, nextSorts, type SortSpec } from '../../../common/utils/sort'
import { loadJSON, saveJSON } from '../../../common/utils/storage'
import type { IndustryMomentumModel, Metric } from '../models/IndustryMomentumModel'
import { PERIODS, type Period } from '../models/industryWeights'
import type { IndustryMomentumData, IndustryMomentumStore } from '../stores/IndustryMomentumStore'

export const METRICS: ReadonlyArray<readonly [Metric, string]> = [
  ['score', 'Score'],
  ['median', 'Median'],
  ['mean', 'Mean'],
  ['breadth', 'Breadth'],
]
const DEFAULT_METRICS: Metric[] = ['score', 'median', 'breadth']
const METRICS_KEY = 'industryMetrics'
const LEADER_COUNT = 5

export interface IndustryRow {
  model: IndustryMomentumModel
  score: number | null
}

function loadMetrics(): Metric[] {
  const saved = loadJSON<unknown>(METRICS_KEY, null)
  if (Array.isArray(saved)) {
    const valid = METRICS.map(([k]) => k).filter((k) => saved.includes(k))
    if (valid.length) return valid
  }
  return [...DEFAULT_METRICS]
}

interface Deps {
  industryMomentum: IndustryMomentumStore
  preferences: PreferencesStore
}

export class IndustriesController implements PageController {
  search = ''
  sorts: SortSpec[] = [{ key: 'score', direction: 'desc' }]
  metrics: Metric[] = loadMetrics()
  scoringOpen = false
  resource: Resource<IndustryMomentumData> | null = null
  private readonly deps: Deps
  private readonly disposer = new Disposer()

  constructor(deps: Deps) {
    this.deps = deps
    makeAutoObservable<IndustriesController, 'deps' | 'disposer'>(
      this,
      { resource: observableRef, deps: false, disposer: false },
      { autoBind: true }
    )
  }

  mount() {
    this.disposer.add(
      reaction(
        () => this.deps.preferences.minMarketCap,
        () => void this.load(),
        { fireImmediately: true }
      )
    )
  }

  dispose() {
    this.disposer.dispose()
  }

  get store() {
    return this.deps.industryMomentum
  }

  load(refresh = false) {
    const minCap = this.deps.preferences.minMarketCap
    this.resource = this.store.resourceFor(minCap)
    return this.store.load(minCap, { refresh })
  }

  refresh() {
    void this.load(true)
  }

  get data() {
    return this.resource?.data ?? null
  }

  get asOf() {
    return this.data?.generatedAt ?? null
  }

  get isRefreshing() {
    return this.resource?.isLoading ?? false
  }

  get isInitialLoad() {
    return !this.resource || (this.resource.data === null && !this.resource.hasFailed)
  }

  get loadError() {
    return this.resource?.error ?? null
  }

  get rows(): IndustryRow[] {
    return (this.data?.industries ?? []).map((model) => ({ model, score: this.store.scoreOf(model) }))
  }

  cellValue(row: IndustryRow, key: string): string | number | null {
    if (key === 'industry') return row.model.industry
    if (key === 'eligible') return row.model.eligible
    if (key === 'score') return row.score
    const [metric, period] = key.split('_') as [Metric, string]
    return row.model.metric(metric, Number(period) as Period, this.store.normalizedBlend)
  }

  get filtered() {
    const q = this.search.trim().toLowerCase()
    if (!q) return this.rows
    return this.rows.filter((r) => r.model.industry.toLowerCase().includes(q) || (r.model.sector ?? '').toLowerCase().includes(q))
  }

  get effectiveSorts(): SortSpec[] {
    const visible = (key: string) => !key.includes('_') || this.metrics.includes(key.split('_')[0] as Metric)
    const sorts = this.sorts.filter((s) => visible(s.key))
    return sorts.length ? sorts : [{ key: 'score', direction: 'desc' }]
  }

  get sorted() {
    return [...this.filtered].sort(compareBy(this.effectiveSorts, this.cellValue, (key) => key === 'industry'))
  }

  sortBy(key: string, additive = false) {
    this.sorts = nextSorts(this.effectiveSorts, key, additive, key === 'industry' ? 'asc' : 'desc')
  }

  setSearch(value: string) {
    this.search = value
  }

  toggleMetric(metric: Metric) {
    if (this.metrics.includes(metric)) {
      if (this.metrics.length === 1) return
      this.metrics = this.metrics.filter((m) => m !== metric)
    } else {
      this.metrics = METRICS.map(([k]) => k).filter((k) => k === metric || this.metrics.includes(k))
    }
    saveJSON(METRICS_KEY, this.metrics)
  }

  toggleScoring() {
    this.scoringOpen = !this.scoringOpen
  }

  get ranked() {
    return this.rows.filter((r) => r.score !== null).sort((a, b) => (b.score as number) - (a.score as number))
  }

  get leaderCount() {
    return Math.min(LEADER_COUNT, Math.ceil(this.ranked.length / 2))
  }

  get leaders() {
    return this.ranked.slice(0, this.leaderCount)
  }

  get laggards() {
    return this.ranked.slice(-this.leaderCount).reverse()
  }

  get maxAbsScore() {
    return Math.max(0.01, ...this.ranked.map((r) => Math.abs(r.score as number)))
  }

  get summary() {
    const data = this.data
    const positive = this.ranked.filter((r) => (r.score as number) > 0).length
    let up = 0
    let total = 0
    for (const r of this.rows) {
      const st = r.model.stats(PERIODS[0])
      if (st.positive !== null) {
        up += st.positive
        total += st.count
      }
    }
    return {
      ranked: this.rows.length,
      excluded: data?.excludedIndustries ?? 0,
      minStocks: data?.minStocks ?? 3,
      eligibleStocks: data?.eligibleStocks ?? 0,
      minMarketCap: data?.minMarketCap ?? null,
      positive,
      scoredCount: this.ranked.length,
      breadth: total ? { share: up / total, up, total } : null,
    }
  }
}
