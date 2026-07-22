// Shared venue coordination holds (Collaborator spaces B3, ADR-799 §B) — the READS + pure helpers.
// A space_venue_holds row is a request->approve HOLD: an accepted collaborator asks to use a partner
// space's venue at a time; the venue owner/admin approves. It is advisory coordination only and NEVER
// touches the space_bookings conflict engine, so a hold can never double-book. Service-role only (the
// table is RLS-deny-all); the app-layer authz lives here + in venue-actions.ts.

import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { listAcceptedCollaborations } from './collaborations'

export type VenueHoldStatus = 'pending' | 'accepted' | 'declined' | 'cancelled'

/** A raw space_venue_holds row (untyped table, ADR-246). */
export interface VenueHoldRow {
  id: string
  venue_space_id: string
  requester_space_id: string
  requested_by: string
  title: string
  starts_at: string
  ends_at: string
  status: VenueHoldStatus
  created_at: string | null
  responded_at: string | null
  responded_by: string | null
}

type PartnerSpace = { id: string; slug: string; name: string }

/** A hold shaped for a surface, from `forSpaceId`'s perspective. */
export interface VenueHoldView {
  id: string
  status: VenueHoldStatus
  /** Is `forSpaceId` the VENUE (the approver) or the REQUESTER of this hold? */
  role: 'venue' | 'requester'
  /** The OTHER space in the hold. */
  partner: PartnerSpace
  title: string
  startsAt: string
  endsAt: string
  /** True when `forSpaceId` is the venue and the hold is still pending (its owner/admin must act). */
  awaitingMyApproval: boolean
  createdAt: string | null
}

function untyped(): SupabaseClient {
  return createAdminClient()
}

/** The space id on the OTHER side of a hold from `spaceId`. PURE. */
export function partnerSideForHold(row: Pick<VenueHoldRow, 'venue_space_id' | 'requester_space_id'>, spaceId: string): string {
  return row.venue_space_id === spaceId ? row.requester_space_id : row.venue_space_id
}

/** `spaceId`'s role in a hold. PURE. */
export function roleForHold(row: Pick<VenueHoldRow, 'venue_space_id'>, spaceId: string): 'venue' | 'requester' {
  return row.venue_space_id === spaceId ? 'venue' : 'requester'
}

async function resolveSpaces(admin: SupabaseClient, ids: string[]): Promise<Map<string, PartnerSpace>> {
  const map = new Map<string, PartnerSpace>()
  const unique = [...new Set(ids)].filter(Boolean)
  if (unique.length === 0) return map
  const { data } = await admin.from('spaces').select('id, name, brand_name, slug').in('id', unique)
  for (const r of (data ?? []) as Array<{ id: string; name: string | null; brand_name: string | null; slug: string }>) {
    map.set(r.id, { id: r.id, slug: r.slug, name: r.brand_name ?? r.name ?? 'Space' })
  }
  return map
}

/** Load one hold row by id (for the respond/cancel authz). FAIL-SAFE null. */
export async function loadVenueHold(id: string): Promise<VenueHoldRow | null> {
  if (!id) return null
  try {
    const { data } = await untyped().from('space_venue_holds').select('*').eq('id', id).maybeSingle()
    return (data as VenueHoldRow | null) ?? null
  } catch {
    return null
  }
}

async function loadHoldViews(spaceId: string, statuses?: VenueHoldStatus[]): Promise<VenueHoldView[]> {
  if (!spaceId) return []
  try {
    const admin = untyped()
    const [asVenue, asRequester] = await Promise.all([
      admin.from('space_venue_holds').select('*').eq('venue_space_id', spaceId),
      admin.from('space_venue_holds').select('*').eq('requester_space_id', spaceId),
    ])
    let rows = [
      ...((asVenue.data ?? []) as VenueHoldRow[]),
      ...((asRequester.data ?? []) as VenueHoldRow[]),
    ]
    if (statuses) rows = rows.filter((r) => statuses.includes(r.status))
    if (rows.length === 0) return []
    const spaces = await resolveSpaces(admin, rows.map((r) => partnerSideForHold(r, spaceId)))
    return rows.flatMap((r) => {
      const partner = spaces.get(partnerSideForHold(r, spaceId))
      if (!partner) return []
      return [
        {
          id: r.id,
          status: r.status,
          role: roleForHold(r, spaceId),
          partner,
          title: r.title,
          startsAt: r.starts_at,
          endsAt: r.ends_at,
          awaitingMyApproval: r.status === 'pending' && r.venue_space_id === spaceId,
          createdAt: r.created_at,
        } satisfies VenueHoldView,
      ]
    })
  } catch {
    return []
  }
}

/** Every hold touching `spaceId` (as venue or requester), any state. Sorted soonest-first. FAIL-SAFE. */
export async function listVenueHoldsForSpace(spaceId: string): Promise<VenueHoldView[]> {
  const views = await loadHoldViews(spaceId)
  return views.sort((a, b) => (a.startsAt < b.startsAt ? -1 : a.startsAt > b.startsAt ? 1 : 0))
}

/** The PENDING holds ON this space's venue that its owner/admin must approve. FAIL-SAFE. */
export async function listIncomingVenueHoldRequests(spaceId: string): Promise<VenueHoldView[]> {
  return (await loadHoldViews(spaceId, ['pending'])).filter((v) => v.awaitingMyApproval)
}

/** Accepted holds involving this space (either side), for the shared calendar. FAIL-SAFE. */
export async function listAcceptedVenueHolds(spaceId: string): Promise<VenueHoldView[]> {
  return loadHoldViews(spaceId, ['accepted'])
}

/** True when an ACCEPTED space_collaboration links the two spaces (the gate for creating a hold). Reuses
 *  the collaboration read (checks from `spaceA`'s accepted partners), FAIL-SAFE false. */
export async function spacesHaveAcceptedCollaboration(spaceA: string, spaceB: string): Promise<boolean> {
  if (!spaceA || !spaceB || spaceA === spaceB) return false
  const partners = await listAcceptedCollaborations(spaceA)
  return partners.some((p) => p.partner.id === spaceB)
}
