import { describe, it, expect } from 'vitest'
import { summarizeAudienceEligibility, unavailableAudienceEligibility } from './audience-eligibility'
const contact = (email: string, consentState: string | null = 'subscribed') => ({ email, consentState })
describe('campaign eligibility summary', () => {
  it('excludes the 520 imported unknown-consent pilot contacts without promoting consent', () => {
    const contacts = Array.from({ length: 520 }, (_, i) => contact(`pilot-${i}@example.org`, 'unknown'))
    const summary = summarizeAudienceEligibility(contacts, 'events', new Set(), new Set())
    expect(summary.eligible).toBe(0)
    expect(summary.excluded.unknownConsent).toBe(520)
    expect(contacts.every(c => c.consentState === 'unknown')).toBe(true)
    expect(JSON.stringify(summary)).not.toContain('@')
  })
  it('reconciles every selected row to exactly one disposition', () => {
    const contacts = [contact('bad'), contact('ok@example.org'), contact(' OK@example.org '), contact('unknown@example.org', null), contact('unsub@example.org', 'unsubscribed'), contact('blocked@example.org'), contact('muted@example.org')]
    const summary = summarizeAudienceEligibility(contacts, 'marketing', new Set(['blocked@example.org']), new Set(['muted@example.org']))
    expect(summary).toEqual({ state: 'available', topic: 'marketing', matched: 7, eligible: 1, excluded: { invalid: 1, duplicate: 1, unknownConsent: 1, unsubscribed: 1, suppressed: 1, muted: 1 } })
    expect(summary.eligible + Object.values(summary.excluded).reduce((n, count) => n + count, 0)).toBe(summary.matched)
  })
  it('uses normalized dedupe and suppression wins even when consent is unknown', () => {
    const summary = summarizeAudienceEligibility([contact(' A@Example.org ', 'unknown'), contact('a@example.org')], 'events', new Set(['a@example.org']), new Set())
    expect(summary.excluded.suppressed).toBe(1)
    expect(summary.excluded.duplicate).toBe(1)
    expect(summary.eligible).toBe(0)
  })
  it('unknown and malformed consent cannot be bypassed by changing campaign topic', () => {
    for (const topic of ['events', 'dispatches', 'marketing']) {
      expect(summarizeAudienceEligibility([contact('a@example.org', 'granted')], topic, new Set(), new Set()).eligible).toBe(0)
    }
  })
  it('unavailable evidence has a distinct state rather than claiming a verified zero', () => {
    expect(unavailableAudienceEligibility().state).toBe('unavailable')
  })
})
