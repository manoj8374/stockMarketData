import { observer } from 'mobx-react-lite'
import { useNavigate } from 'react-router-dom'
import { useStores } from '../../../app/useStores'
import { useActivePage, useController } from '../../../common/hooks/useController'
import { Banner, ErrorState, Icon, Segmented, Skeleton, StateBlock } from '../../../common/components'
import { formatPct, sectorPath, tone } from '../../../common/utils/format'
import { SECTOR_SORTS, SectorsController, type SectorSort } from '../controllers/SectorsController'
import type { GroupSummaryModel } from '../models/GroupSummaryModel'

function SectorCard({ sector, total, onOpen }: { sector: GroupSummaryModel; total: number; onOpen: () => void }) {
  const share = sector.shareOf(total)
  return (
    <button type="button" className="scard" onClick={onOpen}>
      <span className="scard-top">
        <h3>{sector.name}</h3>
        <Icon name="chevronRight" />
      </span>
      <span className="scount">
        <b>{sector.count.toLocaleString('en-IN')}</b>
        stocks
        {sector.industries !== null && ` · ${sector.industries} ${sector.industries === 1 ? 'industry' : 'industries'}`}
      </span>
      <span className="share" title={`${Math.round(share * 100)}% of all stocks`}>
        <i style={{ width: `${share * 100}%` }} />
      </span>
      <span className="sfoot">
        <span>
          1M median <b className={`tone ${tone(sector.median1m)}`}>{formatPct(sector.median1m, 1)}</b>
        </span>
        <span>
          Breadth{' '}
          <b className={sector.breadth1m === null ? '' : `tone ${sector.breadth1m >= 50 ? 'up' : 'down'}`}>
            {sector.breadth1m === null ? '—' : `${sector.breadth1m.toFixed(0)}%`}
          </b>
        </span>
      </span>
    </button>
  )
}

export const SectorsPage = observer(function SectorsPage() {
  const { sectors, preferences } = useStores()
  const navigate = useNavigate()
  const controller = useController(() => new SectorsController({ sectors, preferences }), [sectors, preferences])
  useActivePage(controller)
  const { loadError, isInitialLoad } = controller
  const hasData = controller.resource?.data != null

  let body
  if (loadError && !hasData) {
    body = (
      <div className="card span-all">
        <ErrorState what="the sectors" message={loadError.message} onRetry={controller.refresh} />
      </div>
    )
  } else if (isInitialLoad) {
    body = Array.from({ length: 6 }, (_, i) => (
      <div className="scard" key={i} aria-hidden="true">
        <Skeleton width="60%" height={14} />
        <Skeleton width="35%" height={24} />
        <Skeleton height={4} />
        <Skeleton width="80%" />
      </div>
    ))
  } else if (controller.visible.length === 0) {
    body = (
      <div className="card span-all">
        <StateBlock
          title="No sectors found"
          actions={
            controller.search && (
              <button type="button" className="btn" onClick={() => controller.setSearch('')}>
                Clear search
              </button>
            )
          }
        >
          {controller.search ? `Nothing matches “${controller.search}”.` : 'No sectors have stocks under the current market-cap setting.'}
        </StateBlock>
      </div>
    )
  } else {
    body = controller.visible.map((s) => (
      <SectorCard key={s.name} sector={s} total={controller.totalStocks} onOpen={() => navigate(sectorPath(s.name))} />
    ))
  }

  return (
    <div className="page">
      <div className="page-head">
        <h1>Sectors</h1>
        <p className="sub">Browse the universe by sector, then open an industry to see its stocks.</p>
      </div>
      {loadError && hasData && <Banner>Couldn't refresh ({loadError.message}). Showing the last data that loaded.</Banner>}
      <div className="toolbar">
        <div className="search">
          <Icon name="search" />
          <input
            type="search"
            placeholder="Search sectors"
            aria-label="Search sectors"
            value={controller.search}
            onChange={(e) => controller.setSearch(e.target.value)}
          />
        </div>
        <span className="spacer" />
        <span className="muted small">Sort</span>
        <Segmented<SectorSort> label="Sort sectors" options={SECTOR_SORTS} value={controller.sortBy} onChange={controller.setSortBy} />
      </div>
      <div className="sgrid">{body}</div>
      <p className="muted small flush">
        1M median is the middle 1-month return of the sector's stocks. Breadth is the share of them that rose over the month. Both
        need at least 3 stocks with a 1-month return.
      </p>
    </div>
  )
})
