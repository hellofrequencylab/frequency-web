// DUNNING / PRORATION / PAST-DUE — the member-facing recovery state for failed/changed payments
// (ADR-370, REMAINING-WORK #7). Two concerns:
//   1. resolveMemberPaymentState() — the member's personal-membership payment state for the past-due
//      banner / state. Reads profiles.membership_payment_status (migration 20260727000000).
//   2. prorationNote() — the PURE copy a plan-change surface shows so a member knows a switch is
//      prorated (no surprise charge). No IO; unit-testable.
//
// DARK UNTIL LAUNCH (the ABSOLUTE INVARIANT, ADR-370): resolveMemberPaymentState() is GATED on
// billingLive() — while billing is OFF it ALWAYS returns 'active', so no past-due banner, no recovery
// prompt, no behavior change. Only once billing is live, and the gated member webhook has written a
// 'past_due' / 'canceled' status, does the recovery UX appear. FAIL-SAFE: any error reads as 'active'
// (never strand a paying member behind a false past-due wall). All copy follows CONTENT-VOICE (no em
// dashes).

import { createAdminClient } from '@/lib/supabase/admin'
import { billingLive } from './settings'

/** The member-facing payment state. 'active' is the default + the OFF state (today's behavior). */
export type MemberPaymentState = 'active' | 'past_due' | 'canceled'

/** Narrow a raw membership_payment_status value to a MemberPaymentState, defaulting to 'active' for
 *  null/unknown (FAIL-SAFE: an unwritten column reads as active). PURE. */
export function asMemberPaymentState(raw: unknown): MemberPaymentState {
  return raw === 'past_due' || raw === 'canceled' ? raw : 'active'
}

/** The signed-in member's payment state for the dunning UX. GATED on billingLive(): returns 'active'
 *  while billing is OFF (dark until launch). FAIL-SAFE 'active' on any error. The column isn't in the
 *  generated types yet (ADR-246) — reach untyped. */
export async function resolveMemberPaymentState(profileId: string | null | undefined): Promise<MemberPaymentState> {
  if (!profileId) return 'active'
  try {
    // While billing is OFF the recovery UX is entirely dark — never read or surface a status.
    if (!(await billingLive())) return 'active'
    const admin = createAdminClient()
    const { data } = await (admin as unknown as {
      from: (t: string) => {
        select: (c: string) => { eq: (col: string, v: string) => { maybeSingle: () => Promise<{ data: Record<string, unknown> | null }> } }
      }
    })
      .from('profiles')
      .select('membership_payment_status')
      .eq('id', profileId)
      .maybeSingle()
    return asMemberPaymentState(data?.membership_payment_status)
  } catch {
    return 'active'
  }
}

/** Is the member in a recovery state (past_due or canceled) that should surface a banner? Convenience
 *  over resolveMemberPaymentState — false while billing is OFF (dark until launch). */
export async function memberInRecovery(profileId: string | null | undefined): Promise<boolean> {
  const state = await resolveMemberPaymentState(profileId)
  return state === 'past_due' || state === 'canceled'
}

/** The PURE proration note for a plan change between two monthly prices (cents). A member switching
 *  plans mid-cycle is charged/credited the difference; this is the plain-voice line that says so, so
 *  there is no surprise charge. Returns null when there is nothing to say (same price, or no upgrade).
 *  PURE — unit-testable. No em dashes (CONTENT-VOICE §10). */
export function prorationNote(fromCents: number, toCents: number): string | null {
  if (!Number.isFinite(fromCents) || !Number.isFinite(toCents)) return null
  if (toCents > fromCents) {
    return 'You will be charged the difference for the rest of this billing period, then the new price each period after.'
  }
  if (toCents < fromCents) {
    return 'You will get credit for the unused part of this period, applied to your next bill.'
  }
  return null
}
