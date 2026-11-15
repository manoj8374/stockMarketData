import { ApiError } from '../../../core/network/ApiError'
import type { AuthService, GuestCredentials, LoginDto, SessionDto } from './AuthService'

interface FixtureUser {
  username: string
  password: string
  role: string
}

export const FIXTURE_USERS: FixtureUser[] = [
  { username: 'owner', password: 'owner-pass', role: 'owner' },
  { username: 'guest', password: 'guest-pass', role: 'guest' },
]

export class AuthFixtureService implements AuthService {
  private current: FixtureUser | null
  private readonly users: FixtureUser[]
  private readonly guest: GuestCredentials | null

  constructor({ users = FIXTURE_USERS, signedInAs = null as string | null, showGuest = true } = {}) {
    this.users = users
    this.current = users.find((u) => u.username === signedInAs) ?? null
    const guest = users.find((u) => u.role === 'guest')
    this.guest = showGuest && guest ? { username: guest.username, password: guest.password } : null
  }

  async getSession(): Promise<SessionDto> {
    if (this.current) return { authenticated: true, username: this.current.username, role: this.current.role }
    return { authenticated: false, guest: this.guest }
  }

  async login(username: string, password: string): Promise<LoginDto> {
    const user = this.users.find((u) => u.username === username && u.password === password)
    if (!user) throw new ApiError('Invalid username or password', 401, 'Invalid username or password')
    this.current = user
    return { ok: true, username: user.username, role: user.role }
  }

  async logout() {
    this.current = null
  }
}
