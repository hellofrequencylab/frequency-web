import { describe, it, expect } from 'vitest'
import {
  scoreContactRisk,
  recencyFactor,
  engagementFactor,
  AT_RISK_THRESHOLD,
  type ContactRiskSignals,
} from './contact-risk'

// PURE SCORER CONTRACT (ADR-560). The per-Space contact at-risk scorer is rules-based + IO-free, so
// this suite pins every rule and the fail-safe posture: a signal we do not have never manufactures
// churn (no risk-by-absence), the score is clamped to [0,100], and the at-risk flag derives from the
// threshold. No mocks, no clock leakage — every test pins `now`.

const NOW = Date.parse('2026-07-06T00:00:00.000Z')
/** An ISO string `days` before NOW. */
const daysAgo = (days: number) => new Date(NOW - days * 86_400_000).toISOString()

describe('scoreContactRisk: fail-safe / absence', () => {
  it('an empty signal set is NOT at risk (never risk-by-absence)', () => {
    const r = scoreContactRisk({ now: NOW })
    expect(r.score).toBe(0)
    expect(r.atRisk).toBe(false)
    expect(r.factors).toEqual([])
  })

  it('a contact seen recently is healthy', () => {
    const r = scoreContactRisk({ lastSeenAt: daysAgo(3), engagementScore: 80, now: NOW })
    expect(r.score).toBe(0)
    expect(r.atRisk).toBe(false)
  })

  it('never throws on malformed signals; treats them as absent', () => {
    const bad = {
      lastSeenAt: 'not-a-date',
      engagementScore: Number.NaN,
      consentState: 12345 as unknown as string,
      now: NOW,
    } satisfies ContactRiskSignals
    const r = scoreContactRisk(bad)
    expect(r.score).toBe(0)
    expect(r.atRisk).toBe(false)
  })
})

describe('recencyFactor', () => {
  it('is null inside the grace window', () => {
    expect(recencyFactor({ lastSeenAt: daysAgo(10) }, NOW)).toBeNull()
  })

  it('ramps up with silence and saturates at the cap', () => {
    const mid = recencyFactor({ lastSeenAt: daysAgo(52) }, NOW) // halfway through the 14->90 ramp
    const cold = recencyFactor({ lastSeenAt: daysAgo(200) }, NOW) // past saturation
    expect(mid?.weight).toBeGreaterThan(0)
    expect(cold?.weight).toBe(45)
    expect((mid?.weight ?? 0)).toBeLessThan(cold?.weight ?? 0)
  })

  it('keys off the MOST RECENT of last-seen and last-contacted', () => {
    // Last seen long ago, but contacted yesterday -> still fresh, no recency points.
    const f = recencyFactor({ lastSeenAt: daysAgo(120), lastContactedAt: daysAgo(1) }, NOW)
    expect(f).toBeNull()
  })

  it('is null when there is no timestamp at all (absence, not churn)', () => {
    expect(recencyFactor({}, NOW)).toBeNull()
  })
})

describe('engagementFactor', () => {
  it('adds nothing at or above the floor', () => {
    expect(engagementFactor({ engagementScore: 40 })).toBeNull()
    expect(engagementFactor({ engagementScore: 90 })).toBeNull()
  })

  it('scales up as engagement drops, maxing at zero', () => {
    const low = engagementFactor({ engagementScore: 20 })
    const zero = engagementFactor({ engagementScore: 0 })
    expect(low?.weight).toBeGreaterThan(0)
    expect(zero?.weight).toBe(25)
    expect((low?.weight ?? 0)).toBeLessThan(zero?.weight ?? 0)
  })

  it('ignores an absent or non-finite engagement signal', () => {
    expect(engagementFactor({})).toBeNull()
    expect(engagementFactor({ engagementScore: Number.NaN })).toBeNull()
  })
})

describe('scoreContactRisk: rules combine + flag', () => {
  it('flags an unsubscribed, long-quiet contact and orders factors by weight', () => {
    const r = scoreContactRisk({
      lastSeenAt: daysAgo(200),
      engagementScore: 5,
      consentState: 'unsubscribed',
      now: NOW,
    })
    expect(r.atRisk).toBe(true)
    expect(r.score).toBeGreaterThanOrEqual(AT_RISK_THRESHOLD)
    // recency (45) is the dominant factor, ahead of unsubscribed (35) and engagement.
    expect(r.factors[0]?.key).toBe('recency')
    expect(r.factors.map((f) => f.key)).toEqual(
      [...r.factors].sort((a, b) => b.weight - a.weight).map((f) => f.key),
    )
  })

  it('a single mild recency signal does NOT flag (threshold is not trivially crossed)', () => {
    // ~30 days quiet: on the ramp but well under the flag threshold on its own.
    const r = scoreContactRisk({ lastSeenAt: daysAgo(30), now: NOW })
    expect(r.factors.some((f) => f.key === 'recency')).toBe(true)
    expect(r.atRisk).toBe(false)
  })

  it('payment overdue + no-show + streak-at-risk stack toward the flag', () => {
    const r = scoreContactRisk({
      lastSeenAt: daysAgo(40),
      paymentOverdue: true,
      recentNoShow: true,
      streakAtRisk: true,
      now: NOW,
    })
    const keys = r.factors.map((f) => f.key)
    expect(keys).toContain('payment_overdue')
    expect(keys).toContain('no_show')
    expect(keys).toContain('streak_at_risk')
    expect(r.atRisk).toBe(true)
  })

  it('clamps the score to 100 when signals pile up', () => {
    const r = scoreContactRisk({
      lastSeenAt: daysAgo(400),
      engagementScore: 0,
      consentState: 'unsubscribed',
      paymentOverdue: true,
      recentNoShow: true,
      streakAtRisk: true,
      now: NOW,
    })
    expect(r.score).toBe(100)
    expect(r.atRisk).toBe(true)
  })

  it('a brand-new contact with an explicit churn signal but no activity reads never_seen', () => {
    const r = scoreContactRisk({ consentState: 'unsubscribed', now: NOW })
    expect(r.factors.some((f) => f.key === 'never_seen')).toBe(true)
    expect(r.factors.some((f) => f.key === 'unsubscribed')).toBe(true)
  })

  it('a brand-new contact with NO churn signal is not tagged never_seen', () => {
    const r = scoreContactRisk({ now: NOW })
    expect(r.factors).toEqual([])
  })
})
