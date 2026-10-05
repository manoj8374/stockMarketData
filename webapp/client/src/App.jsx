import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate, Link, useLocation } from 'react-router-dom'
import './App.css'
import Login from './Login'
import Portfolio from './Portfolio'
import StockScreener from './StockScreener'
import SectorsBrowser from './SectorsBrowser'
import IndustryMomentum from './IndustryMomentum'

function SessionBar({ session, onLogout }) {
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
        <span className="muted small">Signed in as {session.username}</span>
        <button className="btn subtle" onClick={onLogout}>Log out</button>
      </div>
    </div>
  )
}

export default function App() {
  const [session, setSession] = useState({ loading: true, authenticated: false, username: null, role: null })

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
      <SessionBar session={session} onLogout={handleLogout} />
      <Routes>
        <Route path="/" element={<StockScreener />} />
        <Route path="/sectors" element={<SectorsBrowser />} />
        <Route path="/sectors/:sector" element={<SectorsBrowser />} />
        <Route path="/sectors/:sector/:industry" element={<SectorsBrowser />} />
        <Route path="/industries" element={<IndustryMomentum />} />
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
