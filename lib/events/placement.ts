import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'

// "Where does this event live" — shared reads + steward resolution for event placement.
//
// An event is placed under a Space (events.space_id) or a Circle (events.scope_circle_id),
// but only after a steward of that target approves the request. This module owns the
// service-role reads both the editor field and the approver surface need; the writes
// (request / approve / decline / clear) live in app/(main)/events/placement-actions.ts.
//
// event_placement_requests is newer than the generated Database types, so we read it through
// an untyped admin handle (the repo convention from circles/admin-actions.ts).

export type PlacementTargetType = 'space' | 'circle'

/** A resolvable placement target (Space or Circle) with display fields. */
export interface PlacementTargetRef {
  type: PlacementTargetType
  id: string
  name: string
  slug: string
}

/** Where an event lives right now, as the editor field renders it. */
export interface PlacementView {
  /** 'live' = approved + set on the event; 'pending' = awaiting a steward; 'none' = unplaced. */
  status: 'none' | 'live' | 'pending'
  target: PlacementTargetRef | null
  /** The pending request id (only when status === 'pending'), so the host can cancel it. */
  requestId: string | null
}

/** One row of a steward's pending-placement inbox. */
export interface PendingPlacementRequest {
  id: string
  eventId: string
  eventTitle: string
  eventSlug: string
  requestedByName: string
  createdAt: string | null
}

export const NO_PLACEMENT: PlacementView = { status: 'none', target: null, requestId: null }

/** Untyped admin handle for the not-yet-in-types event_placement_requests table (ADR-246 escape:
 *  a return-type annotation, not a cast — the repo convention from circles/admin-actions.ts). */
function untyped(): SupabaseClient {
  return createAdminClient()
}

type PlacementRow = {
  id: string
  event_id: string
  target_type: PlacementTargetType
  space_id: string | null
  circle_id: string | null
  status: string
  created_at: string | null
}

async function resolveSpaceRef(admin: SupabaseClient, spaceId: string): Promise<PlacementTargetRef | null> {
  const { data } = await admin.from('spaces').select('id, name, brand_name, slug').eq('id', spaceId).maybeSingle()
  if (!data) return null
  const row = data as { id: string; name: string | null; brand_name: string | null; slug: string }
  return { type: 'space', id: row.id, name: row.brand_name ?? row.name ?? 'Space', slug: row.slug }
}

async function resolveCircleRef(admin: SupabaseClient, circleId: string): Promise<PlacementTargetRef | null> {
  const { data } = await admin.from('circles').select('id, name, slug').eq('id', circleId).maybeSingle()
  if (!data) return null
  const row = data as { id: string; name: string | null; slug: string }
  return { type: 'circle', id: row.id, name: row.name ?? 'Circle', slug: row.slug }
}

/** Resolve a target ref (Space or Circle) by type + id — used to name a placement everywhere. */
export async function resolvePlacementTarget(
  target: { type: PlacementTargetType; id: string },
): Promise<PlacementTargetRef | null> {
  const admin = untyped()
  return target.type === 'space'
    ? resolveSpaceRef(admin, target.id)
    : resolveCircleRef(admin, target.id)
}

/**
 * The event's current placement view: a LIVE placement (events.space_id / scope_circle_id set)
 * wins; otherwise the newest PENDING request, if any; otherwise 'none'. Service-role read — the
 * caller is responsible for authorizing the viewer (the editor action gates on event.editSettings).
 */
export async function getPlacementView(eventId: string): Promise<PlacementView> {
  const admin = untyped()

  const { data: ev } = await admin
    .from('events')
    .select('space_id, scope_circle_id')
    .eq('id', eventId)
    .maybeSingle()
  const event = ev as { space_id: string | null; scope_circle_id: string | null } | null

  if (event?.space_id) {
    const target = await resolveSpaceRef(admin, event.space_id)
    if (target) return { status: 'live', target, requestId: null }
  }
  if (event?.scope_circle_id) {
    const target = await resolveCircleRef(admin, event.scope_circle_id)
    if (target) return { status: 'live', target, requestId: null }
  }

  const { data: pendingRow } = await admin
    .from('event_placement_requests')
    .select('id, event_id, target_type, space_id, circle_id, status, created_at')
    .eq('event_id', eventId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  const pending = pendingRow as PlacementRow | null
  if (pending) {
    const target =
      pending.target_type === 'space' && pending.space_id
        ? await resolveSpaceRef(admin, pending.space_id)
        : pending.circle_id
          ? await resolveCircleRef(admin, pending.circle_id)
          : null
    if (target) return { status: 'pending', target, requestId: pending.id }
  }

  return NO_PLACEMENT
}

/** Profile ids that may approve placement into a Space: the owner plus every ACTIVE admin member. */
export async function listSpaceStewardIds(spaceId: string): Promise<string[]> {
  const admin = untyped()
  const ids = new Set<string>()

  const { data: space } = await admin.from('spaces').select('owner_profile_id').eq('id', spaceId).maybeSingle()
  const ownerId = (space as { owner_profile_id: string | null } | null)?.owner_profile_id
  if (ownerId) ids.add(ownerId)

  const { data: admins } = await admin
    .from('space_members')
    .select('profile_id, role, status')
    .eq('space_id', spaceId)
    .eq('role', 'admin')
    .eq('status', 'active')
  for (const m of (admins ?? []) as Array<{ profile_id: string }>) ids.add(m.profile_id)

  return [...ids]
}

/** Profile ids that may approve placement into a Circle: its host. */
export async function listCircleStewardIds(circleId: string): Promise<string[]> {
  const admin = untyped()
  const { data: circle } = await admin.from('circles').select('host_id').eq('id', circleId).maybeSingle()
  const hostId = (circle as { host_id: string | null } | null)?.host_id
  return hostId ? [hostId] : []
}

/** Pending placement requests awaiting a steward of this target, newest first (approver inbox). */
export async function listPendingPlacementRequests(
  target: { type: PlacementTargetType; id: string },
): Promise<PendingPlacementRequest[]> {
  const admin = untyped()
  const column = target.type === 'space' ? 'space_id' : 'circle_id'

  const { data } = await admin
    .from('event_placement_requests')
    .select('id, event_id, requested_by, created_at')
    .eq(column, target.id)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
  const rows = (data ?? []) as Array<{ id: string; event_id: string; requested_by: string; created_at: string | null }>
  if (rows.length === 0) return []

  const eventIds = [...new Set(rows.map((r) => r.event_id))]
  const requesterIds = [...new Set(rows.map((r) => r.requested_by))]

  const [{ data: events }, { data: profiles }] = await Promise.all([
    admin.from('events').select('id, title, slug').in('id', eventIds),
    admin.from('profiles').select('id, display_name').in('id', requesterIds),
  ])
  const eventById = new Map(
    ((events ?? []) as Array<{ id: string; title: string | null; slug: string }>).map((e) => [e.id, e]),
  )
  const nameById = new Map(
    ((profiles ?? []) as Array<{ id: string; display_name: string | null }>).map((p) => [p.id, p.display_name]),
  )

  return rows.flatMap((r) => {
    const ev = eventById.get(r.event_id)
    if (!ev) return []
    return [
      {
        id: r.id,
        eventId: r.event_id,
        eventTitle: ev.title ?? 'Untitled event',
        eventSlug: ev.slug,
        requestedByName: nameById.get(r.requested_by) ?? 'A host',
        createdAt: r.created_at,
      },
    ]
  })
}
