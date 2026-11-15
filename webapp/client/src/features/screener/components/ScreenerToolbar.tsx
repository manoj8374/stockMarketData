import { observer } from 'mobx-react-lite'
import { Icon, Segmented } from '../../../common/components'
import type { Density, ScreenerController } from '../controllers/ScreenerController'

interface Props {
  controller: ScreenerController
  columnsOpen: boolean
  onToggleColumns: (anchor: HTMLElement) => void
}

const DENSITIES = [
  ['cozy', 'Comfortable'],
  ['compact', 'Compact'],
] as const

export const ScreenerToolbar = observer(function ScreenerToolbar({ controller, columnsOpen, onToggleColumns }: Props) {
  const rangeCount = controller.activeRanges.length

  return (
    <div className="toolbar">
      <div className="search">
        <Icon name="search" />
        <input
          type="search"
          placeholder="Search symbol or company"
          aria-label="Search stocks"
          value={controller.search}
          onChange={(e) => controller.setSearch(e.target.value)}
        />
      </div>
      {!controller.embedded && (
        <>
          <select
            value={controller.sectorFilter}
            onChange={(e) => controller.setSectorFilter(e.target.value)}
            aria-label="Sector"
          >
            <option value="">All sectors</option>
            {controller.sectorOptions.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <select
            value={controller.industryFilter}
            onChange={(e) => controller.setIndustryFilter(e.target.value)}
            aria-label="Industry"
          >
            <option value="">All industries</option>
            {controller.industryOptions.map((i) => (
              <option key={i} value={i}>
                {i}
              </option>
            ))}
          </select>
        </>
      )}
      <button type="button" className="btn" onClick={() => controller.setFiltersOpen(true)}>
        <Icon name="sliders" />
        Filters
        {rangeCount > 0 && <span className="badge">{rangeCount}</span>}
      </button>
      <button type="button" className="btn" aria-expanded={columnsOpen} onClick={(e) => onToggleColumns(e.currentTarget)}>
        <Icon name="columns" />
        Columns
      </button>
      <span className="spacer" />
      <Segmented<Density> label="Row density" options={DENSITIES} value={controller.density} onChange={controller.setDensity} />
    </div>
  )
})

export const FilterChips = observer(function FilterChips({ controller }: { controller: ScreenerController }) {
  const chips: Array<{ key: string; label: string; remove: () => void }> = []
  if (controller.search)
    chips.push({ key: 'search', label: `Search: “${controller.search}”`, remove: () => controller.setSearch('') })
  if (!controller.embedded && controller.sectorFilter) {
    chips.push({ key: 'sector', label: `Sector: ${controller.sectorFilter}`, remove: () => controller.setSectorFilter('') })
  }
  if (!controller.embedded && controller.industryFilter) {
    chips.push({
      key: 'industry',
      label: `Industry: ${controller.industryFilter}`,
      remove: () => controller.setIndustryFilter(''),
    })
  }
  for (const field of controller.activeRanges) {
    const { min, max } = controller.rangeFor(field.key)
    const fmt = (v: string) => (field.key === 'market_cap_cr' ? `₹${Number(v).toLocaleString('en-IN')} Cr` : `${v}%`)
    const text =
      min !== '' && max !== ''
        ? `${field.label}: ${fmt(min)} to ${fmt(max)}`
        : min !== ''
          ? `${field.label} ≥ ${fmt(min)}`
          : `${field.label} ≤ ${fmt(max)}`
    chips.push({ key: field.key, label: text, remove: () => controller.setRange(field.key, { min: '', max: '' }) })
  }
  if (!chips.length) return null

  return (
    <div className="chips">
      {chips.map((c) => (
        <span className="chip" key={c.key}>
          {c.label}
          <button type="button" onClick={c.remove} aria-label={`Remove ${c.label}`}>
            <Icon name="x" />
          </button>
        </span>
      ))}
      <button type="button" className="btn ghost sm" onClick={controller.clearFilters}>
        Clear all
      </button>
    </div>
  )
})
