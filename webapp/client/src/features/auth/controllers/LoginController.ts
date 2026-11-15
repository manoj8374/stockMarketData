import { makeAutoObservable } from 'mobx'
import type { AuthStore } from '../stores/AuthStore'

export class LoginController {
  username = ''
  password = ''
  showPassword = false
  private readonly auth: AuthStore

  constructor(auth: AuthStore) {
    this.auth = auth
    makeAutoObservable<LoginController, 'auth'>(this, { auth: false }, { autoBind: true })
  }

  get guest() {
    return this.auth.guest
  }

  get error() {
    return this.auth.loginError
  }

  get notice() {
    return this.auth.sessionExpired ? 'Your session has ended. Sign in again to continue.' : null
  }

  get isSubmitting() {
    return this.auth.isSigningIn
  }

  setUsername(value: string) {
    this.username = value
  }

  setPassword(value: string) {
    this.password = value
  }

  toggleShowPassword() {
    this.showPassword = !this.showPassword
  }

  submit() {
    return this.auth.login(this.username.trim(), this.password)
  }

  signInAsGuest() {
    if (!this.guest) return Promise.resolve()
    this.username = this.guest.username
    this.password = this.guest.password
    return this.auth.loginAsGuest()
  }

  mount() {}

  dispose() {}
}
