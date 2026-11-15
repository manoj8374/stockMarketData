import type { ReactNode } from 'react'
import { Icon } from './Icon'

export function Skeleton({ width = '100%', height = 10 }: { width?: number | string; height?: number }) {
  return <span className="sk" style={{ width, height }} aria-hidden="true" />
}

export function Stat({ label, value, sub }: { label: ReactNode; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="stat">
      <span className="stat-k">{label}</span>
      <span className="stat-v">{value}</span>
      {sub !== undefined && sub !== null && <span className="stat-s">{sub}</span>}
    </div>
  )
}

export function StatSkeleton({ count = 4 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <div className="stat" key={i} aria-hidden="true">
          <Skeleton width="55%" />
          <Skeleton width="40%" height={20} />
          <Skeleton width="70%" />
        </div>
      ))}
    </>
  )
}

export function MiniBar({ fraction, toneClass = '' }: { fraction: number; toneClass?: string }) {
  const width = Math.max(0, Math.min(1, fraction || 0)) * 100
  return (
    <span className={`minibar ${toneClass}`} aria-hidden="true">
      <i style={{ width: `${width}%` }} />
    </span>
  )
}

interface StateBlockProps {
  kind?: 'empty' | 'error'
  title: string
  children?: ReactNode
  actions?: ReactNode
}

export function StateBlock({ kind = 'empty', title, children, actions }: StateBlockProps) {
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

export function ErrorState({ what, message, onRetry }: { what: string; message?: string; onRetry: () => void }) {
  return (
    <StateBlock
      kind="error"
      title={`Couldn't load ${what}`}
      actions={
        <button type="button" className="btn primary" onClick={onRetry}>
          <Icon name="refresh" />
          Try again
        </button>
      }
    >
      {message ? `The server returned an error (${message}). Try again in a moment.` : 'Try again in a moment.'}
    </StateBlock>
  )
}

export function Banner({ children }: { children: ReactNode }) {
  return (
    <div className="banner error" role="alert">
      <Icon name="alert" />
      {children}
    </div>
  )
}
