import { makeAutoObservable, observableRef, reaction } from 'mobx'
import type { Resource } from '../../../core/network/Resource'
import type { PageController } from '../../../common/stores/UiStore'
import type { PreferencesStore } from '../../../common/stores/PreferencesStore'
import { Disposer } from '../../../common/utils/Disposer'
import { loadJSON, saveJSON } from '../../../common/utils/storage'
import type { GroupSummaryModel } from '../models/GroupSummaryModel'
import type { SectorsStore } from '../stores/SectorsStore'

export type SectorSort = 'count' | 'median' | 'name'
export const SECTOR_SORTS: ReadonlyArray<readonly [SectorSort, string]> = [
  ['count', 'Most stocks'],
  ['median', '1M median'],
  ['name', 'A–Z'],
]
const SORT_KEY = 'sectorSort'

interface Deps {
  sectors: SectorsStore
  preferences: PreferencesStore
}

function loadSort(): SectorSort {
  const saved = loadJSON<unknown>(SORT_KEY, 'count')
  return SECTOR_SORTS.some(([k]) => k === saved) ? (saved as SectorSort) : 'count'
}

const isInitial = (resource: Resource<unknown> | null) => !resource || (resource.data === null && !resource.hasFailed)
const byName = (a: GroupSummaryModel, b: GroupSummaryModel) => a.name.localeCompare(b.name)
const total = (groups: GroupSummaryModel[]) => groups.reduce((acc, g) => acc + g.count, 0)

export class SectorsController implements PageController {
  search = ''
  sortBy: SectorSort = loadSort()
  resource: Resource<GroupSummaryModel[]> | null = null
  private readonly deps: Deps
  private readonly disposer = new Disposer()

  constructor(deps: Deps) {
    this.deps = deps
    makeAutoObservable<SectorsController, 'deps' | 'disposer'>(this, { resource: observableRef, deps: false, disposer: false }, { autoBind: true })
  }

  mount() {
    this.disposer.add(reaction(() => this.deps.preferences.minMarketCap, () => void this.load(), { fireImmediately: true }))
  }

  dispose() {
    this.disposer.dispose()
  }

  load(refresh = false) {
    const minCap = this.deps.preferences.minMarketCap
    this.resource = this.deps.sectors.sectorsFor(minCap)
    return this.deps.sectors.loadSectors(minCap, { refresh })
  }

  refresh() {
    void this.load(true)
  }

  get asOf() {
    return null
  }

  get isRefreshing() {
    return this.resource?.isLoading ?? false
  }

  get isInitialLoad() {
    return isInitial(this.resource)
  }

  get loadError() {
    return this.resource?.error ?? null
  }

  get sectors() {
    return this.resource?.data ?? []
  }

  get totalStocks() {
    return total(this.sectors)
  }

  setSearch(value: string) {
    this.search = value
  }

  setSortBy(sort: SectorSort) {
    this.sortBy = sort
    saveJSON(SORT_KEY, sort)
  }

  get visible(): GroupSummaryModel[] {
    const q = this.search.trim().toLowerCase()
    const list = this.sectors.filter((g) => !q || g.name.toLowerCase().includes(q))
    if (this.sortBy === 'name') return list.sort(byName)
    if (this.sortBy === 'median') {
      return list.sort((a, b) => {
        if (a.median1m === null) return 1
        if (b.median1m === null) return -1
        return b.median1m - a.median1m || byName(a, b)
      })
    }
    return list.sort((a, b) => b.count - a.count || byName(a, b))
  }
}

export class SectorDetailController implements PageController {
  resource: Resource<GroupSummaryModel[]> | null = null
  readonly sector: string
  private readonly deps: Deps
  private readonly disposer = new Disposer()

  constructor(deps: Deps, sector: string) {
    this.deps = deps
    this.sector = sector
    makeAutoObservable<SectorDetailController, 'deps' | 'disposer'>(
      this,
      { resource: observableRef, deps: false, disposer: false, sector: false },
      { autoBind: true }
    )
  }

  mount() {
    this.disposer.add(reaction(() => this.deps.preferences.minMarketCap, () => void this.load(), { fireImmediately: true }))
  }

  dispose() {
    this.disposer.dispose()
  }

  load(refresh = false) {
    const minCap = this.deps.preferences.minMarketCap
    this.resource = this.deps.sectors.industriesFor(this.sector, minCap)
    return this.deps.sectors.loadIndustries(this.sector, minCap, { refresh })
  }

  refresh() {
    void this.load(true)
  }

  get asOf() {
    return null
  }

  get isRefreshing() {
    return this.resource?.isLoading ?? false
  }

  get isInitialLoad() {
    return isInitial(this.resource)
  }

  get loadError() {
    return this.resource?.error ?? null
  }

  get industries(): GroupSummaryModel[] {
    return [...(this.resource?.data ?? [])].sort((a, b) => b.count - a.count || byName(a, b))
  }

  get totalStocks() {
    return total(this.industries)
  }

  get largestCount() {
    return Math.max(1, ...this.industries.map((g) => g.count))
  }
}
