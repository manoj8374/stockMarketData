import { Fragment } from 'react'
import { observer } from 'mobx-react-lite'
import { Icon, WeightBar, WeightRow } from '../../../common/components'
import { MONTH_OPTIONS } from '../models/weights'
import type { ScreenerController } from '../controllers/ScreenerController'

export const ScoringPanel = observer(function ScoringPanel({ controller }: { controller: ScreenerController }) {
  const { months, normalizedWeights, weightSum, scoringOpen } = controller
  const note =
    weightSum === 100
      ? 'Adds up to 100%'
      : `Adds up to ${weightSum.toFixed(0)}% · scaled to ${months.map((m) => `${normalizedWeights[m].toFixed(0)}%`).join(' / ')}`

  return (
    <section className="card">
      <button
        type="button"
        className="sc-head"
        aria-expanded={scoringOpen}
        aria-controls="screener-scoring"
        onClick={controller.toggleScoring}
      >
        <span className="eyebrow">Momentum score</span>
        <span className="formula">
          {weightSum > 0 ? (
            months.map((m, i) => (
              <Fragment key={m}>
                {i > 0 && <span className="f-op">+</span>}
                <span>
                  <b>{normalizedWeights[m].toFixed(0)}%</b> × {m}M
                </span>
              </Fragment>
            ))
          ) : (
            <span className="muted">All weights are 0, so every score is 0</span>
          )}
        </span>
        <span className="sc-edit">
          {scoringOpen ? 'Done' : 'Adjust'}
          <Icon name="chevronDown" />
        </span>
      </button>

      {scoringOpen && (
        <div className="sc-body" id="screener-scoring">
          <div>
            <div className="lbl">
              Return periods <span className="muted">{months.length} selected</span>
            </div>
            <div className="mchips">
              {MONTH_OPTIONS.map((m) => (
                <button type="button" key={m} className="mchip" aria-pressed={months.includes(m)} onClick={() => controller.toggleMonth(m)}>
                  {m}M
                </button>
              ))}
            </div>
            <p className="hint">
              Each period starts where the next shorter one ends. With 1M, 3M and 6M that means today→1M ago, 1M→3M ago and
              3M→6M ago, so no stretch of price action counts twice. A period you add starts at 0% weight.
            </p>
          </div>
          <div>
            <div className="lbl">
              Weights <span className="muted">{note}</span>
            </div>
            <WeightBar items={weightSum > 0 ? months.map((m) => [`${m}M`, normalizedWeights[m] / 100] as const) : null} />
            {months.map((m) => (
              <WeightRow
                key={m}
                id={`scr-w-${m}`}
                label={`${m}M`}
                value={controller.weights[m] ?? 0}
                onChange={(v) => controller.setWeight(m, v)}
              />
            ))}
            <div className="sc-actions">
              <span className="muted small">1M-back and 3M-back scores always use the 1M / 3M / 6M weights.</span>
              <button type="button" className="btn ghost sm" onClick={controller.resetWeights}>
                Reset to 20 / 30 / 50
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
})
