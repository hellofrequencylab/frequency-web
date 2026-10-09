// Client-safe aggregate vocabulary; no addresses or privileged imports cross the action boundary.
interface AudienceEligibilityCandidate { email: string; consentState: string | null }
export interface AudienceEligibilitySummary {
  state: 'available' | 'unavailable'
  topic: string
  matched: number
  eligible: number
  excluded: { invalid: number; duplicate: number; unknownConsent: number; unsubscribed: number; suppressed: number; muted: number }
}
export function unavailableAudienceEligibility(topic = 'marketing'): AudienceEligibilitySummary {
  return { state: 'unavailable', topic, matched: 0, eligible: 0, excluded: { invalid: 0, duplicate: 0, unknownConsent: 0, unsubscribed: 0, suppressed: 0, muted: 0 } }
}
/** One exclusive reason per matched row. Shared suppression/opt-out always wins over marketing. */
export function summarizeAudienceEligibility(
  contacts: AudienceEligibilityCandidate[], topic: string, suppressed: ReadonlySet<string>, muted: ReadonlySet<string>,
): AudienceEligibilitySummary {
  const report = { ...unavailableAudienceEligibility(topic), state: 'available' as const, matched: contacts.length }
  const seen = new Set<string>()
  for (const contact of contacts) {
    const address = contact.email.trim().toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) { report.excluded.invalid++; continue }
    if (seen.has(address)) { report.excluded.duplicate++; continue }
    seen.add(address)
    if (suppressed.has(address)) { report.excluded.suppressed++; continue }
    if (contact.consentState === 'unsubscribed') { report.excluded.unsubscribed++; continue }
    // Space campaign preview always uses marketing consent regardless of selected topic.
    if (contact.consentState !== 'subscribed') { report.excluded.unknownConsent++; continue }
    if (muted.has(address)) { report.excluded.muted++; continue }
    report.eligible++
  }
  return report
}
