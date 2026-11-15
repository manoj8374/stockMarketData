import { observer } from 'mobx-react-lite'
import { DivergingBar, HeatPct, Icon, Skeleton, SortTh } from '../../../common/components'
import { formatDate, formatMarketCap, formatPct, formatPrice, tone } from '../../../common/utils/format'
import { GROUP_LABELS, type Column } from '../controllers/screenerColumns'
import type { ScoredStock, ScreenerController } from '../controllers/ScreenerController'

export interface BackAnchor {
  id: number
  pivot: 1 | 3
  el: HTMLElement
}

interface TableProps {
  controller: ScreenerController
  openBack: BackAnchor | null
  onToggleBack: (anchor: BackAnchor | null) => void
}

function groupColumns(columns: Column[]) {
  const groups: Array<{ group: Column['group']; cols: Column[] }> = []
  for (const c of columns) {
    const last = groups[groups.length - 1]
    if (last && c.group && last.group === c.group) last.cols.push(c)
    else groups.push({ group: c.group, cols: [c] })
  }
  return groups
}

const headerClass = (c: Column) => (c.key === 'tradingsymbol' ? 'sticky' : c.type === 'text' ? '' : 'num')

export const ScreenerTable = observer(function ScreenerTable({ controller, openBack, onToggleBack }: TableProps) {
  const columns = controller.visibleColumns
  const groups = groupColumns(columns)
  const groupStarts = new Set(groups.filter((g) => g.group).map((g) => g.cols[0].key))
  const sorts = controller.effectiveSorts

  return (
    <div className="tbl-wrap">
      <table className="tbl">
        <thead>
          <tr>
            {groups.map((g) =>
              g.group ? (
                <th key={`g-${g.group}`} colSpan={g.cols.length} className="th-group">
                  {GROUP_LABELS[g.group]}
                  {g.group === 'returns' && <span className="th-group-sub">non-overlapping</span>}
                </th>
              ) : (
                <SortTh
                  key={g.cols[0].key}
                  colKey={g.cols[0].key}
                  label={g.cols[0].label}
                  sorts={sorts}
                  onSort={controller.sortBy}
                  rowSpan={2}
                  title={g.cols[0].title ?? 'Click to sort, shift-click to add a tie-breaker'}
                  className={headerClass(g.cols[0])}
                />
              )
            )}
          </tr>
          <tr>
            {columns
              .filter((c) => c.group)
              .map((c) => (
                <SortTh
                  key={c.key}
                  colKey={c.key}
                  label={c.label}
                  sorts={sorts}
                  onSort={controller.sortBy}
                  title={c.title}
                  className={`num${groupStarts.has(c.key) ? ' gstart' : ''}`}
                />
              ))}
          </tr>
        </thead>
        <tbody>
          {controller.pageRows.map((row) => (
            <ScreenerRow
              key={row.stock.id}
              row={row}
              columns={columns}
              groupStarts={groupStarts}
              openBack={openBack}
              cellValue={controller.cellValue}
              onOpen={controller.openQuickLook}
              onToggleBack={onToggleBack}
            />
          ))}
        </tbody>
      </table>
    </div>
  )
})

interface RowProps {
  row: ScoredStock
  columns: Column[]
  groupStarts: Set<string>
  openBack: BackAnchor | null
  cellValue: (row: ScoredStock, key: string) => string | number | null
  onOpen: (id: number) => void
  onToggleBack: (anchor: BackAnchor | null) => void
}

const ScreenerRow = observer(function ScreenerRow({
  row,
  columns,
  groupStarts,
  openBack,
  cellValue,
  onOpen,
  onToggleBack,
}: RowProps) {
  const s = row.stock
  return (
    <tr
      className="click"
      tabIndex={0}
      onClick={() => onOpen(s.id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onOpen(s.id)
      }}
    >
      {columns.map((col) => {
        const gs = groupStarts.has(col.key) ? ' gstart' : ''
        switch (col.type) {
          case 'stock':
            return (
              <td key={col.key} className="sticky">
                <div className="stk">
                  <span className="sym">{s.symbol}</span>
                  <span className="nm" title={s.name}>
                    {s.name || '—'}
                  </span>
                </div>
              </td>
            )
          case 'text': {
            const text = col.key === 'sector' ? s.sector : s.industry
            return (
              <td key={col.key} className="txt" title={text ?? undefined}>
                {text || '—'}
              </td>
            )
          }
          case 'marketcap':
            return (
              <td
                key={col.key}
                className="num"
                title={s.marketCapUpdatedAt ? `As of ${formatDate(s.marketCapUpdatedAt)}` : undefined}
              >
                {formatMarketCap(s.marketCapCr)}
              </td>
            )
          case 'price': {
            const value = cellValue(row, col.key)
            return (
              <td
                key={col.key}
                className={`num${gs}`}
                title={col.key === 'all_time_high' && s.athDate ? `Reached ${formatDate(s.athDate)}` : undefined}
              >
                {formatPrice(value)}
              </td>
            )
          }
          case 'pct':
            return (
              <td key={col.key} className={`num${gs}`}>
                <HeatPct value={cellValue(row, col.key)} />
              </td>
            )
          case 'ath': {
            const diff = s.diffFromAth
            if (diff === null)
              return (
                <td key={col.key} className={`num${gs}`}>
                  —
                </td>
              )
            return (
              <td key={col.key} className={`num${gs}`}>
                <span className="ath">
                  {s.isAtAllTimeHigh ? <span className="tag up">At ATH</span> : <span>{formatPct(diff)}</span>}
                  <span className="meter" title="Closeness to the all-time high">
                    <i style={{ width: `${Math.max(0, 100 + diff * 2)}%` }} />
                  </span>
                </span>
              </td>
            )
          }
          case 'momentum':
            if (row.momentum === null)
              return (
                <td key={col.key} className={`num${gs}`}>
                  —
                </td>
              )
            return (
              <td key={col.key} className={`num${gs}`}>
                <span className={`score ${tone(row.momentum)}`}>
                  <DivergingBar value={row.momentum} max={40} />
                  <b className="tone">{formatPct(row.momentum)}</b>
                </span>
              </td>
            )
          case 'back': {
            const pivot = col.pivot as 1 | 3
            const value = pivot === 1 ? row.back1 : row.back3
            const isOpen = openBack?.id === s.id && openBack.pivot === pivot
            return (
              <td key={col.key} className={`num${gs}`}>
                <button
                  type="button"
                  className={`back-btn ${tone(value)}`}
                  aria-haspopup="dialog"
                  aria-expanded={isOpen}
                  title="Show the breakdown"
                  onClick={(e) => {
                    e.stopPropagation()
                    onToggleBack(isOpen ? null : { id: s.id, pivot, el: e.currentTarget })
                  }}
                  onKeyDown={(e) => e.stopPropagation()}
                >
                  {formatPct(value)}
                  <Icon name="chevronDown" />
                </button>
              </td>
            )
          }
        }
      })}
    </tr>
  )
})

export function ScreenerTableSkeleton({ columns }: { columns: Column[] }) {
  return (
    <div className="tbl-wrap" aria-busy="true">
      <table className="tbl">
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} className={headerClass(c)}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: 10 }, (_, r) => (
            <tr key={r}>
              {columns.map((c, i) => (
                <td key={c.key} className={i === 0 ? 'sticky' : ''}>
                  <Skeleton width={i === 0 ? 120 : 48 + ((i * 37) % 40)} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
