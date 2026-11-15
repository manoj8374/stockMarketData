export interface GuestCredentials {
  username: string
  password: string
}

export interface SessionDto {
  authenticated: boolean
  username?: string
  role?: string
  guest?: GuestCredentials | null
}

export interface LoginDto {
  ok: boolean
  username: string
  role: string
}

export interface AuthService {
  getSession(): Promise<SessionDto>
  login(username: string, password: string): Promise<LoginDto>
  logout(): Promise<void>
}
