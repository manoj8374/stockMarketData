import { compareStructural, makeAutoObservable, observableRef, reaction } from 'mobx'
import type { Resource } from '../../../core/network/Resource'
import type { PageController } from '../../../common/stores/UiStore'
import { Disposer } from '../../../common/utils/Disposer'
import type { OptionChainDto, OptionStrikeDto } from '../services/LiveService'
import type { LiveTicksStore } from '../stores/LiveTicksStore'
import type { OptionChainStore } from '../stores/OptionChainStore'

export const STRIKE_WINDOWS = [5, 10, 20] as const
const DAY = 24 * 3600 * 1000

interface Deps {
  live: LiveTicksStore
  chains: OptionChainStore
}

export class OptionChainController implements PageController {
  underlying = 'NIFTY'
  expiry: string | null = null
  strikesEachSide: number = 10
  resource: Resource<OptionChainDto> | null = null
  private readonly deps: Deps
  private readonly disposer = new Disposer()

  constructor(deps: Deps) {
    this.deps = deps
    makeAutoObservable<OptionChainController, 'deps' | 'disposer'>(
      this,
      { resource: observableRef, deps: false, disposer: false },
      { autoBind: true }
    )
  }

  mount() {
    this.disposer.add(
      reaction(
        () => [this.underlying, this.expiry],
        () => void this.load(),
        { fireImmediately: true }
      )
    )

    // Subscribe to the new window before releasing the old one, so strikes
    // present in both never drop to zero watchers and get unsubscribed.
    let release: (() => void) | null = null
    this.disposer.add(
      reaction(
        () => this.watchedSymbols,
        (symbols) => {
          const previous = release
          release = symbols.length ? this.deps.live.watch(symbols) : null
          previous?.()
        },
        { fireImmediately: true, equals: compareStructural }
      )
    )
    this.disposer.add(() => release?.())
  }

  dispose() {
    this.disposer.dispose()
  }

  load(refresh = false) {
    this.resource = this.deps.chains.chainFor(this.underlying, this.expiry)
    return this.deps.chains.load(this.underlying, this.expiry, { refresh })
  }

  refresh() {
    void this.load(true)
    this.deps.live.reconnect()
  }

  get chain() {
    return this.resource?.data ?? null
  }

  get asOf() {
    const ts = this.chain ? this.deps.live.tick(this.chain.spotSymbol)?.ts : undefined
    return ts ? new Date(ts) : null
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

  get selectedExpiry() {
    return this.chain?.expiry ?? this.expiry
  }

  setExpiry(expiry: string) {
    this.expiry = expiry
  }

  setStrikesEachSide(count: number) {
    this.strikesEachSide = count
  }

  get spot() {
    return this.chain ? (this.deps.live.tick(this.chain.spotSymbol)?.ltp ?? null) : null
  }

  get atmStrike() {
    const strikes = this.chain?.strikes ?? []
    if (!strikes.length) return null
    const spot = this.spot
    if (spot === null) return strikes[Math.floor(strikes.length / 2)].strike
    return strikes.reduce((best, s) => (Math.abs(s.strike - spot) < Math.abs(best - spot) ? s.strike : best), strikes[0].strike)
  }

  // A window of strikes centred on the at-the-money strike; it moves as the
  // index moves, and the subscriptions follow it.
  get visibleStrikes(): OptionStrikeDto[] {
    const strikes = this.chain?.strikes ?? []
    const atm = this.atmStrike
    if (atm === null) return []
    const index = strikes.findIndex((s) => s.strike === atm)
    return strikes.slice(Math.max(0, index - this.strikesEachSide), index + this.strikesEachSide + 1)
  }

  get watchedSymbols() {
    if (!this.chain) return []
    return [this.chain.spotSymbol, ...this.visibleStrikes.flatMap((s) => [s.ce, s.pe])]
  }

  get maxOi() {
    let max = 0
    for (const s of this.visibleStrikes) {
      max = Math.max(max, this.deps.live.tick(s.ce)?.oi ?? 0, this.deps.live.tick(s.pe)?.oi ?? 0)
    }
    return max
  }

  // Put-call ratio by open interest across the strikes on screen.
  get pcr() {
    let calls = 0
    let puts = 0
    for (const s of this.visibleStrikes) {
      calls += this.deps.live.tick(s.ce)?.oi ?? 0
      puts += this.deps.live.tick(s.pe)?.oi ?? 0
    }
    return calls > 0 ? puts / calls : null
  }

  get daysToExpiry() {
    const expiry = this.selectedExpiry
    if (!expiry) return null
    return Math.max(0, Math.ceil((new Date(`${expiry}T10:00:00Z`).getTime() - Date.now()) / DAY))
  }

  isCallInTheMoney(strike: number) {
    return this.spot !== null && strike < this.spot
  }

  isPutInTheMoney(strike: number) {
    return this.spot !== null && strike > this.spot
  }
}
