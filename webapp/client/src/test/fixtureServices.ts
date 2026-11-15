import type { Services } from '../app/services'
import { AuthFixtureService } from '../features/auth/services/AuthFixtureService'
import { StocksFixtureService } from '../features/screener/services/StocksFixtureService'
import { SectorsFixtureService } from '../features/sectors/services/SectorsFixtureService'
import { IndustryMomentumFixtureService } from '../features/industries/services/IndustryMomentumFixtureService'
import { PortfolioFixtureService } from '../features/portfolio/services/PortfolioFixtureService'

export function createFixtureServices(): Services {
  return {
    auth: new AuthFixtureService(),
    stocks: new StocksFixtureService(),
    sectors: new SectorsFixtureService(),
    industryMomentum: new IndustryMomentumFixtureService(),
    portfolio: new PortfolioFixtureService(),
  }
}
