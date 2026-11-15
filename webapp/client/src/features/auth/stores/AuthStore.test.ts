import { AuthStore } from './AuthStore'
import { AuthFixtureService } from '../services/AuthFixtureService'
import { ApiStatus } from '../../../core/network/apiStatus'
import { ApiError } from '../../../core/network/ApiError'

describe('AuthStore', () => {
  it('starts signed out with the guest account available', async () => {
    const store = new AuthStore(new AuthFixtureService())
    expect(store.isBooting).toBe(true)
    await store.loadSession()
    expect(store.isBooting).toBe(false)
    expect(store.isAuthenticated).toBe(false)
    expect(store.guest).toEqual({ username: 'guest', password: 'guest-pass' })
  })

  it('restores an existing session', async () => {
    const store = new AuthStore(new AuthFixtureService({ signedInAs: 'owner' }))
    await store.loadSession()
    expect(store.user?.username).toBe('owner')
    expect(store.isOwner).toBe(true)
  })

  it('signs in and exposes the role', async () => {
    const store = new AuthStore(new AuthFixtureService())
    await store.login('guest', 'guest-pass')
    expect(store.loginStatus).toBe(ApiStatus.SUCCESS)
    expect(store.isAuthenticated).toBe(true)
    expect(store.isOwner).toBe(false)
  })

  it('shows a clear message for wrong credentials', async () => {
    const store = new AuthStore(new AuthFixtureService())
    await store.login('owner', 'nope')
    expect(store.loginStatus).toBe(ApiStatus.FAILURE)
    expect(store.loginError).toMatch(/don't match/)
    expect(store.isAuthenticated).toBe(false)
  })

  it('reports a network failure as such', async () => {
    const service = new AuthFixtureService()
    jest.spyOn(service, 'login').mockRejectedValue(new ApiError("Couldn't reach the server.", 0, 'network'))
    const store = new AuthStore(service)
    await store.login('owner', 'owner-pass')
    expect(store.loginError).toBe("Couldn't reach the server.")
  })

  it('signs in as guest with the advertised credentials', async () => {
    const store = new AuthStore(new AuthFixtureService())
    await store.loadSession()
    await store.loginAsGuest()
    expect(store.user?.username).toBe('guest')
  })

  it('logs out and reloads the guest details', async () => {
    const store = new AuthStore(new AuthFixtureService({ signedInAs: 'owner' }))
    await store.loadSession()
    await store.logout()
    expect(store.isAuthenticated).toBe(false)
    expect(store.guest?.username).toBe('guest')
  })

  it('drops the user when another request comes back 401', async () => {
    const store = new AuthStore(new AuthFixtureService({ signedInAs: 'owner' }))
    await store.loadSession()
    store.handleUnauthorized('/api/stocks')
    expect(store.isAuthenticated).toBe(false)
    expect(store.sessionExpired).toBe(true)
  })

  it('ignores the 401 from a failed login', async () => {
    const store = new AuthStore(new AuthFixtureService({ signedInAs: 'owner' }))
    await store.loadSession()
    store.handleUnauthorized('/api/login')
    expect(store.isAuthenticated).toBe(true)
  })
})
