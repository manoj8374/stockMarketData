import { PreferencesStore, MIN_MARKET_CAP_CR } from './PreferencesStore'

describe('PreferencesStore', () => {
  beforeEach(() => localStorage.clear())

  it('hides small caps by default', () => {
    const prefs = new PreferencesStore()
    expect(prefs.hideSmallCaps).toBe(true)
    expect(prefs.minMarketCap).toBe(MIN_MARKET_CAP_CR)
  })

  it('remembers the small-cap toggle', () => {
    new PreferencesStore().setHideSmallCaps(false)
    const reloaded = new PreferencesStore()
    expect(reloaded.hideSmallCaps).toBe(false)
    expect(reloaded.minMarketCap).toBe(0)
  })

  it('applies and remembers the theme', () => {
    localStorage.setItem('theme', JSON.stringify('dark'))
    const prefs = new PreferencesStore()
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
    prefs.toggleTheme()
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
    expect(new PreferencesStore().theme).toBe('light')
  })
})
