import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate, Link, useLocation } from 'react-router-dom'
import './App.css'
import Login from './Login'
import Portfolio from './Portfolio'
import StockScreener from './StockScreener'
import SectorsBrowser from './SectorsBrowser'
import IndustryMomentum from './IndustryMomentum'
import { MIN_MARKET_CAP_CR, loadHideSmallCaps, saveHideSmallCaps } from './marketCap'

function SmallCapToggle({ checked, onChange }) {
  return (
    <label
      className="cap-toggle"
      title={`When on, companies with a market cap below ₹${MIN_MARKET_CAP_CR.toLocaleString('en-IN')} Cr (or no market cap on record) are removed from every list, count and industry calculation`}
    >
      <input type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="cap-toggle-track" aria-hidden="true">
        <span className="cap-toggle-thumb" />
      </span>
      <span className="small">Hide &lt; ₹{MIN_MARKET_CAP_CR.toLocaleString('en-IN')} Cr</span>
    </label>
  )
}

function SessionBar({ session, onLogout, hideSmallCaps, onToggleSmallCaps }) {
  const { pathname } = useLocation()
  const onSectors = pathname.startsWith('/sectors')

  return (
    <div className="session-bar">
      <div className="tab-switch">
        <Link className={`btn ${pathname === '/' ? '' : 'subtle'}`} to="/">
          Stocks
        </Link>
        <Link className={`btn ${onSectors ? '' : 'subtle'}`} to="/sectors">
          Sectors
        </Link>
        <Link className={`btn ${pathname === '/industries' ? '' : 'subtle'}`} to="/industries">
          Industries
        </Link>
        {session.role === 'owner' && (
          <Link className={`btn ${pathname === '/portfolio' ? '' : 'subtle'}`} to="/portfolio">
            Portfolio
          </Link>
        )}
      </div>
      <div className="session-info">
        {/* Portfolio shows live Kite holdings, which this filter doesn't apply to. */}
        {pathname !== '/portfolio' && (
          <SmallCapToggle checked={hideSmallCaps} onChange={onToggleSmallCaps} />
        )}
        <span className="muted small">Signed in as {session.username}</span>
        <button className="btn subtle" onClick={onLogout}>Log out</button>
      </div>
    </div>
  )
}

export default function App() {
  const [session, setSession] = useState({ loading: true, authenticated: false, username: null, role: null })
  const [hideSmallCaps, setHideSmallCaps] = useState(loadHideSmallCaps)
  const minMarketCap = hideSmallCaps ? MIN_MARKET_CAP_CR : 0

  function toggleSmallCaps(value) {
    setHideSmallCaps(value)
    saveHideSmallCaps(value)
  }

  useEffect(() => {
    fetch('/api/session')
      .then((r) => r.json())
      .then((data) => setSession({ loading: false, ...data }))
      .catch(() => setSession({ loading: false, authenticated: false }))
  }, [])

  function handleLogin({ username, role }) {
    setSession({ loading: false, authenticated: true, username, role })
  }

  function handleLogout() {
    fetch('/api/logout', { method: 'POST' }).finally(() => {
      setSession({ loading: false, authenticated: false, username: null, role: null })
    })
  }

  if (session.loading) return <div className="empty-state">Loading…</div>
  if (!session.authenticated) return <Login onLogin={handleLogin} />

  return (
    <BrowserRouter>
      <SessionBar
        session={session}
        onLogout={handleLogout}
        hideSmallCaps={hideSmallCaps}
        onToggleSmallCaps={toggleSmallCaps}
      />
      <Routes>
        <Route path="/" element={<StockScreener minMarketCap={minMarketCap} />} />
        <Route path="/sectors" element={<SectorsBrowser minMarketCap={minMarketCap} />} />
        <Route path="/sectors/:sector" element={<SectorsBrowser minMarketCap={minMarketCap} />} />
        <Route path="/sectors/:sector/:industry" element={<SectorsBrowser minMarketCap={minMarketCap} />} />
        <Route path="/industries" element={<IndustryMomentum minMarketCap={minMarketCap} />} />
        <Route
          path="/portfolio"
          element={
            session.role === 'owner' ? (
              <div className="app">
                <Portfolio />
              </div>
            ) : (
              <Navigate to="/" replace />
            )
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
