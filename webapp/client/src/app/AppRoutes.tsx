import { Navigate, Route, Routes } from 'react-router-dom'
import { observer } from 'mobx-react-lite'
import { useStores } from './useStores'
import { ScreenerPage } from '../features/screener/components/ScreenerPage'
import SectorsBrowser from '../SectorsBrowser'
import IndustryMomentum from '../IndustryMomentum'
import Portfolio from '../Portfolio'

export const AppRoutes = observer(function AppRoutes() {
  const { auth, preferences } = useStores()
  const minMarketCap = preferences.minMarketCap

  return (
    <Routes>
      <Route path="/" element={<ScreenerPage />} />
      <Route path="/sectors" element={<SectorsBrowser minMarketCap={minMarketCap} />} />
      <Route path="/sectors/:sector" element={<SectorsBrowser minMarketCap={minMarketCap} />} />
      <Route path="/sectors/:sector/:industry" element={<SectorsBrowser minMarketCap={minMarketCap} />} />
      <Route path="/industries" element={<IndustryMomentum minMarketCap={minMarketCap} />} />
      <Route path="/portfolio" element={auth.isOwner ? <Portfolio /> : <Navigate to="/" replace />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
})
