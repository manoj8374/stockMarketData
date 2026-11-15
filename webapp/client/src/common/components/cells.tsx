import type { CSSProperties } from 'react'
import { formatPct, isNum, tone, type Numeric } from '../utils/format'

export function HeatPct({ value }: { value: Numeric }) {
  if (!isNum(value)) return <span className="muted">—</span>
  const n = Number(value)
  const alpha = Math.round(5 + Math.min(Math.abs(n) / 25, 1) * 24)
  return (
    <span className={`heat ${tone(n)}`} style={{ '--a': `${alpha}%` } as CSSProperties}>
      {formatPct(n)}
    </span>
  )
}

export function DivergingBar({ value, max }: { value: Numeric; max: number }) {
  const n = Number(value)
  const width = isNum(value) && max > 0 ? (Math.min(Math.abs(n), max) / max) * 50 : 0
  const style = n >= 0 ? { left: '50%', width: `${width}%` } : { right: '50%', width: `${width}%` }
  return (
    <span className={`dbar ${tone(value)}`} aria-hidden="true">
      <i style={style} />
    </span>
  )
}

export function Breadth({ value, positive, count }: { value: Numeric; positive?: Numeric; count?: Numeric }) {
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
