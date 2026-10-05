// App-wide "hide small caps" toggle. When on, every stock list, sector /
// industry count and industry calculation only includes companies with a
// market cap of at least MIN_MARKET_CAP_CR (filtered server-side via the
// minMarketCap query param). When off, minMarketCap=0 means "all companies".
export const MIN_MARKET_CAP_CR = 2000

const STORAGE_KEY = 'hideSmallCaps'

export function loadHideSmallCaps() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    return saved === null ? true : saved === 'true'
  } catch {
    return true
  }
}

export function saveHideSmallCaps(value) {
  try {
    localStorage.setItem(STORAGE_KEY, String(value))
  } catch {
    // storage unavailable -- the toggle still works for this session
  }
}
