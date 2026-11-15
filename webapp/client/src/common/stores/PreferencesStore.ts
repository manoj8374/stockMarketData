import { makeAutoObservable } from 'mobx'
import { loadJSON, saveJSON } from '../utils/storage'

export type Theme = 'dark' | 'light'

export const MIN_MARKET_CAP_CR = 2000

function systemTheme(): Theme {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

export class PreferencesStore {
  theme: Theme
  hideSmallCaps: boolean

  constructor() {
    const savedTheme = loadJSON<unknown>('theme', null)
    this.theme = savedTheme === 'light' || savedTheme === 'dark' ? savedTheme : systemTheme()
    this.hideSmallCaps = loadJSON<unknown>('hideSmallCaps', true) !== false
    makeAutoObservable(this, {}, { autoBind: true })
    this.applyTheme()
  }

  get minMarketCap() {
    return this.hideSmallCaps ? MIN_MARKET_CAP_CR : 0
  }

  toggleTheme() {
    this.theme = this.theme === 'dark' ? 'light' : 'dark'
    saveJSON('theme', this.theme)
    this.applyTheme()
  }

  setHideSmallCaps(value: boolean) {
    this.hideSmallCaps = value
    saveJSON('hideSmallCaps', value)
  }

  private applyTheme() {
    document.documentElement.setAttribute('data-theme', this.theme)
  }
}
