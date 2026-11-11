import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { formatPct, isNum, percentLabel, tone } from './format'

/* ---------- icons ---------- */

const PATHS = {
  screener: (
    <>
      <path d="M7 3v18M17 3v18" />
      <rect x="5" y="7" width="4" height="8" rx="1" />
      <rect x="15" y="5" width="4" height="10" rx="1" />
    </>
  ),
  sectors: (
    <>
      <rect x="3" y="3" width="7.5" height="7.5" rx="1.5" />
      <rect x="13.5" y="3" width="7.5" height="7.5" rx="1.5" />
      <rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5" />
      <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.5" />
    </>
  ),
  industries: (
    <>
      <path d="M3 20h18" />
      <path d="M6 16v-4M11 16V7M16 16v-6M20 16V4" />
    </>
  ),
  portfolio: (
    <>
      <rect x="3" y="7" width="18" height="13" rx="2" />
      <path d="M8.5 7V5.5A1.5 1.5 0 0 1 10 4h4a1.5 1.5 0 0 1 1.5 1.5V7M3 13h18" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M20 20l-4.2-4.2" />
    </>
  ),
  sliders: (
    <>
      <path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1" />
      <circle cx="15" cy="6" r="2" />
      <circle cx="9" cy="12" r="2" />
      <circle cx="17" cy="18" r="2" />
    </>
  ),
  columns: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M9 4v16M15 4v16" />
    </>
  ),
  refresh: (
    <>
      <path d="M20 12a8 8 0 1 1-2.34-5.66" />
      <path d="M20 4v5h-5" />
    </>
  ),
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </>
  ),
  moon: <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" />,
  logout: (
    <>
      <path d="M9 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h3" />
      <path d="M15 16l4-4-4-4M19 12H9" />
    </>
  ),
  x: <path d="M6 6l12 12M18 6L6 18" />,
  chevronDown: <path d="M6 9l6 6 6-6" />,
  chevronRight: <path d="M9 6l6 6-6 6" />,
  chevronLeft: <path d="M15 6l-6 6 6 6" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  alert: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.5v5.5M12 16.5v.01" />
    </>
  ),
  empty: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M20 20l-4.2-4.2M8.5 11h5" />
    </>
  ),
  plug: <path d="M9 3v5M15 3v5M6 8h12v3a6 6 0 0 1-12 0V8zM12 17v4" />,
  eye: (
    <>
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  eyeOff: (
    <>
      <path d="M3 3l18 18" />
      <path d="M10.6 5.1A10.6 10.6 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4M6.6 6.6A17 17 0 0 0 2 12s3.6 7 10 7a10 10 0 0 0 5.4-1.6" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </>
  ),
}

export function Icon({ name, className = '' }) {
  return (
    <svg
      className={`icon ${className}`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[name]}
    </svg>
  )
}

export function BrandMark() {
  return (
    <svg className="brand-mark" viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <rect width="32" height="32" rx="9" fill="var(--accent-soft)" />
      <path d="M10 7v18" stroke="var(--down)" strokeWidth="1.6" strokeLinecap="round" />
      <rect x="8" y="11" width="4" height="9" rx="1.2" fill="var(--down)" />
      <path d="M16 5v18" stroke="var(--accent)" strokeWidth="1.6" strokeLinecap="round" />
      <rect x="14" y="9" width="4" height="10" rx="1.2" fill="var(--accent)" />
      <path d="M22 6v16" stroke="var(--up)" strokeWidth="1.6" strokeLinecap="round" />
      <rect x="20" y="8" width="4" height="8" rx="1.2" fill="var(--up)" />
    </svg>
  )
}

/* ---------- small building blocks ---------- */

export function Skeleton({ width = '100%', height = 10 }) {
  return <span className="sk" style={{ width, height }} aria-hidden="true" />
}

export function Stat({ label, value, sub }) {
  return (
    <div className="stat">
      <span className="stat-k">{label}</span>
      <span className="stat-v">{value}</span>
      {sub !== undefined && sub !== null && <span className="stat-s">{sub}</span>}
    </div>
  )
}

export function StatSkeleton({ count = 4 }) {
  return Array.from({ length: count }, (_, i) => (
    <div className="stat" key={i} aria-hidden="true">
      <Skeleton width="55%" />
      <Skeleton width="40%" height={20} />
      <Skeleton width="70%" />
    </div>
  ))
}

export function MiniBar({ fraction, toneClass = '' }) {
  const w = Math.max(0, Math.min(1, fraction || 0)) * 100
  return (
    <span className={`minibar ${toneClass}`} aria-hidden="true">
      <i style={{ width: `${w}%` }} />
    </span>
  )
}

export function StateBlock({ kind = 'empty', title, children, actions }) {
  return (
    <div className={`state ${kind === 'error' ? 'state-error' : ''}`} role={kind === 'error' ? 'alert' : undefined}>
      <span className="state-icon">
        <Icon name={kind === 'error' ? 'alert' : 'empty'} />
      </span>
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {actions && <div className="state-actions">{actions}</div>}
    </div>
  )
}

export function BackLink({ onClick, children }) {
  return (
    <button type="button" className="backlink" onClick={onClick}>
      <Icon name="chevronLeft" />
      {children}
    </button>
  )
}

export function Segmented({ label, options, value, onChange, size }) {
  return (
    <div className={`seg ${size === 'sm' ? 'seg-sm' : ''}`} role="group" aria-label={label}>
      {options.map(([v, text]) => (
        <button
          type="button"
          key={String(v)}
          aria-pressed={Array.isArray(value) ? value.includes(v) : value === v}
          onClick={() => onChange(v)}
        >
          {text}
        </button>
      ))}
    </div>
  )
}

// Sortable column header. `sort` is { key, direction }.
export function SortTh({ colKey, label, sort, onSort, className = '', title, rowSpan, colSpan }) {
  const active = sort.key === colKey
  return (
    <th
      className={`sortable ${active ? 'sorted' : ''} ${className}`}
      rowSpan={rowSpan}
      colSpan={colSpan}
      title={title}
      aria-sort={active ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none'}
      onClick={() => onSort(colKey)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onSort(colKey)
        }
      }}
      tabIndex={0}
    >
      <span className="th-inner">
        {label}
        {active && <span className="sort-arrow">{sort.direction === 'asc' ? '↑' : '↓'}</span>}
      </span>
    </th>
  )
}

// Green/red tinted percentage; the tint deepens with the size of the move.
export function HeatPct({ value }) {
  if (!isNum(value)) return <span className="muted">—</span>
  const n = Number(value)
  const alpha = Math.round(5 + Math.min(Math.abs(n) / 25, 1) * 24)
  return (
    <span className={`heat ${tone(n)}`} style={{ '--a': `${alpha}%` }}>
      {formatPct(n)}
    </span>
  )
}

// Bar that grows right of centre for positive values and left for negative.
export function DivergingBar({ value, max }) {
  const n = Number(value)
  const w = isNum(value) && max > 0 ? (Math.min(Math.abs(n), max) / max) * 50 : 0
  const style = n >= 0 ? { left: '50%', width: `${w}%` } : { right: '50%', width: `${w}%` }
  return (
    <span className={`dbar ${tone(value)}`} aria-hidden="true">
      <i style={style} />
    </span>
  )
}

export function Breadth({ value, positive, count }) {
  if (!isNum(value)) return <span className="muted">—</span>
  const v = Number(value)
  return (
    <span className={`breadth ${v >= 50 ? 'up' : 'down'}`}>
      <span className="bb" aria-hidden="true">
        <i style={{ width: `${Math.max(0, Math.min(100, v))}%` }} />
        <b />
      </span>
      <span className="tone">{v.toFixed(0)}%</span>
      {isNum(count) && (
        <span className="breadth-count">
          {positive}/{count}
        </span>
      )}
    </span>
  )
}

/* ---------- weights ---------- */

// items: [[label, fraction], ...] with fractions summing to 1, or null.
export function WeightBar({ items }) {
  const visible = (items || []).filter(([, f]) => f > 0)
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

export function WeightRow({ id, label, value, onChange }) {
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
        value={value ?? 0}
        aria-label={`${label} weight`}
        onChange={(e) => onChange(e.target.value)}
      />
      <span className="unit">%</span>
    </div>
  )
}

/* ---------- pagination ---------- */

function pageList(cur, total) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  const wanted = [...new Set([1, total, cur - 1, cur, cur + 1])].filter((p) => p >= 1 && p <= total).sort((a, b) => a - b)
  const out = []
  wanted.forEach((p, i) => {
    if (i > 0 && p - wanted[i - 1] > 1) out.push(`gap-${p}`)
    out.push(p)
  })
  return out
}

export function Pagination({ page, totalPages, total, pageSize, pageSizeOptions, onPage, onPageSize, noun = 'stocks' }) {
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1
  const end = Math.min(page * pageSize, total)
  return (
    <div className="pager">
      <div>
        Showing <b>{start.toLocaleString('en-IN')}–{end.toLocaleString('en-IN')}</b> of <b>{total.toLocaleString('en-IN')}</b> {noun}
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
              <button
                type="button"
                key={p}
                onClick={() => onPage(p)}
                aria-current={p === page ? 'page' : undefined}
              >
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

/* ---------- overlays ---------- */

// Right-hand side panel with a dimmed backdrop. Escape or the backdrop closes it.
export function Drawer({ title, onClose, children, footer, wide = false }) {
  const panelRef = useRef(null)
  const closeRef = useRef(onClose)

  useEffect(() => {
    closeRef.current = onClose
  })

  useEffect(() => {
    const previous = document.activeElement
    panelRef.current?.focus()
    const onKey = (e) => {
      if (e.key === 'Escape') closeRef.current()
    }
    document.addEventListener('keydown', onKey)
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = overflow
      if (previous && previous.isConnected && typeof previous.focus === 'function') previous.focus()
    }
  }, [])

  return createPortal(
    <div className="drawer-layer">
      <div className="scrim" onClick={() => closeRef.current()} />
      <aside
        className={`drawer ${wide ? 'drawer-wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        ref={panelRef}
        tabIndex={-1}
      >
        <header className="drawer-head">
          <h2>{title}</h2>
          <button type="button" className="icon-btn" onClick={() => closeRef.current()} aria-label="Close">
            <Icon name="x" />
          </button>
        </header>
        <div className="drawer-body">{children}</div>
        {footer && <footer className="drawer-foot">{footer}</footer>}
      </aside>
    </div>,
    document.body
  )
}

// Small panel pinned under (or above) an anchor element, kept inside the
// viewport. It follows the anchor while the page or table scrolls, and closes
// on an outside press, Escape, or once the anchor scrolls out of view.
export function FloatingPanel({ anchorEl, onClose, children, width = 360, label }) {
  const ref = useRef(null)
  const closeRef = useRef(onClose)
  const [pos, setPos] = useState(null)

  useEffect(() => {
    closeRef.current = onClose
  })

  useLayoutEffect(() => {
    const el = ref.current
    if (!anchorEl || !el) return undefined

    function place() {
      if (!anchorEl.isConnected) {
        closeRef.current()
        return
      }
      const r = anchorEl.getBoundingClientRect()
      const vw = document.documentElement.clientWidth
      const vh = window.innerHeight
      if (r.bottom < 0 || r.top > vh || r.right < 0 || r.left > vw) {
        closeRef.current()
        return
      }
      const w = el.offsetWidth
      const h = el.offsetHeight
      let left = Math.min(r.left, vw - 16 - w)
      left = Math.max(16, left)
      let top = r.bottom + 6
      if (top + h > vh - 12 && r.top - h - 6 > 12) top = r.top - h - 6
      setPos((prev) => (prev && prev.left === left && prev.top === top ? prev : { left, top }))
    }

    const onDown = (e) => {
      if (el.contains(e.target) || anchorEl.contains(e.target)) return
      closeRef.current()
    }
    const onKey = (e) => {
      if (e.key === 'Escape') closeRef.current()
    }
    const onScroll = (e) => {
      if (e.target instanceof Node && el.contains(e.target)) return
      place()
    }

    place()
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(place) : null
    ro?.observe(el)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('touchstart', onDown, { passive: true })
    document.addEventListener('keydown', onKey)
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', place)
    return () => {
      ro?.disconnect()
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('touchstart', onDown)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', place)
    }
  }, [anchorEl])

  return createPortal(
    <div
      ref={ref}
      className="floating"
      role="dialog"
      aria-label={label}
      style={{
        width: `min(${width}px, calc(100vw - 32px))`,
        left: pos ? pos.left : -9999,
        top: pos ? pos.top : 0,
        visibility: pos ? 'visible' : 'hidden',
      }}
    >
      {children}
    </div>,
    document.body
  )
}
