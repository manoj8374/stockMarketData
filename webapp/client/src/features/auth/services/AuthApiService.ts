import type { ApiClient } from '../../../core/network/ApiClient'
import type { AuthService, LoginDto, SessionDto } from './AuthService'

export class AuthApiService implements AuthService {
  private readonly api: ApiClient

  constructor(api: ApiClient) {
    this.api = api
  }

  getSession() {
    return this.api.get<SessionDto>('/api/session')
  }

  login(username: string, password: string) {
    return this.api.post<LoginDto>('/api/login', { username, password })
  }

  async logout() {
    await this.api.post('/api/logout')
  }
}
