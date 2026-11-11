import { useEffect, useMemo, useState } from 'react'
import { BrowserRouter, Link, NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import './App.css'
import Login from './Login'
import Portfolio from './Portfolio'
import StockScreener from './StockScreener'
import SectorsBrowser from './SectorsBrowser'
import IndustryMomentum from './IndustryMomentum'
import { MIN_MARKET_CAP_CR, loadHideSmallCaps, saveHideSmallCaps } from './marketCap'
import { ShellContext } from './shell'
import { useTheme } from './useTheme'
import { BrandMark, Icon } from './ui'
import { formatDateTime, sectorPath } from './format'

const MIN_CAP_LABEL = `₹${MIN_MARKET_CAP_CR.toLocaleString('en-IN')} Cr`

function SmallCapToggle({ checked, onChange }) {
  return (
    <label
      className="switch"
      title={`When on, companies with a market cap below ${MIN_CAP_LABEL} (or no market cap on record) are removed from every list, count and industry calculation`}
    >
      <input type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="track" aria-hidden="true">
        <span className="thumb" />
      </span>
      <span className="switch-label">Hide under {MIN_CAP_LABEL}</span>
    </label>
  )
}

function safeDecode(segment) {
  try {
    return decodeURIComponent(segment)
  } catch {
    return segment
  }
}

function Breadcrumbs({ pathname }) {
  if (pathname.startsWith('/sectors')) {
    const [sector, industry] = pathname.split('/').slice(2).filter(Boolean).map(safeDecode)
    if (!sector) return <b>Sectors</b>
    return (
      <>
        <Link to="/sectors">Sectors</Link>
        <Icon name="chevronRight" />
        {industry ? <Link to={sectorPath(sector)}>{sector}</Link> : <b>{sector}</b>}
        {industry && (
          <>
            <Icon name="chevronRight" />
            <b>{industry}</b>
          </>
        )}
      </>
    )
  }
  const titles = { '/': 'Screener', '/industries': 'Industry momentum', '/portfolio': 'Portfolio' }
  return <b>{titles[pathname] || 'Screener'}</b>
}

function AppShell({ session, onLogout, theme, setTheme, hideSmallCaps, onToggleSmallCaps, children }) {
  const { pathname } = useLocation()
  const [refreshKey, setRefreshKey] = useState(0)
  const [meta, setMeta] = useState({ asOf: null, loading: false })
  const shellValue = useMemo(() => ({ refreshKey, setMeta }), [refreshKey])
  const isOwner = session.role === 'owner'
  const onPortfolio = pathname === '/portfolio'

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])

  const nav = [
    { to: '/', label: 'Screener', icon: 'screener', end: true },
    { to: '/sectors', label: 'Sectors', icon: 'sectors' },
    { to: '/industries', label: 'Industries', icon: 'industries' },
    ...(isOwner ? [{ to: '/portfolio', label: 'Portfolio', icon: 'portfolio', owner: true }] : []),
  ]
  const nextTheme = theme === 'dark' ? 'light' : 'dark'

  return (
    <ShellContext.Provider value={shellValue}>
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
            <div className="nav-label">Research</div>
            {nav.map((item) => (
              <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => (isActive ? 'on' : undefined)}>
                <Icon name={item.icon} />
                <span>{item.label}</span>
                {item.owner && <span className="own">Owner</span>}
              </NavLink>
            ))}
          </nav>
          <div className="side-foot">
            <div className="user">
              <span className="avatar" aria-hidden="true">
                {(session.username || '?').slice(0, 1).toUpperCase()}
              </span>
              <div>
                <b>{session.username}</b>
                <span>{isOwner ? 'Owner' : 'Read-only'}</span>
              </div>
              <button type="button" className="icon-btn plain" onClick={onLogout} title="Log out" aria-label="Log out">
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
                {/* Portfolio shows live Kite holdings, which this filter doesn't apply to. */}
                {!onPortfolio && <SmallCapToggle checked={hideSmallCaps} onChange={onToggleSmallCaps} />}
                {meta.asOf && (
                  <span className="asof" title="When this data was loaded">
                    <Icon name="clock" />
                    {formatDateTime(meta.asOf)}
                  </span>
                )}
                <button
                  type="button"
                  className={`icon-btn ${meta.loading ? 'spin' : ''}`}
                  onClick={() => setRefreshKey((k) => k + 1)}
                  disabled={meta.loading}
                  title={meta.loading ? 'Loading…' : 'Refresh data'}
                  aria-label="Refresh data"
                >
                  <Icon name="refresh" />
                </button>
                <button
                  type="button"
                  className="icon-btn"
                  onClick={() => setTheme(nextTheme)}
                  title={`Switch to ${nextTheme} theme`}
                  aria-label={`Switch to ${nextTheme} theme`}
                >
                  <Icon name={theme === 'dark' ? 'sun' : 'moon'} />
                </button>
                <button type="button" className="icon-btn mobile-only" onClick={onLogout} title="Log out" aria-label="Log out">
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
}

export default function App() {
  const [theme, setTheme] = useTheme()
  const [session, setSession] = useState({ loading: true, authenticated: false, username: null, role: null, guest: null })
  const [hideSmallCaps, setHideSmallCaps] = useState(loadHideSmallCaps)
  const minMarketCap = hideSmallCaps ? MIN_MARKET_CAP_CR : 0

  function toggleSmallCaps(value) {
    setHideSmallCaps(value)
    saveHideSmallCaps(value)
  }

  function loadSession() {
    return fetch('/api/session')
      .then((r) => r.json())
      .then((data) => setSession({ loading: false, guest: null, ...data }))
      .catch(() => setSession({ loading: false, authenticated: false, username: null, role: null, guest: null }))
  }

  useEffect(() => {
    loadSession()
  }, [])

  function handleLogin({ username, role }) {
    setSession({ loading: false, authenticated: true, username, role, guest: null })
  }

  function handleLogout() {
    fetch('/api/logout', { method: 'POST' }).finally(() => {
      setSession({ loading: false, authenticated: false, username: null, role: null, guest: null })
      // Fetch the session again so the login page can show the guest account.
      loadSession()
    })
  }

  if (session.loading) {
    return (
      <div className="boot" role="status">
        <BrandMark />
        <span>Loading…</span>
      </div>
    )
  }
  if (!session.authenticated) return <Login onLogin={handleLogin} guest={session.guest} />

  return (
    <BrowserRouter>
      <AppShell
        session={session}
        onLogout={handleLogout}
        theme={theme}
        setTheme={setTheme}
        hideSmallCaps={hideSmallCaps}
        onToggleSmallCaps={toggleSmallCaps}
      >
        <Routes>
          <Route path="/" element={<StockScreener minMarketCap={minMarketCap} />} />
          <Route path="/sectors" element={<SectorsBrowser minMarketCap={minMarketCap} />} />
          <Route path="/sectors/:sector" element={<SectorsBrowser minMarketCap={minMarketCap} />} />
          <Route path="/sectors/:sector/:industry" element={<SectorsBrowser minMarketCap={minMarketCap} />} />
          <Route path="/industries" element={<IndustryMomentum minMarketCap={minMarketCap} />} />
          <Route
            path="/portfolio"
            element={session.role === 'owner' ? <Portfolio /> : <Navigate to="/" replace />}
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AppShell>
    </BrowserRouter>
  )
}
