// The trust signal WEIGHT catalog (ADR-247). Weights live in code, not on the signal row,
// so they can evolve with no data migration — recompute replays the ledger and applies the
// CURRENT weight for each signal type. Keys are namespaced `source.signal_type` so a
// vertical's signals can never collide with another's. Negative weights are penalties
// (a report upheld, a dispute lost); positive are credit.
//
// Trust is reputation, never currency. Tune these centrally as the model matures.

export type TrustContext =
  | 'global'
  | 'marketplace'
  | 'host'
  | 'roommate'
  | 'practitioner'
  | 'community'

/** `source.signal_type` → weight. The single tunable source of truth for scoring. */
export const SIGNAL_WEIGHTS: Record<string, number> = {
  // Identity / account standing (shared, score into global)
  'verification.id_verified': 25,
  'verification.phone_verified': 5,
  'verification.persona_verified': 15,
  'account.aged_30d': 3,
  'account.aged_1y': 10,
  // Community behavior
  'community.endorsement_received': 4,
  'community.in_person_checkin': 2,
  // Moderation (penalties)
  'moderation.report_upheld': -20,
  'moderation.suspended': -50,
  // Marketplace
  'marketplace.deal_completed': 6,
  'marketplace.listing_flagged': -8,
  'marketplace.dispute_lost': -15,
  // Sponsorship
  'sponsorship.received': 1,
}

/** The weight for a `source.signal_type` pair (0 if not in the catalog). */
export function weightFor(source: string, signalType: string): number {
  return SIGNAL_WEIGHTS[`${source}.${signalType}`] ?? 0
}

/** Whether a `source.signal_type` pair is a known, catalogued signal. */
export function isKnownSignal(source: string, signalType: string): boolean {
  return `${source}.${signalType}` in SIGNAL_WEIGHTS
}
