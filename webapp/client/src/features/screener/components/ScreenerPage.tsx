import { useEffect, useState, type ReactNode } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { reaction } from 'mobx'
import { observer } from 'mobx-react-lite'
import { useStores } from '../../../app/useStores'
import { useActivePage, useController } from '../../../common/hooks/useController'
import { BackLink, Banner, FloatingPanel, Icon, Pagination, StateBlock } from '../../../common/components'
import { industryPath } from '../../../common/utils/format'
import { PAGE_SIZE_OPTIONS, ScreenerController } from '../controllers/ScreenerController'
import { SummaryStrip } from './SummaryStrip'
import { ScoringPanel } from './ScoringPanel'
import { FilterChips, ScreenerToolbar } from './ScreenerToolbar'
import { ScreenerTable, ScreenerTableSkeleton, type BackAnchor } from './ScreenerTable'
import { FiltersDrawer } from './FiltersDrawer'
import { ColumnsMenu } from './ColumnsMenu'
import { BackScorePanel } from './BackScore'
import { QuickLook } from './QuickLook'
// Live markets are hidden for now, so the "Add to watchlist" button is too.
// import type { WatchlistStore } from '../../live/stores/WatchlistStore'
//
// const WatchlistButton = observer(function WatchlistButton({ symbol, watchlist }: { symbol: string; watchlist: WatchlistStore }) {
//   const added = watchlist.has(symbol)
//   return (
//     <button type="button" className="btn" disabled={added || watchlist.isFull} onClick={() => watchlist.add(symbol)}>
//       <Icon name={added ? 'watchlist' : 'plus'} />
//       {added ? 'In watchlist' : 'Add to watchlist'}
//     </button>
//   )
// })

interface ScreenerPageProps {
  fixedSector?: string
  fixedIndustry?: string
  onBack?: () => void
  headerExtra?: ReactNode
}

export const ScreenerPage = observer(function ScreenerPage({
  fixedSector,
  fixedIndustry,
  onBack,
  headerExtra,
}: ScreenerPageProps) {
  const { stocks, preferences /* , watchlist */ } = useStores()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const controller = useController(
    () => new ScreenerController({ stocks, preferences }, { fixedSector, fixedIndustry, initialParams: searchParams }),
    [stocks, preferences, fixedSector, fixedIndustry]
  )
  const [columnsAnchor, setColumnsAnchor] = useState<HTMLElement | null>(null)
  const [openBack, setOpenBack] = useState<BackAnchor | null>(null)
  useActivePage(controller)

  useEffect(
    () =>
      reaction(
        () => controller.urlParams,
        (params) => setSearchParams(new URLSearchParams(params), { replace: true })
      ),
    [controller, setSearchParams]
  )

  useEffect(() => {
    if (searchParams.toString() !== controller.urlParams) controller.applyUrlParams(searchParams)
  }, [searchParams, controller])

  const backRow = openBack ? controller.rowById(openBack.id) : null
  const quickRow = controller.quickRow
  const error = controller.loadError

  return (
    <div className={`page ${controller.density === 'compact' ? 'compact' : ''}`}>
      {onBack ? (
        <div className="page-head">
          <BackLink onClick={onBack}>{fixedSector}</BackLink>
          <div className="ph-row">
            <div>
              <h1>{fixedIndustry ?? fixedSector}</h1>
              <p className="sub">Every stock in this industry, scored the same way as the screener.</p>
            </div>
            {headerExtra}
          </div>
        </div>
      ) : (
        <div className="page-head">
          <h1>Screener</h1>
          <p className="sub">Every NSE equity ranked by weighted price momentum. Click a row for a quick look.</p>
        </div>
      )}

      <SummaryStrip controller={controller} />
      <ScoringPanel controller={controller} />
      <ScreenerToolbar
        controller={controller}
        columnsOpen={columnsAnchor !== null}
        onToggleColumns={(el) => setColumnsAnchor((current) => (current ? null : el))}
      />
      <FilterChips controller={controller} />

      {error && controller.stocks.length > 0 && (
        <Banner>Couldn't refresh the data ({error.message}). Showing the last data that loaded.</Banner>
      )}

      <section className="card table-card">
        {error && controller.stocks.length === 0 ? (
          <StateBlock
            kind="error"
            title="Couldn't load the stocks"
            actions={
              <button type="button" className="btn primary" onClick={controller.refresh}>
                <Icon name="refresh" />
                Try again
              </button>
            }
          >
            The server returned an error ({error.message}). Your filters and weights are kept.
          </StateBlock>
        ) : controller.isInitialLoad ? (
          <ScreenerTableSkeleton columns={controller.visibleColumns} />
        ) : controller.sorted.length === 0 ? (
          <StateBlock
            title="No stocks match these filters"
            actions={
              controller.filtersActive && (
                <button type="button" className="btn" onClick={controller.clearFilters}>
                  Clear all filters
                </button>
              )
            }
          >
            {controller.filtersActive
              ? 'Loosen a range, pick another sector, or clear everything to see the full list.'
              : 'There are no stocks with price data for this selection.'}
          </StateBlock>
        ) : (
          <>
            <ScreenerTable controller={controller} openBack={openBack} onToggleBack={setOpenBack} />
            <Pagination
              page={controller.currentPage}
              totalPages={controller.totalPages}
              total={controller.sorted.length}
              pageSize={controller.pageSize}
              pageSizeOptions={PAGE_SIZE_OPTIONS}
              onPage={controller.setPage}
              onPageSize={controller.setPageSize}
            />
          </>
        )}
      </section>

      {columnsAnchor && <ColumnsMenu controller={controller} anchor={columnsAnchor} onClose={() => setColumnsAnchor(null)} />}

      {openBack && backRow && (
        <FloatingPanel anchorEl={openBack.el} onClose={() => setOpenBack(null)} label="Back-score breakdown">
          <BackScorePanel
            stock={backRow.stock}
            pivot={openBack.pivot}
            value={openBack.pivot === 1 ? backRow.back1 : backRow.back3}
            backWeights={controller.backWeights}
          />
        </FloatingPanel>
      )}

      {controller.filtersOpen && <FiltersDrawer controller={controller} />}

      {quickRow && (
        <QuickLook
          row={quickRow}
          months={controller.months}
          weights={controller.normalizedWeights}
          backWeights={controller.backWeights}
          onClose={controller.closeQuickLook}
          // actions={<WatchlistButton symbol={`NSE:${quickRow.stock.symbol}`} watchlist={watchlist} />}
          onOpenIndustry={
            !controller.embedded && quickRow.stock.sector && quickRow.stock.industry
              ? () => navigate(industryPath(quickRow.stock.sector as string, quickRow.stock.industry as string))
              : null
          }
        />
      )}
    </div>
  )
})
