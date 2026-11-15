import { useEffect } from 'react'
import { BrowserRouter } from 'react-router-dom'
import { observer } from 'mobx-react-lite'
import { useStores } from './useStores'
import { AppShell } from './layout/AppShell'
import { AppRoutes } from './AppRoutes'
import { BrandMark } from '../common/components'
import { LoginPage } from '../features/auth/components/LoginPage'

export const App = observer(function App() {
  const { auth } = useStores()

  useEffect(() => {
    void auth.loadSession()
  }, [auth])

  if (auth.isBooting) {
    return (
      <div className="boot" role="status">
        <BrandMark />
        <span>Loading…</span>
      </div>
    )
  }

  if (!auth.isAuthenticated) return <LoginPage />

  return (
    <BrowserRouter>
      <AppShell>
        <AppRoutes />
      </AppShell>
    </BrowserRouter>
  )
})
