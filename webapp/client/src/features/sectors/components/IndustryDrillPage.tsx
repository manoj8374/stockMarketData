import { observer } from 'mobx-react-lite'
import { useNavigate } from 'react-router-dom'
import { useStores } from '../../../app/useStores'
import { useController } from '../../../common/hooks/useController'
import { Skeleton } from '../../../common/components'
import { formatPct, sectorPath, tone } from '../../../common/utils/format'
import { ScreenerPage } from '../../screener/components/ScreenerPage'
import { IndustryDrillController } from '../controllers/IndustryDrillController'

const IndustryHeaderStats = observer(function IndustryHeaderStats({ controller }: { controller: IndustryDrillController }) {
  if (controller.isLoading) {
    return (
      <div className="head-stats" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <div className="hs" key={i}>
            <Skeleton width="70%" />
            <Skeleton width="50%" height={16} />
          </div>
        ))}
      </div>
    )
  }
  const stats = controller.stats
  if (!stats) {
    if (controller.resource?.hasFailed) return null
    return <p className="muted small head-note">Too few stocks for industry momentum stats (needs {controller.minStocks}).</p>
  }
  return (
    <div className="head-stats">
      <div className="hs">
        <span>Industry score</span>
        <b className={`tone ${tone(stats.score)}`}>{formatPct(stats.score)}</b>
      </div>
      <div className="hs">
        <span>1M breadth</span>
        <b>
          {stats.breadth === null ? '—' : `${stats.breadth.toFixed(0)}%`}
          {stats.breadth !== null && (
            <span className="muted small">
              {' '}
              {stats.positive}/{stats.count}
            </span>
          )}
        </b>
      </div>
      <div className="hs">
        <span>1M median</span>
        <b className={`tone ${tone(stats.median)}`}>{formatPct(stats.median)}</b>
      </div>
    </div>
  )
})

export const IndustryDrillPage = observer(function IndustryDrillPage({ sector, industry }: { sector: string; industry: string }) {
  const { industryMomentum, preferences } = useStores()
  const navigate = useNavigate()
  const controller = useController(
    () => new IndustryDrillController({ industryMomentum, preferences }, sector, industry),
    [industryMomentum, preferences, sector, industry]
  )

  return (
    <ScreenerPage
      key={`${sector}\u0000${industry}`}
      fixedSector={sector}
      fixedIndustry={industry}
      onBack={() => navigate(sectorPath(sector))}
      headerExtra={<IndustryHeaderStats controller={controller} />}
    />
  )
})
