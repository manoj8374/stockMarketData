import { makeAutoObservable, runInAction } from 'mobx'
import { ApiStatus } from '../../../core/network/apiStatus'
import { toApiError } from '../../../core/network/ApiError'
import { User } from '../models/User'
import type { AuthService, GuestCredentials } from '../services/AuthService'

const LOGIN_PATH = '/api/login'

export class AuthStore {
  user: User | null = null
  guest: GuestCredentials | null = null
  sessionStatus: ApiStatus = ApiStatus.IDLE
  loginStatus: ApiStatus = ApiStatus.IDLE
  loginError: string | null = null
  sessionExpired = false
  private readonly service: AuthService

  constructor(service: AuthService) {
    this.service = service
    makeAutoObservable<AuthStore, 'service'>(this, { service: false }, { autoBind: true })
  }

  get isBooting() {
    return this.sessionStatus === ApiStatus.IDLE || (this.sessionStatus === ApiStatus.LOADING && !this.user)
  }

  get isAuthenticated() {
    return this.user !== null
  }

  get isOwner() {
    return this.user?.isOwner ?? false
  }

  get isSigningIn() {
    return this.loginStatus === ApiStatus.LOADING
  }

  async loadSession() {
    this.sessionStatus = ApiStatus.LOADING
    try {
      const session = await this.service.getSession()
      runInAction(() => {
        this.user = session.authenticated && session.username ? new User(session.username, session.role ?? '') : null
        this.guest = session.guest ?? null
        this.sessionStatus = ApiStatus.SUCCESS
      })
    } catch {
      runInAction(() => {
        this.user = null
        this.guest = null
        this.sessionStatus = ApiStatus.FAILURE
      })
    }
  }

  async login(username: string, password: string) {
    this.loginStatus = ApiStatus.LOADING
    this.loginError = null
    try {
      const result = await this.service.login(username, password)
      runInAction(() => {
        this.user = new User(result.username, result.role)
        this.sessionExpired = false
        this.loginStatus = ApiStatus.SUCCESS
      })
    } catch (e) {
      const error = toApiError(e)
      runInAction(() => {
        this.loginStatus = ApiStatus.FAILURE
        this.loginError =
          error.status === 401
            ? "That username and password don't match. Check for typos and try again."
            : error.isNetworkError
              ? error.message
              : 'Sign-in failed. Try again in a moment.'
      })
    }
  }

  loginAsGuest() {
    if (this.guest) return this.login(this.guest.username, this.guest.password)
    return Promise.resolve()
  }

  async logout() {
    try {
      await this.service.logout()
    } catch {
      // signing out locally is still correct if the server call fails
    }
    runInAction(() => {
      this.user = null
      this.loginStatus = ApiStatus.IDLE
    })
    await this.loadSession()
  }

  handleUnauthorized(path: string) {
    if (path === LOGIN_PATH || !this.user) return
    this.user = null
    this.sessionExpired = true
    void this.loadSession()
  }
}
