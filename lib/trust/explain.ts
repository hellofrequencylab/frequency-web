// The EXPLAINABLE read of a member's trust (LIVE-679, ADR-247). Pure: the member's own signals in,
// one line per kind of signal out, each with what it adds and how many times it counted. The labels
// live here, next to the weights, so a new signal type cannot ship without the sentence a member
// reads about it. Trust is reputation, never money, and a member only ever sees their own.

import { computeScores, type SignalForCompute } from './compute'
import { weightFor } from './weights'

/** What a member reads for each `source.signal_type`. A key missing here reads as "Other activity". */
export const SIGNAL_LABELS: Record<string, string> = {
  'verification.id_verified': 'Your identity was verified',
  'verification.phone_verified': 'Your phone number was verified',
  'verification.persona_verified': 'A role you hold was verified',
  'verification.org_verified': 'A Space you run was verified as a Non Profit',
  'account.aged_30d': 'Your account is over a month old',
  'account.aged_1y': 'Your account is over a year old',
  'community.endorsement_received': 'Someone endorsed you',
  'community.in_person_checkin': 'You checked in at a gathering in person',
  'moderation.report_upheld': 'A report about something you posted was upheld',
  'moderation.suspended': 'Your account was suspended',
  'marketplace.deal_completed': 'An order you sold was completed',
  'marketplace.listing_flagged': 'A listing of yours was flagged',
  'marketplace.dispute_lost': 'A payment dispute on your sale was lost',
  'sponsorship.received': 'You were sponsored',
}

export interface TrustExplanationLine {
  key: string
  label: string
  /** What one of these adds (negative for a penalty). */
  weight: number
  count: number
  /** weight x count. */
  total: number
}

export interface TrustExplanation {
  /** The global score, floored at 0, exactly as the projection computes it. */
  score: number
  /** Biggest effect first, credit before penalty on a tie. Zero-weight signals are left out. */
  lines: TrustExplanationLine[]
}

/** Explain a member's own signals. PURE. */
export function explainTrust(signals: readonly SignalForCompute[]): TrustExplanation {
  const byKey = new Map<string, TrustExplanationLine>()
  for (const s of signals) {
    const key = `${s.source}.${s.signalType}`
    const weight = weightFor(s.source, s.signalType)
    if (weight === 0) continue
    const line = byKey.get(key) ?? { key, label: SIGNAL_LABELS[key] ?? 'Other activity', weight, count: 0, total: 0 }
    line.count += 1
    line.total = line.weight * line.count
    byKey.set(key, line)
  }
  const lines = [...byKey.values()].sort((a, b) => Math.abs(b.total) - Math.abs(a.total) || b.total - a.total)
  return { score: computeScores(signals).global, lines }
}
