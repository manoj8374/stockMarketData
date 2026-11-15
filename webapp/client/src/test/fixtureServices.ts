import type { Services } from '../app/services'
import { AuthFixtureService } from '../features/auth/services/AuthFixtureService'

export function createFixtureServices(): Services {
  return {
    auth: new AuthFixtureService(),
  }
}
