import { observer } from 'mobx-react-lite'
import { useNavigate } from 'react-router-dom'
import { useStores } from '../../../app/useStores'
import { useActivePage, useController } from '../../../common/hooks/useController'
import { BackLink, Banner, Breadth, ErrorState, Icon, Skeleton, StateBlock } from '../../../common/components'
import { formatPct, industryPath, tone } from '../../../common/utils/format'
import { SectorDetailController } from '../controllers/SectorsController'

export const SectorDetailPage = observer(function SectorDetailPage({ sector }: { sector: string }) {
  const { sectors, preferences } = useStores()
  const navigate = useNavigate()
  const controller = useController(
    () => new SectorDetailController({ sectors, preferences }, sector),
    [sectors, preferences, sector]
  )
  useActivePage(controller)
  const { loadError, industries } = controller
  const hasData = controller.resource?.data != null

  let body
  if (loadError && !hasData) {
    body = <ErrorState what="the industries" message={loadError.message} onRetry={controller.refresh} />
  } else if (controller.isInitialLoad) {
    body = Array.from({ length: 5 }, (_, i) => (
      <div className="irow" key={i} aria-hidden="true">
        <Skeleton width="60%" />
        <Skeleton />
        <span className="c-share">
          <Skeleton />
        </span>
        <Skeleton />
        <span className="c-breadth">
          <Skeleton />
        </span>
        <span />
      </div>
    ))
  } else if (industries.length === 0) {
    body = (
      <StateBlock title="No industries here">
        No stocks in this sector pass the current market-cap setting. Turn off “Hide under ₹2,000 Cr” to include smaller
        companies.
      </StateBlock>
    )
  } else {
    body = (
      <>
        <div className="irow ihead" aria-hidden="true">
          <span>Industry</span>
          <span className="num">Stocks</span>
          <span className="c-share">Share of sector</span>
          <span className="num">1M median</span>
          <span className="c-breadth">1M breadth</span>
          <span />
        </div>
        {industries.map((ind) => (
          <button type="button" className="irow" key={ind.name} onClick={() => navigate(industryPath(sector, ind.name))}>
            <span className="nm2">
              <b>{ind.name}</b>
              {!ind.hasMomentumStats && <span>Too few stocks for industry momentum</span>}
            </span>
            <span className="num">{ind.count}</span>
            <span className="ishare c-share">
              <span className="share">
                <i style={{ width: `${(ind.count / controller.largestCount) * 100}%` }} />
              </span>
              {Math.round(ind.shareOf(controller.totalStocks) * 100)}%
            </span>
            <span className={`num tone ${tone(ind.median1m)}`}>{formatPct(ind.median1m, 1)}</span>
            <span className="c-breadth">
              <Breadth value={ind.breadth1m} positive={ind.positive1m} count={ind.withReturn1m} />
            </span>
            <Icon name="chevronRight" />
          </button>
        ))}
      </>
    )
  }

  const count = industries.length
  return (
    <div className="page">
      <div className="page-head">
        <BackLink onClick={() => navigate('/sectors')}>All sectors</BackLink>
        <h1>{sector}</h1>
        <p className="sub">
          {hasData
            ? `${controller.totalStocks.toLocaleString('en-IN')} stocks across ${count} ${count === 1 ? 'industry' : 'industries'}. Pick one to see its stocks.`
            : 'Pick an industry to see its stocks.'}
        </p>
      </div>
      {loadError && hasData && <Banner>Couldn't refresh ({loadError.message}). Showing the last data that loaded.</Banner>}
      <section className="card ilist">{body}</section>
    </div>
  )
})
