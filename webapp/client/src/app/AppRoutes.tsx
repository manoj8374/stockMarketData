import { Navigate, Route, Routes, useParams } from 'react-router-dom'
import { observer } from 'mobx-react-lite'
import { useStores } from './useStores'
import { ScreenerPage } from '../features/screener/components/ScreenerPage'
import { SectorsPage } from '../features/sectors/components/SectorsPage'
import { SectorDetailPage } from '../features/sectors/components/SectorDetailPage'
import { IndustryDrillPage } from '../features/sectors/components/IndustryDrillPage'
import { IndustriesPage } from '../features/industries/components/IndustriesPage'
import { PortfolioPage } from '../features/portfolio/components/PortfolioPage'
import { WatchlistPage } from '../features/live/components/WatchlistPage'

function SectorRoute() {
  const { sector = '' } = useParams()
  return <SectorDetailPage key={sector} sector={sector} />
}

function IndustryRoute() {
  const { sector = '', industry = '' } = useParams()
  return <IndustryDrillPage key={`${sector}\u0000${industry}`} sector={sector} industry={industry} />
}

export const AppRoutes = observer(function AppRoutes() {
  const { auth } = useStores()

  return (
    <Routes>
      <Route path="/" element={<ScreenerPage />} />
      <Route path="/sectors" element={<SectorsPage />} />
      <Route path="/sectors/:sector" element={<SectorRoute />} />
      <Route path="/sectors/:sector/:industry" element={<IndustryRoute />} />
      <Route path="/industries" element={<IndustriesPage />} />
      <Route path="/watchlist" element={<WatchlistPage />} />
      <Route path="/portfolio" element={auth.isOwner ? <PortfolioPage /> : <Navigate to="/" replace />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
})
