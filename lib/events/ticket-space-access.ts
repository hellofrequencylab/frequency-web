// SPACE-ACCESS CONTEXT for the ticket-tier editors (ADR-823). The ONE loader both editor
// surfaces (the host Manage panel and the /admin event console) use to render the "Who can buy"
// control: the event's hosting Space (host_space_id, else the placement space — the same
// resolution the checkout gates on, ADR-819), its membership tiers, and whether its plan clears
// the space_membership_tickets gate. Null when the event has no hosting Space — the control
// doesn't render. Server-only read; authorization is the calling page's job (both pages gate
// before loading).
//
// LIVE-410 put that gate on the free floor. LIVE-428 names any remaining wall through
// featureWallLabel (never the retired Collective label from LIVE-228). An operator
// override that raises the gate still refuses the write and still names the raised plan.

import { createAdminClient } from '@/lib/supabase/admin'
import { listMembershipTiers } from '@/lib/spaces/memberships'
import { featureAllowed, loadFeatureGateOverrides } from '@/lib/pricing/gates'
import { featureWallLabel } from '@/lib/pricing/feature-tiers'
import { featureGatesLive } from '@/lib/pricing/settings'
import { asSpacePlan, SPACE_PLAN_LABEL } from '@/lib/pricing/plans'
import { resolveHostingSpaceIdFromRow } from './host-space'

export const MEMBERSHIP_TICKET_FEATURE = 'space_membership_tickets' as const

/** Membership-linked access context (ADR-823): the event's hosting Space, its membership tiers,
 *  and whether its plan clears the membership-ticket gate. `wallLabel` is the naming-canon plan
 *  word for the locked hint (LIVE-231 / LIVE-428). */
export type SpaceAccessContext = {
  spaceName: string
  /** Plan gate: false = show the locked upsell hint instead of the control. */
  allowed: boolean
  /** The plan the locked hint names. Read off the merged gate, never typed. */
  wallLabel: string
  membershipTiers: { id: string; name: string }[]
}

/** The same seam the ticket writers and the Event access panel ask. PURE sentence, IO gate. */
export function membershipTicketWallSentence(wall: string): string {
  return `Membership-only tickets come with ${wall}.`
}

export async function resolveMembershipTicketGate(
  plan: string | null | undefined,
): Promise<{ allowed: boolean; wall: string }> {
  const [overrides, gatesLive] = await Promise.all([
    loadFeatureGateOverrides(),
    featureGatesLive(),
  ])
  const allowed = await featureAllowed(
    MEMBERSHIP_TICKET_FEATURE,
    { plan: asSpacePlan(plan) },
    { gatesLive },
  )
  const wall =
    featureWallLabel(MEMBERSHIP_TICKET_FEATURE, overrides) ?? SPACE_PLAN_LABEL.free
  return { allowed, wall }
}

export async function loadSpaceAccessContext(eventId: string): Promise<SpaceAccessContext | null> {
  const admin = createAdminClient()
  const { data: ev } = await admin
    .from('events')
    .select('space_id, host_space_id')
    .eq('id', eventId)
    .maybeSingle()
  const evRow = ev as { space_id: string | null; host_space_id: string | null } | null
  // Root EXCLUDED: a personal event has no Space access context, and the root stamp used to give
  // it the platform tenant's one.
  const spaceId = await resolveHostingSpaceIdFromRow(evRow)
  if (!spaceId) return null

  const { data: sp } = await admin
    .from('spaces')
    .select('name, brand_name, plan')
    .eq('id', spaceId)
    .maybeSingle()
  const space = sp as { name: string | null; brand_name: string | null; plan: string | null } | null
  if (!space) return null

  const [membershipTiers, gate] = await Promise.all([
    listMembershipTiers(spaceId),
    resolveMembershipTicketGate(space.plan),
  ])
  return {
    spaceName: space.brand_name ?? space.name ?? 'this space',
    allowed: gate.allowed,
    wallLabel: gate.wall,
    membershipTiers: membershipTiers
      .filter((t) => t.id)
      .map((t) => ({ id: t.id!, name: t.name })),
  }
}
