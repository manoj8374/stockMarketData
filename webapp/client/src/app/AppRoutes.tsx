import { /* lazy, */ Suspense } from 'react'
import { Navigate, Route, Routes, useParams } from 'react-router-dom'
import { observer } from 'mobx-react-lite'
import { useStores } from './useStores'
import { ScreenerPage } from '../features/screener/components/ScreenerPage'
import { SectorsPage } from '../features/sectors/components/SectorsPage'
import { SectorDetailPage } from '../features/sectors/components/SectorDetailPage'
import { IndustryDrillPage } from '../features/sectors/components/IndustryDrillPage'
import { IndustriesPage } from '../features/industries/components/IndustriesPage'
import { PortfolioPage } from '../features/portfolio/components/PortfolioPage'
import { Skeleton } from '../common/components'

// Live markets are hidden for now.
// The live pages pull in Chart.js; loading them on demand keeps it out of the
// first download for everyone who only uses the screener.
// const WatchlistPage = lazy(() => import('../features/live/components/WatchlistPage').then((m) => ({ default: m.WatchlistPage })))
// const OptionChainPage = lazy(() =>
//   import('../features/live/components/OptionChainPage').then((m) => ({ default: m.OptionChainPage }))
// )

function PageLoading() {
  return (
    <div className="page" aria-busy="true">
      <Skeleton width="30%" height={28} />
      <Skeleton height={240} />
    </div>
  )
}

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
    <Suspense fallback={<PageLoading />}>
      <Routes>
        <Route path="/" element={<ScreenerPage />} />
        <Route path="/sectors" element={<SectorsPage />} />
        <Route path="/sectors/:sector" element={<SectorRoute />} />
        <Route path="/sectors/:sector/:industry" element={<IndustryRoute />} />
        <Route path="/industries" element={<IndustriesPage />} />
        {/* <Route path="/watchlist" element={<WatchlistPage />} /> */}
        {/* <Route path="/option-chain" element={<OptionChainPage />} /> */}
        <Route path="/portfolio" element={auth.isOwner ? <PortfolioPage /> : <Navigate to="/" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  )
})
