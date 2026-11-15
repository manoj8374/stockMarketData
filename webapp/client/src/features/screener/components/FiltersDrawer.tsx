import { observer } from 'mobx-react-lite'
import { Drawer } from '../../../common/components'
import type { ScreenerController } from '../controllers/ScreenerController'

const MARKET_CAP_PRESETS = [
  ['≥ ₹1 L Cr', '100000', ''],
  ['₹20k – 1 L Cr', '20000', '100000'],
  ['₹5k – 20k Cr', '5000', '20000'],
  ['Under ₹5k Cr', '', '5000'],
] as const

export const FiltersDrawer = observer(function FiltersDrawer({ controller }: { controller: ScreenerController }) {
  const count = controller.sorted.length
  return (
    <Drawer
      title="Filters"
      onClose={() => controller.setFiltersOpen(false)}
      footer={
        <>
          <button type="button" className="btn ghost" onClick={controller.clearRanges} disabled={!controller.activeRanges.length}>
            Clear ranges
          </button>
          <button type="button" className="btn primary" onClick={() => controller.setFiltersOpen(false)}>
            Show {count.toLocaleString('en-IN')} {count === 1 ? 'stock' : 'stocks'}
          </button>
        </>
      }
    >
      <p className="muted small flush">Filters apply as you type. Leave a box empty for no limit.</p>
      {controller.filterFields.map((field) => {
        const range = controller.rangeFor(field.key)
        return (
          <div className="ff" key={field.key}>
            <div className="lbl">
              {field.label} <span className="muted">{field.unit}</span>
            </div>
            {field.key === 'market_cap_cr' && (
              <div className="presets">
                {MARKET_CAP_PRESETS.map(([text, min, max]) => (
                  <button
                    type="button"
                    className="pchip"
                    key={text}
                    aria-pressed={range.min === min && range.max === max}
                    onClick={() => controller.setRange(field.key, { min, max })}
                  >
                    {text}
                  </button>
                ))}
              </div>
            )}
            <div className="range2">
              <input
                type="number"
                placeholder="Min"
                aria-label={`${field.label} minimum`}
                value={range.min}
                onChange={(e) => controller.updateRange(field.key, 'min', e.target.value)}
              />
              <span className="muted small">to</span>
              <input
                type="number"
                placeholder="Max"
                aria-label={`${field.label} maximum`}
                value={range.max}
                onChange={(e) => controller.updateRange(field.key, 'max', e.target.value)}
              />
            </div>
          </div>
        )
      })}
    </Drawer>
  )
})
