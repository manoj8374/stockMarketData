import { ApiClient } from '../core/network/ApiClient'
import { PreferencesStore } from '../common/stores/PreferencesStore'
import { UiStore } from '../common/stores/UiStore'
import { AuthStore } from '../features/auth/stores/AuthStore'
import { StocksStore } from '../features/screener/stores/StocksStore'
import { createApiServices, type Services } from './services'

export class RootStore {
  readonly api: ApiClient
  readonly preferences: PreferencesStore
  readonly ui: UiStore
  readonly auth: AuthStore
  readonly stocks: StocksStore

  constructor(createServices: (api: ApiClient) => Services = createApiServices) {
    this.api = new ApiClient({ onUnauthorized: (path) => this.auth.handleUnauthorized(path) })
    const services = createServices(this.api)
    this.preferences = new PreferencesStore()
    this.ui = new UiStore()
    this.auth = new AuthStore(services.auth)
    this.stocks = new StocksStore(services.stocks)
  }
}
