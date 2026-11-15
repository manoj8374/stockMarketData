import { useEffect, useRef } from 'react'

function seededRandom(seed: number) {
  let t = seed >>> 0
  return () => {
    t = (t + 0x6d2b79f5) >>> 0
    let r = Math.imul(t ^ (t >>> 15), 1 | t)
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296
  }
}

function gaussian(rand: () => number) {
  let u = 0
  let v = 0
  while (u === 0) u = rand()
  while (v === 0) v = rand()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

function draw(canvas: HTMLCanvasElement) {
  const box = canvas.getBoundingClientRect()
  const ctx = canvas.getContext('2d')
  if (!box.width || !box.height || !ctx) return
  const dpr = Math.min(2, window.devicePixelRatio || 1)
  canvas.width = Math.round(box.width * dpr)
  canvas.height = Math.round(box.height * dpr)
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

  const css = getComputedStyle(document.documentElement)
  const color = (name: string) => css.getPropertyValue(name).trim()
  const width = box.width
  const height = box.height
  const count = Math.max(28, Math.floor(width / 15))
  const rand = seededRandom(11)

  let price = 100
  const candles = Array.from({ length: count }, () => {
    const open = price
    const close = open * (1 + gaussian(rand) * 0.016 + 0.004)
    price = close
    return { open, close, high: Math.max(open, close) * (1 + rand() * 0.012), low: Math.min(open, close) * (1 - rand() * 0.012) }
  })
  const lo = Math.min(...candles.map((c) => c.low))
  const hi = Math.max(...candles.map((c) => c.high))
  const top = height * 0.08
  const bottom = height * 0.66
  const y = (v: number) => bottom - ((v - lo) / (hi - lo)) * (bottom - top)

  ctx.strokeStyle = color('--line')
  ctx.lineWidth = 1
  for (let i = 1; i < 6; i++) {
    const yy = Math.round(top + ((bottom - top) * i) / 6) + 0.5
    ctx.beginPath()
    ctx.moveTo(0, yy)
    ctx.lineTo(width, yy)
    ctx.stroke()
  }

  const step = width / count
  const body = Math.max(3, step * 0.55)
  ctx.globalAlpha = 0.8
  candles.forEach((c, i) => {
    const x = step * i + step / 2
    ctx.strokeStyle = ctx.fillStyle = color(c.close >= c.open ? '--up' : '--down')
    ctx.beginPath()
    ctx.moveTo(Math.round(x) + 0.5, y(c.high))
    ctx.lineTo(Math.round(x) + 0.5, y(c.low))
    ctx.stroke()
    const t = y(Math.max(c.open, c.close))
    ctx.fillRect(x - body / 2, t, body, Math.max(1.5, y(Math.min(c.open, c.close)) - t))
  })

  ctx.globalAlpha = 1
  ctx.strokeStyle = color('--accent')
  ctx.lineWidth = 2
  ctx.beginPath()
  candles.forEach((_, i) => {
    const recent = candles.slice(Math.max(0, i - 7), i + 1)
    const avg = recent.reduce((acc, c) => acc + c.close, 0) / recent.length
    const x = step * i + step / 2
    if (i === 0) ctx.moveTo(x, y(avg))
    else ctx.lineTo(x, y(avg))
  })
  ctx.stroke()
}

export function CandleArt() {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return undefined
    const redraw = () => draw(canvas)
    redraw()
    const resize = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(redraw) : null
    resize?.observe(canvas)
    const themeChange = new MutationObserver(redraw)
    themeChange.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => {
      resize?.disconnect()
      themeChange.disconnect()
    }
  }, [])

  return <canvas ref={ref} className="login-canvas" aria-hidden="true" />
}
