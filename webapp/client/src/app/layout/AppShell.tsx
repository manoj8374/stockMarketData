import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { observer } from 'mobx-react-lite'
import { useStores } from '../useStores'
import { BrandMark, Icon, type IconName } from '../../common/components'
import { MIN_MARKET_CAP_CR } from '../../common/stores/PreferencesStore'
import { formatDateTime } from '../../common/utils/format'
import { ShellContext } from '../../shell'
import { Breadcrumbs } from './Breadcrumbs'

interface NavItem {
  to: string
  label: string
  icon: IconName
  end?: boolean
  ownerOnly?: boolean
}

const NAV_GROUPS: Array<{ label: string; items: NavItem[] }> = [
  {
    label: 'Research',
    items: [
      { to: '/', label: 'Screener', icon: 'screener', end: true },
      { to: '/sectors', label: 'Sectors', icon: 'sectors' },
      { to: '/industries', label: 'Industries', icon: 'industries' },
    ],
  },
  {
    label: 'Account',
    items: [{ to: '/portfolio', label: 'Portfolio', icon: 'portfolio', ownerOnly: true }],
  },
]

const MIN_CAP_LABEL = `₹${MIN_MARKET_CAP_CR.toLocaleString('en-IN')} Cr`

const SmallCapToggle = observer(function SmallCapToggle() {
  const { preferences } = useStores()
  return (
    <label
      className="switch"
      title={`When on, companies with a market cap below ${MIN_CAP_LABEL} (or no market cap on record) are left out of every list, count and industry calculation`}
    >
      <input
        type="checkbox"
        role="switch"
        checked={preferences.hideSmallCaps}
        onChange={(e) => preferences.setHideSmallCaps(e.target.checked)}
      />
      <span className="track" aria-hidden="true">
        <span className="thumb" />
      </span>
      <span className="switch-label">Hide under {MIN_CAP_LABEL}</span>
    </label>
  )
})

export const AppShell = observer(function AppShell({ children }: { children: ReactNode }) {
  const { auth, preferences, ui } = useStores()
  const { pathname } = useLocation()
  const [legacyRefreshKey, setLegacyRefreshKey] = useState(0)
  const [legacyMeta, setLegacyMeta] = useState<{ asOf: string | null; loading: boolean }>({ asOf: null, loading: false })
  const legacyShell = useMemo(() => ({ refreshKey: legacyRefreshKey, setMeta: setLegacyMeta }), [legacyRefreshKey])
  const user = auth.user
  const page = ui.activePage
  const asOf = page ? page.asOf : legacyMeta.asOf
  const refreshing = page ? page.isRefreshing : legacyMeta.loading
  const nextTheme = preferences.theme === 'dark' ? 'light' : 'dark'
  const showCapToggle = !['/portfolio', '/watchlist', '/option-chain'].includes(pathname)

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])

  if (!user) return null

  const refresh = () => (page ? ui.refreshActivePage() : setLegacyRefreshKey((k) => k + 1))

  return (
    <ShellContext.Provider value={legacyShell as never}>
      <div className="shell">
        <aside className="side">
          <div className="brand">
            <BrandMark />
            <div>
              <b>NSE Equities</b>
              <span>Momentum workbench</span>
            </div>
          </div>
          <nav className="nav" aria-label="Main">
            {NAV_GROUPS.map((group) => {
              const items = group.items.filter((item) => !item.ownerOnly || user.isOwner)
              if (!items.length) return null
              return (
                <div className="nav-group" key={group.label}>
                  <div className="nav-label">{group.label}</div>
                  {items.map((item) => (
                    <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => (isActive ? 'on' : undefined)}>
                      <Icon name={item.icon} />
                      <span>{item.label}</span>
                      {item.ownerOnly && <span className="own">Owner</span>}
                    </NavLink>
                  ))}
                </div>
              )
            })}
          </nav>
          <div className="side-foot">
            <div className="user">
              <span className="avatar" aria-hidden="true">
                {user.initial}
              </span>
              <div>
                <b>{user.username}</b>
                <span>{user.roleLabel}</span>
              </div>
              <button type="button" className="icon-btn plain" onClick={() => void auth.logout()} title="Log out" aria-label="Log out">
                <Icon name="logout" />
              </button>
            </div>
          </div>
        </aside>

        <div className="main">
          <header className="topbar">
            <div className="topbar-in">
              <div className="crumbs">
                <Breadcrumbs pathname={pathname} />
              </div>
              <div className="top-actions">
                {showCapToggle && <SmallCapToggle />}
                {asOf && (
                  <span className="asof" title="When this data was loaded">
                    <Icon name="clock" />
                    {formatDateTime(asOf)}
                  </span>
                )}
                <button
                  type="button"
                  className={`icon-btn ${refreshing ? 'spin' : ''}`}
                  onClick={refresh}
                  disabled={refreshing}
                  title={refreshing ? 'Loading…' : 'Refresh data'}
                  aria-label="Refresh data"
                >
                  <Icon name="refresh" />
                </button>
                <button
                  type="button"
                  className="icon-btn"
                  onClick={preferences.toggleTheme}
                  title={`Switch to ${nextTheme} theme`}
                  aria-label={`Switch to ${nextTheme} theme`}
                >
                  <Icon name={preferences.theme === 'dark' ? 'sun' : 'moon'} />
                </button>
                <button type="button" className="icon-btn mobile-only" onClick={() => void auth.logout()} title="Log out" aria-label="Log out">
                  <Icon name="logout" />
                </button>
              </div>
            </div>
          </header>
          <main className="content">{children}</main>
        </div>
      </div>
    </ShellContext.Provider>
  )
})
