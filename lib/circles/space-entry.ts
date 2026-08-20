import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * THE TWO SPACE-MODE LOOKUPS, one per audience (OWN-034 ruling C, ADR-1092). App-layer twins of
 * `private.is_space_member`'s seat arm and `private.is_space_paid_member`, for the callers that
 * run on the service-role client and never see RLS (joinCircle above all — joining WRITES the
 * memberships row that `can_enter_circle` later reads, so a miss here would make the model
 * circular).
 *
 * ── WHY TWO FUNCTIONS AND NOT ONE ────────────────────────────────────────────────────────────
 *
 * This file replaces `space-audience.ts` (ADR-1021), whose one export answered the staff-OR-paid
 * union. The owner ruled the union out of existence: `access = 'space_members'` admits the STAFF
 * ladder (`space_members` — viewer < editor < moderator < admin, the people who run the Space),
 * and the new `access = 'space_paid_members'` admits the ACTIVE paying members
 * (`space_memberships`). Near-identical table names, different people. One function per mode
 * means a call site cannot ask the union question by accident.
 *
 * ── 🔴 WHY NEITHER IS A WIDER `is_space_member` (unchanged from ADR-1021) ────────────────────
 *
 * `is_space_member` is not a Circle predicate. SIXTEEN RLS policies use it to gate the CRM
 * pipeline, client notes, orders, disputes and lead capture. Teaching it about paid memberships
 * would hand every paying member of a Space read access to all of that. "Who may enter a Circle"
 * and "who may read the CRM" are only the same question by accident of implementation, and this
 * seam is what keeps them apart.
 */

/** Does this profile hold an ACTIVE seat on the Space's team? The `space_members` mode's door.
 *  Any rung counts — the DB arm reads the whole ladder, and a `viewer` seat opening the team
 *  room (and nothing else) is asserted in pgTAP. */
export async function isSpaceTeamSeat(
  admin: SupabaseClient,
  spaceId: string,
  profileId: string,
): Promise<boolean> {
  const { data } = await admin
    .from('space_members')
    .select('role')
    .eq('space_id', spaceId)
    .eq('profile_id', profileId)
    .eq('status', 'active')
    .maybeSingle()
  return !!data
}

/** Does this profile hold an ACTIVE paid membership in the Space? The `space_paid_members`
 *  mode's door. `space_memberships` keys the member on `member_profile_id`, NOT `profile_id` —
 *  the database refused ADR-1021's first migration for exactly that mix-up, so it is worth a
 *  comment forever. `payment_status` is deliberately not consulted: `status` is the lifecycle
 *  the app writes, and the DB twin (`private.is_space_paid_member`) reads the same column. */
export async function isSpacePaidMember(
  admin: SupabaseClient,
  spaceId: string,
  profileId: string,
): Promise<boolean> {
  const { data } = await admin
    .from('space_memberships')
    .select('id')
    .eq('space_id', spaceId)
    .eq('member_profile_id', profileId)
    .eq('status', 'active')
    .maybeSingle()
  return !!data
}
