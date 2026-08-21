// SPACE-ACCESS CONTEXT for the ticket-tier editors (ADR-823). The ONE loader both editor
// surfaces (the host Manage panel and the /admin event console) use to render the "Who can buy"
// control: the event's hosting Space (host_space_id, else the placement space — the same
// resolution the checkout gates on, ADR-819), its membership tiers, and whether its plan clears
// the Collective gate. Null when the event has no hosting Space — the control doesn't render.
// Server-only read; authorization is the calling page's job (both pages gate before loading).

import { createAdminClient } from '@/lib/supabase/admin'
import { listMembershipTiers } from '@/lib/spaces/memberships'
import { featureAllowed } from '@/lib/pricing/gates'
import { featureGatesLive } from '@/lib/pricing/settings'
import { asSpacePlan } from '@/lib/pricing/plans'
import { resolveHostingSpaceIdFromRow } from './host-space'

/** Membership-linked access context (ADR-823): the event's hosting Space, its membership tiers,
 *  and whether its plan clears the Collective gate for members-only tickets. */
export type SpaceAccessContext = {
  spaceName: string
  /** Plan gate: false = show the locked upsell hint instead of the control. */
  allowed: boolean
  membershipTiers: { id: string; name: string }[]
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

  const [membershipTiers, allowed] = await Promise.all([
    listMembershipTiers(spaceId),
    (async () =>
      featureAllowed(
        'space_membership_tickets',
        { plan: asSpacePlan(space.plan) },
        { gatesLive: await featureGatesLive() },
      ))(),
  ])
  return {
    spaceName: space.brand_name ?? space.name ?? 'this space',
    allowed,
    membershipTiers: membershipTiers
      .filter((t) => t.id)
      .map((t) => ({ id: t.id!, name: t.name })),
  }
}
