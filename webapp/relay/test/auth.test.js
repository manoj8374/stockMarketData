import { test } from 'node:test'
import assert from 'node:assert/strict'
import { signToken, verifyToken } from '../src/auth.js'

const secret = 'test-secret'

test('accepts a valid live token', () => {
  const token = signToken({ username: 'guest', aud: 'live', exp: Date.now() + 60_000 }, secret)
  assert.equal(verifyToken(token, secret).username, 'guest')
})

test('rejects expired tokens, wrong audience and wrong secret', () => {
  assert.equal(verifyToken(signToken({ aud: 'live', exp: Date.now() - 1 }, secret), secret), null)
  assert.equal(verifyToken(signToken({ aud: 'session', exp: Date.now() + 60_000 }, secret), secret), null)
  assert.equal(verifyToken(signToken({ aud: 'live', exp: Date.now() + 60_000 }, 'other'), secret), null)
})

test('rejects tampered or malformed tokens', () => {
  const token = signToken({ aud: 'live', exp: Date.now() + 60_000, role: 'guest' }, secret)
  const [, sig] = token.split('.')
  const forged = Buffer.from(JSON.stringify({ aud: 'live', exp: Date.now() + 60_000, role: 'owner' })).toString('base64url')
  assert.equal(verifyToken(`${forged}.${sig}`, secret), null)
  assert.equal(verifyToken('nonsense', secret), null)
  assert.equal(verifyToken(null, secret), null)
})
