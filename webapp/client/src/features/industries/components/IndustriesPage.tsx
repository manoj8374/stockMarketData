import { observer } from 'mobx-react-lite'
import { useNavigate } from 'react-router-dom'
import { useStores } from '../../../app/useStores'
import { useActivePage, useController } from '../../../common/hooks/useController'
import {
  Banner,
  ErrorState,
  Icon,
  MiniBar,
  Segmented,
  Skeleton,
  Stat,
  StatSkeleton,
  StateBlock,
} from '../../../common/components'
import { formatPct, industryPath, tone } from '../../../common/utils/format'
import { PERIODS, periodDescription } from '../models/industryWeights'
import type { Metric } from '../models/IndustryMomentumModel'
import { IndustriesController, METRICS, type IndustryRow } from '../controllers/IndustriesController'
import { IndustryScoringPanel } from './IndustryScoringPanel'
import { IndustryTable } from './IndustryTable'

const Summary = observer(function Summary({ controller }: { controller: IndustriesController }) {
  if (controller.isInitialLoad || !controller.data) {
    return (
      <div className="stat-strip">
        <StatSkeleton />
      </div>
    )
  }
  const s = controller.summary
  const positiveTone = s.positive * 2 >= s.scoredCount ? 'up' : 'down'
  return (
    <div className="stat-strip">
      <Stat
        label="Industries ranked"
        value={s.ranked.toLocaleString('en-IN')}
        sub={`${s.excluded} hidden · under ${s.minStocks} stocks`}
      />
      <Stat
        label="Stocks covered"
        value={s.eligibleStocks.toLocaleString('en-IN')}
        sub={s.minMarketCap ? `market cap ≥ ₹${s.minMarketCap.toLocaleString('en-IN')} Cr` : 'all market caps'}
      />
      <Stat
        label="Positive score"
        value={<span className={`tone ${positiveTone}`}>{s.positive}</span>}
        sub={
          <>
            <MiniBar fraction={s.scoredCount ? s.positive / s.scoredCount : 0} toneClass={positiveTone} />
            of {s.scoredCount} scored industries
          </>
        }
      />
      <Stat
        label="Breadth · 1M"
        value={
          s.breadth ? (
            <span className={`tone ${s.breadth.share >= 0.5 ? 'up' : 'down'}`}>{Math.round(s.breadth.share * 100)}%</span>
          ) : (
            '—'
          )
        }
        sub={s.breadth ? `${s.breadth.up} of ${s.breadth.total} stocks rose this month` : 'not enough data'}
      />
    </div>
  )
})

function LeaderRow({
  row,
  rank,
  max,
  onOpen,
}: {
  row: IndustryRow
  rank: number
  max: number
  onOpen: (row: IndustryRow) => void
}) {
  const score = row.score as number
  return (
    <button type="button" className="lead-row" onClick={() => onOpen(row)}>
      <span className="rk">{rank}</span>
      <span className="nm2">
        <b>{row.model.industry}</b>
        <span>{row.model.sector}</span>
      </span>
      <span className={`hbar ${tone(score)}`} aria-hidden="true">
        <i style={{ width: `${(Math.abs(score) / max) * 100}%` }} />
      </span>
      <span className={`num tone ${tone(score)}`}>{formatPct(score, 1)}</span>
    </button>
  )
}

const Leaderboards = observer(function Leaderboards({
  controller,
  onOpen,
}: {
  controller: IndustriesController
  onOpen: (row: IndustryRow) => void
}) {
  if (controller.isInitialLoad) {
    return (
      <div className="lead-grid" aria-hidden="true">
        {['Leading', 'Lagging'].map((title) => (
          <section className="card lead-card" key={title}>
            <header>
              <h3>{title}</h3>
            </header>
            {[0, 1, 2, 3, 4].map((i) => (
              <div className="lead-row" key={i}>
                <Skeleton width={12} />
                <Skeleton width="70%" />
                <Skeleton />
                <Skeleton />
              </div>
            ))}
          </section>
        ))}
      </div>
    )
  }
  if (!controller.ranked.length) return null
  const { leaderCount, maxAbsScore } = controller
  const total = controller.ranked.length
  return (
    <div className="lead-grid">
      <section className="card lead-card">
        <header>
          <h3>Leading</h3>
          <span className="muted small">Top {leaderCount} by score</span>
        </header>
        {controller.leaders.map((row, i) => (
          <LeaderRow key={row.model.key} row={row} rank={i + 1} max={maxAbsScore} onOpen={onOpen} />
        ))}
      </section>
      <section className="card lead-card">
        <header>
          <h3>Lagging</h3>
          <span className="muted small">Bottom {leaderCount} by score</span>
        </header>
        {controller.laggards.map((row, i) => (
          <LeaderRow key={row.model.key} row={row} rank={total - i} max={maxAbsScore} onOpen={onOpen} />
        ))}
      </section>
    </div>
  )
})

export const IndustriesPage = observer(function IndustriesPage() {
  const { industryMomentum, preferences } = useStores()
  const navigate = useNavigate()
  const controller = useController(
    () => new IndustriesController({ industryMomentum, preferences }),
    [industryMomentum, preferences]
  )
  useActivePage(controller)
  const open = (row: IndustryRow) => {
    if (row.model.sector) navigate(industryPath(row.model.sector, row.model.industry))
  }
  const { data, loadError } = controller

  return (
    <div className="page">
      <div className="page-head">
        <h1>Industry momentum</h1>
        <p className="sub">
          Which industries are leading, and how many of their stocks are taking part. Click any industry to see its stocks.
        </p>
      </div>

      <Summary controller={controller} />
      <Leaderboards controller={controller} onOpen={open} />
      <IndustryScoringPanel store={industryMomentum} open={controller.scoringOpen} onToggle={controller.toggleScoring} />

      <div className="toolbar">
        <div className="search">
          <Icon name="search" />
          <input
            type="search"
            placeholder="Search industry or sector"
            aria-label="Search industries"
            value={controller.search}
            onChange={(e) => controller.setSearch(e.target.value)}
          />
        </div>
        <span className="spacer" />
        <span className="muted small">Per period, show</span>
        <Segmented<Metric>
          label="Metrics per period"
          options={METRICS}
          value={controller.metrics}
          onChange={controller.toggleMetric}
        />
      </div>

      {loadError && data && <Banner>Couldn't refresh the data ({loadError.message}). Showing the last data that loaded.</Banner>}

      <section className="card table-card">
        {loadError && !data ? (
          <ErrorState what="industry momentum" message={loadError.message} onRetry={controller.refresh} />
        ) : controller.isInitialLoad ? (
          <div className="skeleton-list" aria-busy="true">
            {Array.from({ length: 8 }, (_, i) => (
              <Skeleton key={i} width={`${92 - i * 4}%`} />
            ))}
          </div>
        ) : controller.sorted.length === 0 ? (
          <StateBlock
            title="No industries match"
            actions={
              controller.search && (
                <button type="button" className="btn" onClick={() => controller.setSearch('')}>
                  Clear search
                </button>
              )
            }
          >
            {controller.search
              ? `Nothing matches “${controller.search}”. Try a sector name or a shorter word.`
              : `No industry has ${controller.summary.minStocks} or more stocks under the current market-cap setting.`}
          </StateBlock>
        ) : (
          <IndustryTable controller={controller} onOpen={open} />
        )}
        {data && (
          <p className="tbl-foot">
            Returns don't overlap: {PERIODS.map((m) => `${m}M is ${periodDescription(m)}`).join(', ')}. Stocks without a return
            for a period are left out of that period. Breadth is the share of stocks with a positive return; it is shown next to
            the score but is not part of it.
            {data.excludedIndustries > 0 &&
              ` ${data.excludedIndustries} ${data.excludedIndustries === 1 ? 'industry is' : 'industries are'} hidden because ${
                data.excludedIndustries === 1 ? 'it has' : 'they have'
              } fewer than ${data.minStocks} stocks.`}
          </p>
        )}
      </section>
    </div>
  )
})
