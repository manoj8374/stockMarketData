import type { ReactNode } from 'react'
import { Icon } from './Icon'
import { percentLabel } from '../utils/format'
import type { SortSpec } from '../utils/sort'

interface SegmentedProps<T extends string | number> {
  label: string
  options: ReadonlyArray<readonly [T, ReactNode]>
  value: T | readonly T[]
  onChange: (value: T) => void
  size?: 'sm'
}

export function Segmented<T extends string | number>({ label, options, value, onChange, size }: SegmentedProps<T>) {
  const isPressed = (v: T) => (Array.isArray(value) ? value.includes(v) : value === v)
  return (
    <div className={`seg ${size === 'sm' ? 'seg-sm' : ''}`} role="group" aria-label={label}>
      {options.map(([v, text]) => (
        <button type="button" key={String(v)} aria-pressed={isPressed(v)} onClick={() => onChange(v)}>
          {text}
        </button>
      ))}
    </div>
  )
}

export function BackLink({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" className="backlink" onClick={onClick}>
      <Icon name="chevronLeft" />
      {children}
    </button>
  )
}

interface SortThProps {
  colKey: string
  label: ReactNode
  sorts: readonly SortSpec[]
  onSort: (key: string, additive: boolean) => void
  className?: string
  title?: string
  rowSpan?: number
}

export function SortTh({ colKey, label, sorts, onSort, className = '', title, rowSpan }: SortThProps) {
  const index = sorts.findIndex((s) => s.key === colKey)
  const active = index >= 0 ? sorts[index] : null
  return (
    <th
      className={`sortable ${active ? 'sorted' : ''} ${className}`}
      rowSpan={rowSpan}
      title={title}
      aria-sort={active ? (active.direction === 'asc' ? 'ascending' : 'descending') : 'none'}
      tabIndex={0}
      onClick={(e) => onSort(colKey, e.shiftKey)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onSort(colKey, e.shiftKey)
        }
      }}
    >
      <span className="th-inner">
        {label}
        {active && (
          <span className="sort-arrow">
            {active.direction === 'asc' ? '↑' : '↓'}
            {sorts.length > 1 && <sup>{index + 1}</sup>}
          </span>
        )}
      </span>
    </th>
  )
}

export function WeightBar({ items }: { items: Array<readonly [string, number]> | null }) {
  const visible = (items ?? []).filter(([, f]) => f > 0)
  return (
    <div className="wbar">
      {visible.length === 0 ? (
        <span className="wbar-empty">No weight assigned yet</span>
      ) : (
        visible.map(([label, f]) => (
          <i key={label} style={{ flexGrow: f }} title={`${label} ${percentLabel(f)}`}>
            {f >= 0.11 ? `${label} ${percentLabel(f)}` : ''}
          </i>
        ))
      )}
    </div>
  )
}

interface WeightRowProps {
  id: string
  label: string
  value: number | string
  onChange: (value: string) => void
}

export function WeightRow({ id, label, value, onChange }: WeightRowProps) {
  const numeric = Number(value)
  const sliderValue = Number.isFinite(numeric) ? Math.min(100, Math.max(0, numeric)) : 0
  return (
    <div className="wrow">
      <label className="wm" htmlFor={`${id}-range`}>
        {label}
      </label>
      <input
        id={`${id}-range`}
        type="range"
        min={0}
        max={100}
        step={1}
        value={sliderValue}
        onChange={(e) => onChange(e.target.value)}
      />
      <input
        id={`${id}-num`}
        type="number"
        min={0}
        value={value}
        aria-label={`${label} weight`}
        onChange={(e) => onChange(e.target.value)}
      />
      <span className="unit">%</span>
    </div>
  )
}

function pageList(cur: number, total: number): Array<number | string> {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  const wanted = [...new Set([1, total, cur - 1, cur, cur + 1])].filter((p) => p >= 1 && p <= total).sort((a, b) => a - b)
  const out: Array<number | string> = []
  wanted.forEach((p, i) => {
    if (i > 0 && p - wanted[i - 1] > 1) out.push(`gap-${p}`)
    out.push(p)
  })
  return out
}

interface PaginationProps {
  page: number
  totalPages: number
  total: number
  pageSize: number
  pageSizeOptions: readonly number[]
  onPage: (page: number) => void
  onPageSize: (size: number) => void
  noun?: string
}

export function Pagination({
  page,
  totalPages,
  total,
  pageSize,
  pageSizeOptions,
  onPage,
  onPageSize,
  noun = 'stocks',
}: PaginationProps) {
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1
  const end = Math.min(page * pageSize, total)
  return (
    <div className="pager">
      <div>
        Showing{' '}
        <b>
          {start.toLocaleString('en-IN')}–{end.toLocaleString('en-IN')}
        </b>{' '}
        of <b>{total.toLocaleString('en-IN')}</b> {noun}
      </div>
      <div className="pager-r">
        <label className="small">
          Rows per page{' '}
          <select value={pageSize} onChange={(e) => onPageSize(Number(e.target.value))}>
            {pageSizeOptions.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <nav className="pages" aria-label="Pages">
          <button type="button" onClick={() => onPage(page - 1)} disabled={page === 1} aria-label="Previous page">
            <Icon name="chevronLeft" />
          </button>
          {pageList(page, totalPages).map((p) =>
            typeof p === 'string' ? (
              <span key={p} className="gap">
                …
              </span>
            ) : (
              <button type="button" key={p} onClick={() => onPage(p)} aria-current={p === page ? 'page' : undefined}>
                {p}
              </button>
            )
          )}
          <button type="button" onClick={() => onPage(page + 1)} disabled={page === totalPages} aria-label="Next page">
            <Icon name="chevronRight" />
          </button>
        </nav>
      </div>
    </div>
  )
}
