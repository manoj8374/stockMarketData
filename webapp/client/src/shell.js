import { createContext, useContext, useEffect, useRef } from 'react'

// Links each page to the shared top bar: the bar's Refresh button bumps
// refreshKey, and the page reports its "data as of" time and loading state
// back through setMeta so the bar can show them.
export const ShellContext = createContext({ refreshKey: 0, setMeta: () => {} })

// Calls onRefresh whenever the top bar's Refresh button is pressed (not on
// mount, so opening a page never forces a cache-bypassing reload).
export function useRefreshSignal(onRefresh) {
  const { refreshKey } = useContext(ShellContext)
  const seen = useRef(refreshKey)
  const callback = useRef(onRefresh)

  useEffect(() => {
    callback.current = onRefresh
  })

  useEffect(() => {
    if (refreshKey !== seen.current) {
      seen.current = refreshKey
      callback.current()
    }
  }, [refreshKey])
}

export function usePageMeta(asOf, loading) {
  const { setMeta } = useContext(ShellContext)
  useEffect(() => {
    setMeta({ asOf: asOf || null, loading: Boolean(loading) })
  }, [asOf, loading, setMeta])
  useEffect(() => () => setMeta({ asOf: null, loading: false }), [setMeta])
}
