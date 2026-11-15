import { observer } from 'mobx-react-lite'
import { MiniBar, Stat, StatSkeleton } from '../../../common/components'
import { formatPct, tone } from '../../../common/utils/format'
import type { ScreenerController } from '../controllers/ScreenerController'

export const SummaryStrip = observer(function SummaryStrip({ controller }: { controller: ScreenerController }) {
  if (controller.isInitialLoad) {
    return (
      <div className="stat-strip">
        <StatSkeleton />
      </div>
    )
  }
  const s = controller.summary
  const minCap = controller.query.minMarketCap
  const universe = controller.embedded ? 'in this industry' : minCap ? `stocks ≥ ₹${minCap.toLocaleString('en-IN')} Cr` : 'stocks'
  const advancingTone = s.advancingShare >= 0.5 ? 'up' : 'down'

  return (
    <div className="stat-strip">
      <Stat label="Matching" value={s.matching.toLocaleString('en-IN')} sub={`of ${s.total.toLocaleString('en-IN')} ${universe}`} />
      <Stat
        label={`Advancing · ${s.firstMonth}M`}
        value={<span className={`tone ${advancingTone}`}>{s.advancing.toLocaleString('en-IN')}</span>}
        sub={
          <>
            <MiniBar fraction={s.advancingShare} toneClass={advancingTone} />
            {Math.round(s.advancingShare * 100)}% of matches
          </>
        }
      />
      <Stat
        label="Median score"
        value={<span className={`tone ${tone(s.medianScore)}`}>{formatPct(s.medianScore)}</span>}
        sub={s.top ? `Top: ${s.top.stock.symbol} ${formatPct(s.top.momentum, 1)}` : '—'}
      />
      <Stat label="Near all-time high" value={s.nearAth.toLocaleString('en-IN')} sub="within 10% of ATH" />
    </div>
  )
})
