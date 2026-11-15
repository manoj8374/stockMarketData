import type { Services } from '../app/services'
import { AuthFixtureService } from '../features/auth/services/AuthFixtureService'
import { StocksFixtureService } from '../features/screener/services/StocksFixtureService'

export function createFixtureServices(): Services {
  return {
    auth: new AuthFixtureService(),
    stocks: new StocksFixtureService(),
  }
}
