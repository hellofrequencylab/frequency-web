// MEMBERSHIP-INCLUDED EVENTS (ADR-823 glue). The reverse read of the membership-linked ticket
// gate: which UPCOMING events hosted by this Space carry a members-only ticket tier? The join
// surface advertises these on each membership card ("includes a member ticket to MELD"), so the
// link an operator configures in the ticket editor markets the membership automatically — no
// hand-maintained benefit strings needed. Server-only, service-role read, FAIL-SAFE to [].

import { createAdminClient } from '@/lib/supabase/admin'
import { upcomingEventFloor } from './upcoming-floor'

export interface MembershipIncludedEvent {
  id: string
  slug: string
  title: string
  startsAt: string
  /** The membership tiers whose members get this event's gated ticket(s): the referenced
   *  space_membership_tiers ids, with `null` meaning ANY active membership qualifies. */
  tierIds: (string | null)[]
}

/** Upcoming, published, not-cancelled events hosted by `spaceId` (the explicit hosting entity,
 *  else the placement space — the same resolution the checkout gates on, ADR-819) that carry at
 *  least one active members-only ticket tier. Ordered soonest first, capped small (a join card is
 *  a pitch, not a calendar). FAIL-SAFE to []. */
export async function listMembershipIncludedEvents(
  spaceId: string,
  limit = 6,
): Promise<MembershipIncludedEvent[]> {
  try {
    const admin = createAdminClient()
    const { data: events } = await admin
      .from('events')
      .select('id, slug, title, starts_at, status, is_cancelled')
      .or(`host_space_id.eq.${spaceId},and(host_space_id.is.null,space_id.eq.${spaceId})`)
      .gte('starts_at', upcomingEventFloor())
      .order('starts_at', { ascending: true })
      .limit(48)
    const rows = ((events ?? []) as unknown as {
      id: string
      slug: string
      title: string
      starts_at: string
      status: string | null
      is_cancelled: boolean | null
    }[]).filter((e) => (e.status ?? 'published') === 'published' && !e.is_cancelled)
    if (rows.length === 0) return []

    const { data: tiers } = await admin
      .from('event_ticket_types')
      .select('event_id, space_tier_id')
      .in('event_id', rows.map((e) => e.id))
      .eq('space_members_only', true)
      .eq('active', true)
    const byEvent = new Map<string, Set<string | null>>()
    for (const t of ((tiers ?? []) as unknown as { event_id: string; space_tier_id: string | null }[])) {
      const set = byEvent.get(t.event_id) ?? new Set<string | null>()
      set.add(t.space_tier_id)
      byEvent.set(t.event_id, set)
    }

    return rows
      .filter((e) => byEvent.has(e.id))
      .slice(0, limit)
      .map((e) => ({
        id: e.id,
        slug: e.slug,
        title: e.title,
        startsAt: e.starts_at,
        tierIds: [...(byEvent.get(e.id) ?? [])],
      }))
  } catch {
    return []
  }
}

/** PURE (tested): does an included event's gate cover a given membership tier? A `null` in
 *  `tierIds` means any active membership qualifies; otherwise the tier must be named. */
export function includedEventCoversTier(
  event: Pick<MembershipIncludedEvent, 'tierIds'>,
  tierId: string | undefined,
): boolean {
  if (event.tierIds.includes(null)) return true
  return tierId != null && event.tierIds.includes(tierId)
}
