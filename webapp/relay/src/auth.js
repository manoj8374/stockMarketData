import crypto from 'node:crypto'

// Same token format as the web app's session cookie (base64url payload + HMAC),
// signed by /api/live-token with the shared SESSION_SECRET.
export function signToken(payload, secret) {
  const data = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const sig = crypto.createHmac('sha256', secret).update(data).digest('base64url')
  return `${data}.${sig}`
}

export function verifyToken(token, secret, now = Date.now()) {
  if (!token || !secret) return null
  const [data, sig, extra] = String(token).split('.')
  if (!data || !sig || extra !== undefined) return null
  const expected = crypto.createHmac('sha256', secret).update(data).digest('base64url')
  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null
  try {
    const payload = JSON.parse(Buffer.from(data, 'base64url').toString())
    if (payload.aud !== 'live' || !payload.exp || payload.exp < now) return null
    return payload
  } catch {
    return null
  }
}
