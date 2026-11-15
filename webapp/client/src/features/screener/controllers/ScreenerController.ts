import { makeAutoObservable, observableRef, reaction } from 'mobx'
import type { Resource } from '../../../core/network/Resource'
import type { PageController } from '../../../common/stores/UiStore'
import type { PreferencesStore } from '../../../common/stores/PreferencesStore'
import { Disposer } from '../../../common/utils/Disposer'
import { isNum, median } from '../../../common/utils/format'
import { compareBy, nextSorts, type SortSpec } from '../../../common/utils/sort'
import { loadJSON, saveJSON } from '../../../common/utils/storage'
import type { StockModel } from '../models/StockModel'
import {
  backScoreWeights,
  DEFAULT_MONTHS,
  DEFAULT_WEIGHTS,
  normalizeWeights,
  rawWeightSum,
  type Weights,
} from '../models/weights'
import { StocksStore, type StockList } from '../stores/StocksStore'
import type { StocksQuery } from '../services/StocksService'
import { buildColumns, DEFAULT_HIDDEN_COLUMNS, TEXT_COLUMNS, type Column } from './screenerColumns'

export interface ScoredStock {
  stock: StockModel
  momentum: number | null
  back1: number | null
  back3: number | null
}

export interface Range {
  min: string
  max: string
}

export interface FilterField {
  key: string
  label: string
  unit: string
}

export type Density = 'cozy' | 'compact'

const EMPTY_RANGE: Range = { min: '', max: '' }
const DEFAULT_SORTS: SortSpec[] = [{ key: 'momentum_score', direction: 'desc' }]
const FALLBACK_SORTS: SortSpec[] = [{ key: 'tradingsymbol', direction: 'asc' }]
export const PAGE_SIZE_OPTIONS = [25, 50, 100, 200] as const

const STORAGE = {
  months: 'selectedMonths',
  hidden: 'screenerHiddenColumns',
  legacyHidden: 'hiddenColumns',
  density: 'screenerDensity',
}

function loadMonths() {
  const saved = loadJSON<unknown>(STORAGE.months, null)
  if (Array.isArray(saved)) {
    const valid = [...new Set(saved.filter((m): m is number => Number.isInteger(m) && m >= 1 && m <= 12))].sort((a, b) => a - b)
    if (valid.length) return valid
  }
  return [...DEFAULT_MONTHS]
}

function loadHiddenColumns() {
  const saved = loadJSON<unknown>(STORAGE.hidden, null)
  if (Array.isArray(saved)) return new Set(saved.map(String))
  const legacy = loadJSON<unknown>(STORAGE.legacyHidden, [])
  return new Set([...(Array.isArray(legacy) ? legacy.map(String) : []), ...DEFAULT_HIDDEN_COLUMNS])
}

function parseSorts(raw: string | null): SortSpec[] | null {
  if (!raw) return null
  const sorts = raw
    .split(',')
    .map((part) => part.split(':'))
    .filter(([key, dir]) => key && (dir === 'asc' || dir === 'desc'))
    .map(([key, dir]) => ({ key, direction: dir as SortSpec['direction'] }))
  return sorts.length ? sorts : null
}

interface Deps {
  stocks: StocksStore
  preferences: PreferencesStore
}

export interface ScreenerOptions {
  fixedSector?: string
  fixedIndustry?: string
  initialParams?: URLSearchParams
}

export class ScreenerController implements PageController {
  months: number[] = loadMonths()
  weights: Weights = { ...DEFAULT_WEIGHTS }
  hiddenColumns: Set<string> = loadHiddenColumns()
  density: Density = loadJSON<unknown>(STORAGE.density, 'cozy') === 'compact' ? 'compact' : 'cozy'
  search = ''
  sectorFilter = ''
  industryFilter = ''
  ranges: Record<string, Range> = {}
  sorts: SortSpec[] = DEFAULT_SORTS
  page = 1
  pageSize = 50
  scoringOpen = false
  filtersOpen = false
  quickStockId: number | null = null
  list: Resource<StockList> | null = null

  readonly fixedSector: string | null
  readonly fixedIndustry: string | null
  private readonly deps: Deps
  private readonly disposer = new Disposer()

  constructor(deps: Deps, { fixedSector, fixedIndustry, initialParams }: ScreenerOptions = {}) {
    this.deps = deps
    this.fixedSector = fixedSector ?? null
    this.fixedIndustry = fixedIndustry ?? null
    if (initialParams) this.applyUrlParams(initialParams)
    makeAutoObservable<ScreenerController, 'deps' | 'disposer'>(
      this,
      { list: observableRef, deps: false, disposer: false, fixedSector: false, fixedIndustry: false },
      { autoBind: true }
    )
  }

  mount() {
    this.disposer.add(
      reaction(
        () => StocksStore.keyFor(this.query),
        () => void this.load(),
        { fireImmediately: true }
      )
    )
  }

  dispose() {
    this.disposer.dispose()
  }

  get embedded() {
    return this.fixedSector !== null
  }

  get query(): StocksQuery {
    return {
      months: this.months,
      minMarketCap: this.deps.preferences.minMarketCap,
      sector: this.fixedSector,
      industry: this.fixedIndustry,
    }
  }

  load(refresh = false) {
    this.list = this.deps.stocks.listFor(this.query)
    if (!refresh && (this.list.data || this.list.isLoading)) return this.list.pending
    return this.deps.stocks.load(this.query, { refresh })
  }

  refresh() {
    void this.load(true)
  }

  get asOf() {
    return this.list?.data?.generatedAt ?? null
  }

  get isRefreshing() {
    return this.list?.isLoading ?? false
  }

  get stocks(): StockModel[] {
    return this.list?.data?.stocks ?? []
  }

  get isInitialLoad() {
    return !this.list || (this.list.data === null && !this.list.hasFailed)
  }

  get loadError() {
    return this.list?.error ?? null
  }

  // ----- columns -----

  get columns(): Column[] {
    return buildColumns(this.months)
  }

  get visibleColumns(): Column[] {
    return this.columns.filter((c) => {
      if (this.embedded && (c.key === 'sector' || c.key === 'industry')) return false
      return c.key === 'tradingsymbol' || !this.hiddenColumns.has(c.key)
    })
  }

  get configurableColumns(): Column[] {
    return this.columns.filter(
      (c) => c.key !== 'tradingsymbol' && !(this.embedded && (c.key === 'sector' || c.key === 'industry'))
    )
  }

  toggleColumn(key: string) {
    const next = new Set(this.hiddenColumns)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    this.hiddenColumns = next
    saveJSON(STORAGE.hidden, [...next])
  }

  showAllColumns() {
    this.hiddenColumns = new Set()
    saveJSON(STORAGE.hidden, [])
  }

  setDensity(density: Density) {
    this.density = density
    saveJSON(STORAGE.density, density)
  }

  // ----- scoring -----

  get normalizedWeights() {
    return normalizeWeights(this.weights, this.months)
  }

  get weightSum() {
    return rawWeightSum(this.weights, this.months)
  }

  get backWeights() {
    return backScoreWeights(this.weights)
  }

  toggleMonth(month: number) {
    const next = this.months.includes(month) ? this.months.filter((m) => m !== month) : [...this.months, month]
    if (!next.length) return
    this.months = next.sort((a, b) => a - b)
    if (!(month in this.weights)) this.weights = { ...this.weights, [month]: 0 }
    this.page = 1
    saveJSON(STORAGE.months, this.months)
  }

  setWeight(month: number, value: string) {
    this.weights = { ...this.weights, [month]: value }
  }

  resetWeights() {
    const next = { ...this.weights }
    for (const m of this.months) next[m] = DEFAULT_WEIGHTS[m] ?? 0
    this.weights = next
  }

  toggleScoring() {
    this.scoringOpen = !this.scoringOpen
  }

  get scored(): ScoredStock[] {
    const weights = this.normalizedWeights
    const back = this.backWeights
    return this.stocks.map((stock) => ({
      stock,
      momentum: stock.momentumScore(this.months, weights),
      back1: stock.backScore(1, back),
      back3: stock.backScore(3, back),
    }))
  }

  cellValue(row: ScoredStock, key: string): string | number | null {
    const s = row.stock
    switch (key) {
      case 'tradingsymbol':
        return s.symbol
      case 'sector':
        return s.sector
      case 'industry':
        return s.industry
      case 'market_cap_cr':
        return s.marketCapCr
      case 'current_price':
        return s.price
      case 'all_time_high':
        return s.allTimeHigh
      case 'diff_from_ath':
        return s.diffFromAth
      case 'momentum_score':
        return row.momentum
      case 'momentum_1m_back':
        return row.back1
      case 'momentum_3m_back':
        return row.back3
    }
    const price = key.match(/^price_(\d+)m$/)
    if (price) return s.priceMonthsAgo(Number(price[1]))
    const ret = key.match(/^return_(\d+)m$/)
    if (ret) return s.returnFor(Number(ret[1]))
    return null
  }

  // ----- filters -----

  get filterFields(): FilterField[] {
    return [
      { key: 'market_cap_cr', label: 'Market cap', unit: '₹ Cr' },
      ...this.months.map((m) => ({ key: `return_${m}m`, label: `${m}M return`, unit: '%' })),
      { key: 'diff_from_ath', label: 'Distance from ATH', unit: '%' },
      { key: 'momentum_score', label: 'Momentum score', unit: '%' },
    ]
  }

  rangeFor(key: string) {
    return this.ranges[key] ?? EMPTY_RANGE
  }

  get activeRanges() {
    return this.filterFields.filter((f) => {
      const r = this.ranges[f.key]
      return r && (r.min !== '' || r.max !== '')
    })
  }

  get filtersActive() {
    return this.search !== '' || this.sectorFilter !== '' || this.industryFilter !== '' || this.activeRanges.length > 0
  }

  setSearch(value: string) {
    this.search = value
    this.page = 1
  }

  setSectorFilter(value: string) {
    this.sectorFilter = value
    this.industryFilter = ''
    this.page = 1
  }

  setIndustryFilter(value: string) {
    this.industryFilter = value
    this.page = 1
  }

  updateRange(key: string, edge: keyof Range, value: string) {
    this.ranges = { ...this.ranges, [key]: { ...this.rangeFor(key), [edge]: value } }
    this.page = 1
  }

  setRange(key: string, range: Range) {
    this.ranges = { ...this.ranges, [key]: range }
    this.page = 1
  }

  clearRanges() {
    this.ranges = {}
    this.page = 1
  }

  clearFilters() {
    this.search = ''
    this.sectorFilter = ''
    this.industryFilter = ''
    this.ranges = {}
    this.page = 1
  }

  setFiltersOpen(open: boolean) {
    this.filtersOpen = open
  }

  get sectorOptions() {
    if (this.embedded) return []
    return [...new Set(this.stocks.map((s) => s.sector).filter((s): s is string => Boolean(s)))].sort()
  }

  get industryOptions() {
    if (this.embedded) return []
    const pool = this.sectorFilter ? this.stocks.filter((s) => s.sector === this.sectorFilter) : this.stocks
    return [...new Set(pool.map((s) => s.industry).filter((s): s is string => Boolean(s)))].sort()
  }

  get filtered(): ScoredStock[] {
    const q = this.search.trim().toLowerCase()
    const ranges = this.activeRanges.map((f) => ({ key: f.key, ...this.rangeFor(f.key) }))
    return this.scored.filter((row) => {
      const s = row.stock
      if (q && !s.symbol.toLowerCase().includes(q) && !s.name.toLowerCase().includes(q)) return false
      if (!this.embedded && this.sectorFilter && s.sector !== this.sectorFilter) return false
      if (!this.embedded && this.industryFilter && s.industry !== this.industryFilter) return false
      for (const { key, min, max } of ranges) {
        const value = this.cellValue(row, key)
        if (min !== '' && (value === null || Number(value) < Number(min))) return false
        if (max !== '' && (value === null || Number(value) > Number(max))) return false
      }
      return true
    })
  }

  // ----- sorting and paging -----

  get effectiveSorts(): SortSpec[] {
    const visible = new Set(this.visibleColumns.map((c) => c.key))
    const sorts = this.sorts.filter((s) => visible.has(s.key))
    return sorts.length ? sorts : FALLBACK_SORTS
  }

  sortBy(key: string, additive = false) {
    this.sorts = nextSorts(this.effectiveSorts, key, additive, TEXT_COLUMNS.has(key) ? 'asc' : 'desc')
    this.page = 1
  }

  get sorted(): ScoredStock[] {
    return [...this.filtered].sort(compareBy(this.effectiveSorts, this.cellValue, (key) => TEXT_COLUMNS.has(key)))
  }

  get totalPages() {
    return Math.max(1, Math.ceil(this.sorted.length / this.pageSize))
  }

  get currentPage() {
    return Math.min(this.page, this.totalPages)
  }

  get pageRows(): ScoredStock[] {
    const start = (this.currentPage - 1) * this.pageSize
    return this.sorted.slice(start, start + this.pageSize)
  }

  setPage(page: number) {
    this.page = Math.min(Math.max(1, page), this.totalPages)
  }

  setPageSize(size: number) {
    this.pageSize = size
    this.page = 1
  }

  // ----- summary -----

  get summary() {
    const first = this.months[0]
    const withReturn = this.sorted.filter((r) => r.stock.returnFor(first) !== null)
    const advancing = withReturn.filter((r) => (r.stock.returnFor(first) as number) > 0).length
    const scored = this.sorted.filter((r) => r.momentum !== null)
    const top = scored.reduce<ScoredStock | null>(
      (best, r) => (!best || (r.momentum as number) > (best.momentum as number) ? r : best),
      null
    )
    return {
      firstMonth: first,
      matching: this.sorted.length,
      total: this.stocks.length,
      advancing,
      advancingShare: withReturn.length ? advancing / withReturn.length : 0,
      medianScore: median(scored.map((r) => r.momentum)),
      top,
      nearAth: this.sorted.filter((r) => isNum(r.stock.diffFromAth) && (r.stock.diffFromAth as number) >= -10).length,
    }
  }

  // ----- quick look -----

  get quickRow(): ScoredStock | null {
    if (this.quickStockId === null) return null
    return this.scored.find((r) => r.stock.id === this.quickStockId) ?? null
  }

  openQuickLook(id: number) {
    this.quickStockId = id
  }

  closeQuickLook() {
    this.quickStockId = null
  }

  rowById(id: number) {
    return this.scored.find((r) => r.stock.id === id) ?? null
  }

  // ----- URL state (search, filters, sort, page) -----

  get urlParams(): string {
    const params = new URLSearchParams()
    if (this.search) params.set('q', this.search)
    if (!this.embedded && this.sectorFilter) params.set('sector', this.sectorFilter)
    if (!this.embedded && this.industryFilter) params.set('industry', this.industryFilter)
    const sorts = this.sorts.map((s) => `${s.key}:${s.direction}`).join(',')
    if (sorts !== DEFAULT_SORTS.map((s) => `${s.key}:${s.direction}`).join(',')) params.set('sort', sorts)
    if (this.page > 1) params.set('page', String(this.page))
    return params.toString()
  }

  applyUrlParams(params: URLSearchParams) {
    this.search = params.get('q') ?? ''
    this.sectorFilter = params.get('sector') ?? ''
    this.industryFilter = params.get('industry') ?? ''
    this.sorts = parseSorts(params.get('sort')) ?? DEFAULT_SORTS
    const page = Number(params.get('page'))
    this.page = Number.isInteger(page) && page > 0 ? page : 1
  }
}
