import { observer } from 'mobx-react-lite'
import { Breadth, DivergingBar, HeatPct, SortTh } from '../../../common/components'
import { formatPct, tone } from '../../../common/utils/format'
import { PERIODS, periodDescription } from '../models/industryWeights'
import { METRICS, type IndustriesController, type IndustryRow } from '../controllers/IndustriesController'

const METRIC_LABELS = Object.fromEntries(METRICS)

interface Props {
  controller: IndustriesController
  onOpen: (row: IndustryRow) => void
}

export const IndustryTable = observer(function IndustryTable({ controller, onOpen }: Props) {
  const { metrics, effectiveSorts: sorts, sortBy, maxAbsScore } = controller
  const blend = controller.store.normalizedBlend

  return (
    <div className="tbl-wrap">
      <table className="tbl">
        <thead>
          <tr>
            <SortTh colKey="industry" label="Industry" sorts={sorts} onSort={sortBy} rowSpan={2} className="sticky" />
            <SortTh
              colKey="eligible"
              label="Stocks"
              sorts={sorts}
              onSort={sortBy}
              rowSpan={2}
              className="num"
              title="Stocks included in the calculations (respects the market-cap toggle)"
            />
            <SortTh
              colKey="score"
              label="Industry score"
              sorts={sorts}
              onSort={sortBy}
              rowSpan={2}
              className="num"
              title="Weighted blend of the period scores"
            />
            {PERIODS.map((m) => (
              <th key={m} colSpan={metrics.length} className="th-group">
                {m}M<span className="th-group-sub">{periodDescription(m)}</span>
              </th>
            ))}
          </tr>
          <tr>
            {PERIODS.map((m) =>
              metrics.map((metric, i) => (
                <SortTh
                  key={`${metric}_${m}`}
                  colKey={`${metric}_${m}`}
                  label={METRIC_LABELS[metric]}
                  sorts={sorts}
                  onSort={sortBy}
                  className={`num${i === 0 ? ' gstart' : ''}`}
                  title={`${METRIC_LABELS[metric]}, ${periodDescription(m)}`}
                />
              ))
            )}
          </tr>
        </thead>
        <tbody>
          {controller.sorted.map((row) => {
            const { model } = row
            const open = () => model.sector && onOpen(row)
            return (
              <tr
                key={model.key}
                className={model.sector ? 'click' : undefined}
                tabIndex={model.sector ? 0 : undefined}
                title={model.sector ? `Open the stocks in ${model.industry}` : undefined}
                onClick={open}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') open()
                }}
              >
                <td className="sticky">
                  <div className="ind-cell">
                    <b>{model.industry}</b>
                    <span>{model.sector ?? '—'}</span>
                  </div>
                </td>
                <td className="num">{model.eligible}</td>
                <td className="num">
                  {row.score === null ? (
                    <span className="muted" title="A weighted period has too few stocks with returns">
                      —
                    </span>
                  ) : (
                    <span className={`score ${tone(row.score)}`}>
                      <DivergingBar value={row.score} max={maxAbsScore} />
                      <b className="tone">{formatPct(row.score)}</b>
                    </span>
                  )}
                </td>
                {PERIODS.map((m) => {
                  const st = model.stats(m)
                  const tooFew = `Only ${st.count} stock(s) with a ${m}M return`
                  return metrics.map((metric, i) => {
                    const cls = `num${i === 0 ? ' gstart' : ''}`
                    if (metric === 'breadth') {
                      return (
                        <td
                          key={`${metric}_${m}`}
                          className={cls}
                          title={st.breadth === null ? tooFew : `${st.positive} of ${st.count} stocks rose`}
                        >
                          <Breadth value={st.breadth} positive={st.positive} count={st.count} />
                        </td>
                      )
                    }
                    if (metric === 'score') {
                      const title =
                        st.median === null
                          ? tooFew
                          : `Median ${formatPct(st.median)} · P75 ${formatPct(st.p75)} · Mean ${formatPct(st.mean)} (${st.count} stocks)`
                      return (
                        <td key={`${metric}_${m}`} className={cls} title={title}>
                          <HeatPct value={model.periodScore(m, blend)} />
                        </td>
                      )
                    }
                    const value = model.metric(metric, m, blend)
                    return (
                      <td key={`${metric}_${m}`} className={cls} title={`${st.count} stocks with a ${m}M return`}>
                        <span className={`tone ${tone(value)}`}>{formatPct(value)}</span>
                      </td>
                    )
                  })
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
})
