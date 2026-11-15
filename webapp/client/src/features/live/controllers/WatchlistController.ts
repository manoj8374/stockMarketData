import { makeAutoObservable, reaction } from 'mobx'
import { Resource } from '../../../core/network/Resource'
import type { PageController } from '../../../common/stores/UiStore'
import { Disposer } from '../../../common/utils/Disposer'
import type { InstrumentDto, LiveService } from '../services/LiveService'
import type { LiveTicksStore } from '../stores/LiveTicksStore'
import type { WatchlistStore } from '../stores/WatchlistStore'

const SEARCH_DELAY_MS = 250

interface Deps {
  live: LiveTicksStore
  watchlist: WatchlistStore
  service: LiveService
}

export class WatchlistController implements PageController {
  query = ''
  selected: string | null = null
  readonly results = new Resource<InstrumentDto[]>()
  private readonly deps: Deps
  private readonly disposer = new Disposer()
  private searchTimer: ReturnType<typeof setTimeout> | null = null

  constructor(deps: Deps) {
    this.deps = deps
    makeAutoObservable<WatchlistController, 'deps' | 'disposer' | 'searchTimer'>(
      this,
      { results: false, deps: false, disposer: false, searchTimer: false },
      { autoBind: true }
    )
  }

  mount() {
    let release: (() => void) | null = null
    this.disposer.add(
      reaction(
        () => this.deps.watchlist.symbols,
        (symbols) => {
          const previous = release
          release = symbols.length ? this.deps.live.watch(symbols) : null
          previous?.()
        },
        { fireImmediately: true }
      )
    )
    this.disposer.add(() => release?.())
    this.disposer.add(() => {
      if (this.searchTimer) clearTimeout(this.searchTimer)
      this.results.cancel()
    })
  }

  dispose() {
    this.disposer.dispose()
  }

  get symbols() {
    return this.deps.watchlist.symbols
  }

  get chartSymbol() {
    return this.selected && this.symbols.includes(this.selected) ? this.selected : (this.symbols[0] ?? null)
  }

  get asOf() {
    let latest = 0
    for (const symbol of this.symbols) latest = Math.max(latest, this.deps.live.tick(symbol)?.ts ?? 0)
    return latest ? new Date(latest) : null
  }

  get isRefreshing() {
    return this.deps.live.status === 'connecting' || this.deps.live.status === 'reconnecting'
  }

  refresh() {
    this.deps.live.reconnect()
  }

  select(symbol: string) {
    this.selected = symbol
  }

  setQuery(query: string) {
    this.query = query
    if (this.searchTimer) clearTimeout(this.searchTimer)
    if (!query.trim()) {
      this.results.cancel()
      return
    }
    this.searchTimer = setTimeout(() => {
      this.searchTimer = null
      void this.results.load((signal) => this.deps.service.search(query, signal))
    }, SEARCH_DELAY_MS)
  }

  get suggestions(): InstrumentDto[] {
    if (!this.query.trim()) return []
    return (this.results.data ?? []).filter((i) => !this.deps.watchlist.has(i.symbol))
  }

  add(symbol: string) {
    if (this.deps.watchlist.add(symbol)) this.selected = symbol
    this.query = ''
    this.results.cancel()
  }

  remove(symbol: string) {
    this.deps.watchlist.remove(symbol)
  }

  move(symbol: string, offset: number) {
    this.deps.watchlist.move(symbol, offset)
  }
}
