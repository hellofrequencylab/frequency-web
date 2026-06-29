import { describe, it, expect } from 'vitest'
import crypto from 'node:crypto'
import {
  verifyResendSignature,
  isFreshTimestamp,
  WEBHOOK_TOLERANCE_SECONDS,
  buildTwilioSignedString,
  verifyTwilioSignature,
} from '@/lib/webhook-verify'

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

// ── Twilio X-Twilio-Signature (ADR-256) ───────────────────────────────────────
// Twilio signs: URL + each POST param's key+value, params sorted alphabetically by
// key, no separators; HMAC-SHA1 keyed by the auth token, base64.

const TWILIO_TOKEN = 'twilio-test-auth-token'
const TWILIO_URL = 'https://app.frequencylocal.com/api/webhooks/twilio'

function twilioSign(url: string, params: Record<string, string>, token = TWILIO_TOKEN): string {
  const signed = buildTwilioSignedString(url, params)
  return crypto.createHmac('sha1', token).update(Buffer.from(signed, 'utf8')).digest('base64')
}

describe('buildTwilioSignedString — Twilio canonical string', () => {
  it('appends sorted key+value pairs to the URL with no separators', () => {
    // Twilio's own documented example shape: alphabetical by key.
    const params = { To: '+15555550123', From: '+15555550100', Body: 'STOP' }
    expect(buildTwilioSignedString('https://x/y', params)).toBe(
      'https://x/yBodySTOPFrom+15555550100To+15555550123',
    )
  })

  it('is stable regardless of insertion order (sorts by key)', () => {
    const a = buildTwilioSignedString('u', { b: '2', a: '1' })
    const z = buildTwilioSignedString('u', { a: '1', b: '2' })
    expect(a).toBe(z)
  })
})

describe('verifyTwilioSignature', () => {
  const params = { From: '+15555550100', To: '+15555550123', Body: 'STOP', MessageSid: 'SM1' }

  it('accepts a correctly signed request', () => {
    expect(verifyTwilioSignature(TWILIO_TOKEN, TWILIO_URL, params, twilioSign(TWILIO_URL, params))).toBe(true)
  })

  it('rejects a tampered param (a forged STOP from a different number)', () => {
    const forged = { ...params, From: '+19998887777' }
    expect(verifyTwilioSignature(TWILIO_TOKEN, TWILIO_URL, forged, twilioSign(TWILIO_URL, params))).toBe(false)
  })

  it('rejects a wrong auth token', () => {
    expect(verifyTwilioSignature('wrong-token', TWILIO_URL, params, twilioSign(TWILIO_URL, params))).toBe(false)
  })

  it('rejects a different URL (URL is part of the signed string)', () => {
    const sig = twilioSign(TWILIO_URL, params)
    expect(verifyTwilioSignature(TWILIO_TOKEN, 'https://evil.example/api/webhooks/twilio', params, sig)).toBe(false)
  })

  it('rejects a missing signature header (fail-closed)', () => {
    expect(verifyTwilioSignature(TWILIO_TOKEN, TWILIO_URL, params, null)).toBe(false)
    expect(verifyTwilioSignature(TWILIO_TOKEN, TWILIO_URL, params, undefined)).toBe(false)
  })

  it('rejects an empty auth token (fail-closed)', () => {
    expect(verifyTwilioSignature('', TWILIO_URL, params, twilioSign(TWILIO_URL, params))).toBe(false)
  })
})
