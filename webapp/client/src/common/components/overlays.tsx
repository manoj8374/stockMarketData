import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from './Icon'

function useLatest<T>(value: T) {
  const ref = useRef(value)
  useEffect(() => {
    ref.current = value
  })
  return ref
}

interface DrawerProps {
  title: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  wide?: boolean
}

export function Drawer({ title, onClose, children, footer, wide = false }: DrawerProps) {
  const panelRef = useRef<HTMLElement>(null)
  const close = useLatest(onClose)

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    panelRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close.current()
    }
    document.addEventListener('keydown', onKey)
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = overflow
      if (previous?.isConnected) previous.focus()
    }
  }, [close])

  return createPortal(
    <div className="drawer-layer">
      <div className="scrim" onClick={() => close.current()} />
      <aside className={`drawer ${wide ? 'drawer-wide' : ''}`} role="dialog" aria-modal="true" aria-label={title} ref={panelRef} tabIndex={-1}>
        <header className="drawer-head">
          <h2>{title}</h2>
          <button type="button" className="icon-btn" onClick={() => close.current()} aria-label="Close">
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

interface FloatingPanelProps {
  anchorEl: HTMLElement
  onClose: () => void
  children: ReactNode
  width?: number
  label: string
}

// Pinned under (or above) its anchor and kept inside the viewport. Follows
// the anchor while scrolling and closes once the anchor leaves the screen.
export function FloatingPanel({ anchorEl, onClose, children, width = 360, label }: FloatingPanelProps) {
  const ref = useRef<HTMLDivElement>(null)
  const close = useLatest(onClose)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return undefined

    const place = () => {
      if (!anchorEl.isConnected) return close.current()
      const r = anchorEl.getBoundingClientRect()
      const vw = document.documentElement.clientWidth
      const vh = window.innerHeight
      if (r.bottom < 0 || r.top > vh || r.right < 0 || r.left > vw) return close.current()
      const left = Math.max(16, Math.min(r.left, vw - 16 - el.offsetWidth))
      let top = r.bottom + 6
      if (top + el.offsetHeight > vh - 12 && r.top - el.offsetHeight - 6 > 12) top = r.top - el.offsetHeight - 6
      setPos((prev) => (prev && prev.left === left && prev.top === top ? prev : { left, top }))
    }
    const onDown = (e: Event) => {
      const target = e.target as Node
      if (el.contains(target) || anchorEl.contains(target)) return
      close.current()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close.current()
    }
    const onScroll = (e: Event) => {
      if (e.target instanceof Node && el.contains(e.target)) return
      place()
    }

    place()
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(place) : null
    observer?.observe(el)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('touchstart', onDown, { passive: true })
    document.addEventListener('keydown', onKey)
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', place)
    return () => {
      observer?.disconnect()
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('touchstart', onDown)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', place)
    }
  }, [anchorEl, close])

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
