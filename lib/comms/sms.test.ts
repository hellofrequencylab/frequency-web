import { describe, it, expect, afterEach } from 'vitest'
import { evaluateSmsGate, isInsideQuietHours, isSmsProvisioned, type SmsGateState } from './sms'

// ── The pure SMS gate: the only path to allowed (ADR-256) ─────────────────────
// SMS is the hardest-gated channel: registration -> consent -> preference -> quiet
// hours, each denies independently, in that precedence order.

const allClear: SmsGateState = {
  provisioned: true,
  consentOptedIn: true,
  prefEnabled: true,
  insideQuietHours: true,
}

describe('evaluateSmsGate — the one path to allowed', () => {
  it('allows only when every gate is clear', () => {
    expect(evaluateSmsGate(allClear)).toEqual({ allowed: true, reason: 'ok', gated: false })
  })
})

describe('evaluateSmsGate — each gate denies independently, in precedence order', () => {
  it('not provisioned blocks first (overrides everything)', () => {
    expect(
      evaluateSmsGate({ provisioned: false, consentOptedIn: false, prefEnabled: false, insideQuietHours: false }),
    ).toEqual({ allowed: false, reason: 'not_provisioned', gated: true })
  })

  it('missing consent blocks (provisioned, but not opted in)', () => {
    expect(evaluateSmsGate({ ...allClear, consentOptedIn: false })).toEqual({
      allowed: false,
      reason: 'no_consent',
      gated: true,
    })
  })

  it('preference off blocks', () => {
    expect(evaluateSmsGate({ ...allClear, prefEnabled: false })).toEqual({
      allowed: false,
      reason: 'pref_off',
      gated: true,
    })
  })

  it('outside quiet hours blocks', () => {
    expect(evaluateSmsGate({ ...allClear, insideQuietHours: false })).toEqual({
      allowed: false,
      reason: 'quiet_hours',
      gated: true,
    })
  })
})

// ── Quiet hours window math ───────────────────────────────────────────────────
describe('isInsideQuietHours', () => {
  it('a normal same-day window is inclusive-start, exclusive-end', () => {
    expect(isInsideQuietHours(8, 8, 21)).toBe(true) // start is allowed
    expect(isInsideQuietHours(20, 8, 21)).toBe(true)
    expect(isInsideQuietHours(21, 8, 21)).toBe(false) // end is excluded
    expect(isInsideQuietHours(7, 8, 21)).toBe(false)
    expect(isInsideQuietHours(22, 8, 21)).toBe(false)
  })

  it('a zero-width window allows nothing', () => {
    expect(isInsideQuietHours(10, 10, 10)).toBe(false)
  })

  it('a wrap-around window (e.g. 21..8) is the night gap inverse', () => {
    expect(isInsideQuietHours(23, 21, 8)).toBe(true)
    expect(isInsideQuietHours(2, 21, 8)).toBe(true)
    expect(isInsideQuietHours(12, 21, 8)).toBe(false)
  })
})

// ── The env kill-switch — needs ALL four flags ────────────────────────────────
describe('isSmsProvisioned — fail-closed on env', () => {
  const KEYS = [
    'SMS_PROVISIONING_ENABLED',
    'SMS_A2P_BRAND_ID',
    'SMS_A2P_CAMPAIGN_ID',
    'TWILIO_MESSAGING_SERVICE_SID',
  ] as const

  const saved: Record<string, string | undefined> = {}
  for (const k of KEYS) saved[k] = process.env[k]

  afterEach(() => {
    for (const k of KEYS) {
      if (saved[k] === undefined) delete process.env[k]
      else process.env[k] = saved[k]
    }
  })

  function setAll() {
    process.env.SMS_PROVISIONING_ENABLED = 'true'
    process.env.SMS_A2P_BRAND_ID = 'BN123'
    process.env.SMS_A2P_CAMPAIGN_ID = 'CM123'
    process.env.TWILIO_MESSAGING_SERVICE_SID = 'MG123'
  }

  it('is true only when all four flags are set', () => {
    setAll()
    expect(isSmsProvisioned()).toBe(true)
  })

  it('is false when the master switch is anything but the literal "true"', () => {
    setAll()
    process.env.SMS_PROVISIONING_ENABLED = '1'
    expect(isSmsProvisioned()).toBe(false)
  })

  it('is false when any single flag is missing', () => {
    for (const missing of KEYS) {
      setAll()
      delete process.env[missing]
      expect(isSmsProvisioned()).toBe(false)
    }
  })
})
