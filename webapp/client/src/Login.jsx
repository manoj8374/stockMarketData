import { useEffect, useRef, useState } from 'react'
import { BrandMark, Icon } from './ui'

// Seeded so the decorative chart looks the same on every visit.
function seededRandom(seed) {
  let t = seed >>> 0
  return () => {
    t = (t + 0x6d2b79f5) >>> 0
    let r = Math.imul(t ^ (t >>> 15), 1 | t)
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296
  }
}

function gaussian(rand) {
  let u = 0
  let v = 0
  while (u === 0) u = rand()
  while (v === 0) v = rand()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

// Decorative candlestick drawing for the brand panel, drawn in the current
// theme's colors and redrawn on resize or theme change.
function CandleArt() {
  const ref = useRef(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return undefined

    function draw() {
      const box = canvas.getBoundingClientRect()
      if (!box.width || !box.height) return
      const dpr = Math.min(2, window.devicePixelRatio || 1)
      canvas.width = Math.round(box.width * dpr)
      canvas.height = Math.round(box.height * dpr)
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, box.width, box.height)
      const css = getComputedStyle(document.documentElement)
      const color = (name) => css.getPropertyValue(name).trim()
      const W = box.width
      const H = box.height
      const n = Math.max(28, Math.floor(W / 15))
      const rand = seededRandom(11)
      let price = 100
      const candles = []
      for (let i = 0; i < n; i++) {
        const open = price
        const close = open * (1 + gaussian(rand) * 0.016 + 0.004)
        const high = Math.max(open, close) * (1 + rand() * 0.012)
        const low = Math.min(open, close) * (1 - rand() * 0.012)
        candles.push({ open, high, low, close })
        price = close
      }
      const lo = Math.min(...candles.map((c) => c.low))
      const hi = Math.max(...candles.map((c) => c.high))
      const top = H * 0.08
      const bottom = H * 0.66
      const y = (v) => bottom - ((v - lo) / (hi - lo)) * (bottom - top)

      ctx.strokeStyle = color('--line')
      ctx.lineWidth = 1
      for (let i = 1; i < 6; i++) {
        const yy = Math.round(top + ((bottom - top) * i) / 6) + 0.5
        ctx.beginPath()
        ctx.moveTo(0, yy)
        ctx.lineTo(W, yy)
        ctx.stroke()
      }

      const step = W / n
      const bodyWidth = Math.max(3, step * 0.55)
      ctx.globalAlpha = 0.8
      candles.forEach((c, i) => {
        const x = step * i + step / 2
        const up = c.close >= c.open
        ctx.strokeStyle = ctx.fillStyle = color(up ? '--up' : '--down')
        ctx.beginPath()
        ctx.moveTo(Math.round(x) + 0.5, y(c.high))
        ctx.lineTo(Math.round(x) + 0.5, y(c.low))
        ctx.stroke()
        const t = y(Math.max(c.open, c.close))
        const b = y(Math.min(c.open, c.close))
        ctx.fillRect(x - bodyWidth / 2, t, bodyWidth, Math.max(1.5, b - t))
      })

      ctx.globalAlpha = 1
      ctx.strokeStyle = color('--accent')
      ctx.lineWidth = 2
      ctx.beginPath()
      candles.forEach((c, i) => {
        const recent = candles.slice(Math.max(0, i - 7), i + 1)
        const avg = recent.reduce((acc, w) => acc + w.close, 0) / recent.length
        const x = step * i + step / 2
        if (i === 0) ctx.moveTo(x, y(avg))
        else ctx.lineTo(x, y(avg))
      })
      ctx.stroke()
    }

    draw()
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(draw) : null
    ro?.observe(canvas)
    const mo = new MutationObserver(draw)
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    const mq = window.matchMedia('(prefers-color-scheme: light)')
    mq.addEventListener?.('change', draw)
    return () => {
      ro?.disconnect()
      mo.disconnect()
      mq.removeEventListener?.('change', draw)
    }
  }, [])

  return <canvas ref={ref} className="login-canvas" aria-hidden="true" />
}

export default function Login({ onLogin, guest }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  function signIn(user, pass) {
    setLoading(true)
    setError(null)
    fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: user, password: pass }),
    })
      .then((r) => r.json().then((data) => ({ ok: r.ok, status: r.status, data })))
      .then(({ ok, status, data }) => {
        if (!ok) {
          throw new Error(
            status === 401
              ? "That username and password don't match. Check for typos and try again."
              : data.error || 'Sign-in failed. Try again in a moment.'
          )
        }
        onLogin({ username: data.username, role: data.role })
      })
      .catch((e) => {
        setError(e instanceof SyntaxError ? 'Sign-in failed. The server sent an unexpected response.' : e.message)
        setLoading(false)
      })
  }

  function handleSubmit(e) {
    e.preventDefault()
    signIn(username, password)
  }

  function signInAsGuest() {
    setUsername(guest.username)
    setPassword(guest.password)
    signIn(guest.username, guest.password)
  }

  return (
    <div className="login">
      <div className="login-art">
        <CandleArt />
        <div className="login-copy">
          <div className="brand">
            <BrandMark />
            <div>
              <b>NSE Equities</b>
              <span>Momentum workbench</span>
            </div>
          </div>
          <p className="login-big">Find the stocks and industries with real momentum behind them.</p>
          <ul className="facts">
            <li>Daily candles for every NSE equity</li>
            <li>Weighted momentum scoring</li>
            <li>Industry breadth</li>
            <li>Kite portfolio</li>
          </ul>
        </div>
      </div>

      <div className="login-side">
        <form className="login-form" onSubmit={handleSubmit}>
          <div>
            <h1>Sign in</h1>
            <p className="sub">Use the account you were given for this workbench.</p>
          </div>

          {error && (
            <div className="form-error" role="alert">
              <Icon name="alert" />
              <span>{error}</span>
            </div>
          )}

          <label className="field">
            <span>Username</span>
            <input
              type="text"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoFocus
              required
            />
          </label>
          <label className="field">
            <span>Password</span>
            <span className="pw">
              <input
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <button
                type="button"
                className="pw-toggle"
                onClick={() => setShowPassword((s) => !s)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                aria-pressed={showPassword}
              >
                <Icon name={showPassword ? 'eyeOff' : 'eye'} />
              </button>
            </span>
          </label>

          <button className="btn primary block" type="submit" disabled={loading}>
            {loading ? 'Signing in…' : 'Sign in'}
          </button>

          {guest && (
            <section className="guest" aria-labelledby="guest-title">
              <div className="guest-head">
                <span className="guest-icon">
                  <Icon name="user" />
                </span>
                <div>
                  <b id="guest-title">Guest access</b>
                  <span>Read-only: Screener, Sectors and Industries</span>
                </div>
              </div>
              <dl className="guest-creds">
                <div>
                  <dt>Username</dt>
                  <dd>
                    <code>{guest.username}</code>
                  </dd>
                </div>
                <div>
                  <dt>Password</dt>
                  <dd>
                    <code>{guest.password}</code>
                  </dd>
                </div>
              </dl>
              <button type="button" className="btn block-sm" onClick={signInAsGuest} disabled={loading}>
                Sign in as guest
              </button>
            </section>
          )}

          <p className="login-foot">Need your own account? Ask the owner.</p>
        </form>
      </div>
    </div>
  )
}
