import { Fragment } from 'react'
import { observer } from 'mobx-react-lite'
import { Icon, WeightBar, WeightRow } from '../../../common/components'
import { BLEND_KEYS, BLEND_LABELS, PERIODS, weightNote } from '../models/industryWeights'
import type { IndustryMomentumStore } from '../stores/IndustryMomentumStore'

interface Props {
  store: IndustryMomentumStore
  open: boolean
  onToggle: () => void
}

export const IndustryScoringPanel = observer(function IndustryScoringPanel({ store, open, onToggle }: Props) {
  const blend = store.normalizedBlend
  const periods = store.normalizedPeriods

  return (
    <section className="card">
      <button type="button" className="sc-head" aria-expanded={open} aria-controls="industry-scoring" onClick={onToggle}>
        <span className="eyebrow">Industry score</span>
        <span className="formula">
          {periods ? (
            PERIODS.map((m, i) => (
              <Fragment key={m}>
                {i > 0 && <span className="f-op">+</span>}
                <span>
                  <b>{Math.round(periods[m] * 100)}%</b> × {m}M
                </span>
              </Fragment>
            ))
          ) : (
            <span className="muted">All period weights are 0, so no scores</span>
          )}
          <span className="f-sub">
            {blend
              ? `each period = ${BLEND_KEYS.map((k) => `${Math.round(blend[k] * 100)}% ${BLEND_LABELS[k].toLowerCase()}`).join(' + ')} of its stocks' returns`
              : 'period blend weights are all 0'}
          </span>
        </span>
        <span className="sc-edit">
          {open ? 'Done' : 'Adjust'}
          <Icon name="chevronDown" />
        </span>
      </button>

      {open && (
        <div className="sc-body even" id="industry-scoring">
          <div>
            <div className="lbl">
              Period score blend <span className="muted">{weightNote(store.blend, BLEND_KEYS)}</span>
            </div>
            <WeightBar items={blend ? BLEND_KEYS.map((k) => [BLEND_LABELS[k], blend[k]] as const) : null} />
            {BLEND_KEYS.map((k) => (
              <WeightRow
                key={k}
                id={`ind-b-${k}`}
                label={BLEND_LABELS[k]}
                value={store.blend[k]}
                onChange={(v) => store.setBlend(k, v)}
              />
            ))}
            <div className="sc-actions">
              <span className="muted small">How each period's score is built from its stocks' returns.</span>
              <button type="button" className="btn ghost sm" onClick={store.resetBlend}>
                Reset to 60 / 25 / 15
              </button>
            </div>
          </div>
          <div>
            <div className="lbl">
              Period weights <span className="muted">{weightNote(store.periodWeights, PERIODS)}</span>
            </div>
            <WeightBar items={periods ? PERIODS.map((m) => [`${m}M`, periods[m]] as const) : null} />
            {PERIODS.map((m) => (
              <WeightRow
                key={m}
                id={`ind-p-${m}`}
                label={`${m}M`}
                value={store.periodWeights[m]}
                onChange={(v) => store.setPeriodWeight(m, v)}
              />
            ))}
            <div className="sc-actions">
              <span className="muted small">Breadth is shown but never part of the score.</span>
              <button type="button" className="btn ghost sm" onClick={store.resetPeriodWeights}>
                Reset to 40 / 30 / 30
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
})
