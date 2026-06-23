import { describe, it, expect } from 'vitest'
import crypto from 'node:crypto'
import { verifyResendSignature, isFreshTimestamp, WEBHOOK_TOLERANCE_SECONDS } from '@/lib/webhook-verify'

const secret = 'whsec_' + Buffer.from('test-signing-key').toString('base64')

function sign(id: string, ts: string, body: string): string {
  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64')
  const sig = crypto.createHmac('sha256', key).update(`${id}.${ts}.${body}`).digest('base64')
  return `v1,${sig}`
}

describe('verifyResendSignature', () => {
  const id = 'msg_1'
  const ts = '1700000000'
  const body = '{"type":"email.delivered"}'

  it('accepts a correctly signed payload', () => {
    expect(verifyResendSignature(secret, id, ts, body, sign(id, ts, body))).toBe(true)
  })

  it('rejects a tampered body', () => {
    expect(verifyResendSignature(secret, id, ts, '{"type":"email.bounced"}', sign(id, ts, body))).toBe(false)
  })

  it('rejects a wrong secret', () => {
    const other = 'whsec_' + Buffer.from('other-key').toString('base64')
    expect(verifyResendSignature(other, id, ts, body, sign(id, ts, body))).toBe(false)
  })

  it('rejects a malformed header', () => {
    expect(verifyResendSignature(secret, id, ts, body, 'garbage')).toBe(false)
  })
})

// A5: replay-window freshness. The signature covers the timestamp, so a stale-but-valid
// payload is a captured request being replayed — it must be rejected on age alone.
describe('isFreshTimestamp — replay window (A5)', () => {
  const NOW_MS = 1_900_000_000_000 // a fixed "now" in ms
  const nowSec = Math.floor(NOW_MS / 1000)

  it('accepts a timestamp within the 5-minute tolerance (both directions)', () => {
    expect(isFreshTimestamp(String(nowSec), WEBHOOK_TOLERANCE_SECONDS, NOW_MS)).toBe(true)
    expect(isFreshTimestamp(String(nowSec - 299), WEBHOOK_TOLERANCE_SECONDS, NOW_MS)).toBe(true)
    expect(isFreshTimestamp(String(nowSec + 299), WEBHOOK_TOLERANCE_SECONDS, NOW_MS)).toBe(true)
  })

  it('rejects a timestamp older than the tolerance (a replay)', () => {
    expect(isFreshTimestamp(String(nowSec - 301), WEBHOOK_TOLERANCE_SECONDS, NOW_MS)).toBe(false)
    // A timestamp years in the past (the old fixture value) is firmly rejected.
    expect(isFreshTimestamp('1700000000', WEBHOOK_TOLERANCE_SECONDS, NOW_MS)).toBe(false)
  })

  it('rejects a timestamp too far in the future', () => {
    expect(isFreshTimestamp(String(nowSec + 301), WEBHOOK_TOLERANCE_SECONDS, NOW_MS)).toBe(false)
  })

  it('rejects a missing or non-numeric timestamp (fail-closed)', () => {
    expect(isFreshTimestamp(null, WEBHOOK_TOLERANCE_SECONDS, NOW_MS)).toBe(false)
    expect(isFreshTimestamp(undefined, WEBHOOK_TOLERANCE_SECONDS, NOW_MS)).toBe(false)
    expect(isFreshTimestamp('not-a-number', WEBHOOK_TOLERANCE_SECONDS, NOW_MS)).toBe(false)
  })
})
