import type { Database } from '@/lib/database.types'

// Shared cancel/reinstate audit payloads (H1-3). Every event-cancel write path
// flips is_cancelled; these helpers attach the who/when/why so the trail is
// uniform across all sites (member host cancel, admin cancel/reinstate, embedded
// settings, context-menu, moderation report, staff removal).
//
// is_cancelled stays the source of truth for the boolean state — these columns
// annotate it. Reinstate clears the trail (the durable "was cancelled then
// reinstated" history lives in admin_audit_log, not in a state-annotation column).
//
// The cancelled_at/by/reason columns aren't in the generated types yet (regenerated
// in H0-3), so the return is cast through unknown once here (ADR-246) — call sites
// stay clean and lose the cast for free when the types regenerate.

type EventUpdate = Database['public']['Tables']['events']['Update']

/** Columns to set when flipping an event to cancelled. Empty/whitespace reason
 *  and a missing actor both normalise to null. */
export function cancelAudit(actorProfileId: string | null, reason: string | null): EventUpdate {
  return {
    is_cancelled: true,
    cancelled_at: new Date().toISOString(),
    cancelled_by: actorProfileId,
    cancellation_reason: (reason ?? '').trim() || null,
  } as unknown as EventUpdate
}

/** Columns to set when reinstating an event (clears the audit trail). */
export function reinstateAudit(): EventUpdate {
  return {
    is_cancelled: false,
    cancelled_at: null,
    cancelled_by: null,
    cancellation_reason: null,
  } as unknown as EventUpdate
}
