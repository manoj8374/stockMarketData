import type { ReactNode } from 'react'
import { observer } from 'mobx-react-lite'
import { Drawer, Icon } from '../../../common/components'
import { formatDate, formatMarketCap, formatMonthYear, formatPct, formatPrice, tone } from '../../../common/utils/format'
import type { ScoredStock } from '../controllers/ScreenerController'
import type { StockModel } from '../models/StockModel'
import { BackScoreTable } from './BackScore'

function Sparkline({ stock, months }: { stock: StockModel; months: readonly number[] }) {
  const points = stock.priceHistory(months)
  if (points.length < 2) return null
  const W = 460
  const H = 130
  const px = 6
  const py = 10
  const oldest = points[0]
  const latest = points[points.length - 1]
  const prices = points.map((p) => p.price)
  const lo = Math.min(...prices)
  const hi = Math.max(...prices)
  const x = (monthsAgo: number) => px + ((oldest.monthsAgo - monthsAgo) / (oldest.monthsAgo || 1)) * (W - 2 * px)
  const y = (v: number) => H - py - ((v - lo) / (hi - lo || 1)) * (H - 2 * py)
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${x(p.monthsAgo).toFixed(1)},${y(p.price).toFixed(1)}`).join('')

  return (
    <figure className={`spark ${latest.price >= oldest.price ? 'up' : 'down'}`}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${stock.symbol} closing prices over ${oldest.monthsAgo} months`}>
        {[0.25, 0.5, 0.75].map((f) => (
          <line key={f} className="sg" x1="0" x2={W} y1={py + f * (H - 2 * py)} y2={py + f * (H - 2 * py)} />
        ))}
        <path className="sa" d={`${path}L${x(latest.monthsAgo).toFixed(1)},${H}L${x(oldest.monthsAgo).toFixed(1)},${H}Z`} />
        <path className="sl" d={path} />
        {points.map((p) => (
          <circle key={p.monthsAgo} className="sp" cx={x(p.monthsAgo)} cy={y(p.price)} r={p === latest ? 4 : 2.2}>
            <title>{`${p.monthsAgo === 0 ? 'Latest' : `${p.monthsAgo}M ago`}: ₹${formatPrice(p.price)}`}</title>
          </circle>
        ))}
      </svg>
      <div className="spark-axis">
        <span>
          {formatMonthYear(oldest.date)} · ₹{formatPrice(oldest.price)}
        </span>
        <span>
          Low ₹{formatPrice(lo)} · High ₹{formatPrice(hi)}
        </span>
        <span>Latest</span>
      </div>
      <figcaption>Closing price at each month mark ({points.length} points)</figcaption>
    </figure>
  )
}

interface QuickLookProps {
  row: ScoredStock
  months: readonly number[]
  weights: Record<number, number>
  backWeights: Record<number, number>
  onClose: () => void
  onOpenIndustry: (() => void) | null
  actions?: ReactNode
}

export const QuickLook = observer(function QuickLook({
  row,
  months,
  weights,
  backWeights,
  onClose,
  onOpenIndustry,
  actions,
}: QuickLookProps) {
  const s = row.stock
  const parts = months.map((m, i) => {
    const ret = s.returnFor(m)
    const w = weights[m] / 100
    return { m, from: i ? months[i - 1] : 0, ret, w, contribution: ret === null ? null : w * ret }
  })
  const maxContribution = Math.max(0.01, ...parts.map((p) => (p.contribution === null ? 0 : Math.abs(p.contribution))))
  const firstReturn = s.returnFor(months[0])

  return (
    <Drawer
      title="Quick look"
      wide
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn ghost" onClick={onClose}>
            Close
          </button>
          {actions}
          {onOpenIndustry && (
            <button type="button" className="btn" onClick={onOpenIndustry}>
              Open {s.industry}
              <Icon name="chevronRight" />
            </button>
          )}
        </>
      }
    >
      <div className="ql-head">
        <div>
          <div className="ql-sym">{s.symbol}</div>
          <div className="muted">{s.name}</div>
          <div className="ql-tags">
            {s.sector && <span className="tagn">{s.sector}</span>}
            {s.industry && <span className="tagn">{s.industry}</span>}
          </div>
        </div>
        <div className="ql-price">
          <b className="num">₹{formatPrice(s.price)}</b>
          <span className={`num tone ${tone(firstReturn)}`}>
            {formatPct(firstReturn)} · {months[0]}M
          </span>
          <span className="muted">{formatMarketCap(s.marketCapCr)}</span>
        </div>
      </div>

      <Sparkline stock={s} months={months} />

      <section>
        <h3 className="h3">
          How the score adds up <span className={`num tone ${tone(row.momentum)}`}>{formatPct(row.momentum)}</span>
        </h3>
        {parts.map((p) => {
          const width = p.contribution === null ? 0 : (Math.abs(p.contribution) / maxContribution) * 50
          const side = p.contribution !== null && p.contribution < 0 ? { right: '50%' } : { left: '50%' }
          return (
            <div className="crow" key={p.m}>
              <span>
                {p.m}M<small>{p.from ? `${p.m}M → ${p.from}M ago` : `${p.m}M ago → today`}</small>
              </span>
              <span className={`num tone ${tone(p.ret)}`}>{formatPct(p.ret)}</span>
              <span className="num muted">× {(p.w * 100).toFixed(0)}%</span>
              <span className={`cbar ${tone(p.contribution)}`} aria-hidden="true">
                <i style={{ ...side, width: `${width}%` }} />
              </span>
              <span className={`num tone ${tone(p.contribution)}`}>{formatPct(p.contribution)}</span>
            </div>
          )
        })}
        {row.momentum === null && (
          <p className="muted small">No score: at least one selected period has no price data for this stock.</p>
        )}
      </section>

      <section>
        <h3 className="h3">All-time high</h3>
        <div className="kv">
          <div>
            <span>ATH</span>
            <b>₹{formatPrice(s.allTimeHigh)}</b>
          </div>
          <div>
            <span>Reached</span>
            <b>{formatDate(s.athDate)}</b>
          </div>
          <div>
            <span>Distance</span>
            <b className={s.isAtAllTimeHigh ? 'tone up' : ''}>{s.isAtAllTimeHigh ? 'At ATH' : formatPct(s.diffFromAth)}</b>
          </div>
        </div>
      </section>

      {([1, 3] as const).map((pivot) => {
        const value = pivot === 1 ? row.back1 : row.back3
        return (
          <section key={pivot}>
            <h3 className="h3">
              {pivot}M-back score <span className={`num tone ${tone(value)}`}>{formatPct(value)}</span>
            </h3>
            <BackScoreTable stock={s} pivot={pivot} />
          </section>
        )
      })}
      <p className="muted small flush">
        Back-scores use the 1M / 3M / 6M weights ({backWeights[1].toFixed(0)}% / {backWeights[3].toFixed(0)}% /{' '}
        {backWeights[6].toFixed(0)}%).
      </p>
    </Drawer>
  )
})
