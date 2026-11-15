import { reaction } from 'mobx'
import { ApiClient } from '../core/network/ApiClient'
import { SocketClient } from '../core/socket/SocketClient'
import { PreferencesStore } from '../common/stores/PreferencesStore'
import { UiStore } from '../common/stores/UiStore'
import { AuthStore } from '../features/auth/stores/AuthStore'
import { StocksStore } from '../features/screener/stores/StocksStore'
import { SectorsStore } from '../features/sectors/stores/SectorsStore'
import { IndustryMomentumStore } from '../features/industries/stores/IndustryMomentumStore'
import { PortfolioStore } from '../features/portfolio/stores/PortfolioStore'
import { LiveTicksStore } from '../features/live/stores/LiveTicksStore'
import { WatchlistStore } from '../features/live/stores/WatchlistStore'
import { OptionChainStore } from '../features/live/stores/OptionChainStore'
import type { LiveService, TransportFactory } from '../features/live/services/LiveService'
import { createApiServices, type Services } from './services'

export interface RootStoreOptions {
  createTransport?: TransportFactory
  scheduleFrame?: (callback: () => void) => void
}

const socketTransport =
  (live: LiveService): TransportFactory =>
  (handlers) =>
    new SocketClient({ getUrl: () => live.getSocketUrl(), ...handlers })

export class RootStore {
  readonly api: ApiClient
  readonly services: Services
  readonly preferences: PreferencesStore
  readonly ui: UiStore
  readonly auth: AuthStore
  readonly stocks: StocksStore
  readonly sectors: SectorsStore
  readonly industryMomentum: IndustryMomentumStore
  readonly portfolio: PortfolioStore
  readonly live: LiveTicksStore
  readonly watchlist: WatchlistStore
  readonly optionChains: OptionChainStore

  constructor(createServices: (api: ApiClient) => Services = createApiServices, options: RootStoreOptions = {}) {
    this.api = new ApiClient({ onUnauthorized: (path) => this.auth.handleUnauthorized(path) })
    this.services = createServices(this.api)
    this.preferences = new PreferencesStore()
    this.ui = new UiStore()
    this.auth = new AuthStore(this.services.auth)
    this.stocks = new StocksStore(this.services.stocks)
    this.sectors = new SectorsStore(this.services.sectors)
    this.industryMomentum = new IndustryMomentumStore(this.services.industryMomentum)
    this.portfolio = new PortfolioStore(this.services.portfolio)
    this.live = new LiveTicksStore(options.createTransport ?? socketTransport(this.services.live), options.scheduleFrame)
    this.watchlist = new WatchlistStore()
    this.optionChains = new OptionChainStore(this.services.live)

    reaction(
      () => this.auth.user?.username ?? null,
      (username) => {
        this.watchlist.setUser(username)
        if (!username) this.live.stop()
      },
      { fireImmediately: true }
    )
  }
}
