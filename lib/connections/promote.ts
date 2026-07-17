// PURE promotion-state resolver for the consent-gated promotion of a personal
// `network_contacts` capture into the shared marketing `contacts` DB (ADR-742,
// riding ADR-099's consent ladder + ADR-154's privacy invariant).
//
// Promotion is DELIBERATE and consent-gated: the member taps to add someone, and
// the marketing row is created at consent_state='unknown' (a lead, never mailable
// until they confirm). This module holds only the framework-free decision of WHAT
// state a contact is in, so the server action and the UI agree and it is unit-
// testable in one place. The privileged write itself lives in crm-sync.syncScanToCrm.

import type { NetworkContact } from './types'

/** Whether a personal capture can be promoted into the marketing contacts DB.
 *  - `linked`      — already bridged (linked_contact_id set); promoting again is a no-op.
 *  - `needs_email` — no email to dedupe on; the marketing DB keys on lower(email).
 *  - `ready`       — has an email and isn't linked yet: eligible to promote. */
export type PromotionState = 'linked' | 'needs_email' | 'ready'

/** Resolve the promotion state from the only two fields it depends on. Pure. */
export function promotionState(
  c: Pick<NetworkContact, 'linkedContactId' | 'email'>,
): PromotionState {
  if (c.linkedContactId) return 'linked'
  if (!(c.email ?? '').trim()) return 'needs_email'
  return 'ready'
}

/** Is this capture already in the marketing contacts DB? Convenience for indicators. */
export function isPromoted(c: Pick<NetworkContact, 'linkedContactId'>): boolean {
  return Boolean(c.linkedContactId)
}
