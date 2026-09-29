// ── Who may JOIN a room: the server-action gate joinRoom was missing (LIVE-651 / SEC-5) ────────
//
// joinRoom used to refuse only `private`, then upsert a room_members row through the admin
// client for everything else. rooms_visibility_check also allows circle, hub, nexus, outpost
// and channel, each with a scope_id, so a member who did not belong to that Circle (or Hub,
// Nexus, Outpost, Channel) could still join its room by calling the action with the id.
// Posting was already re-gated; joining was not. The compose UI only mints public/private
// rooms, so the hole is the scoped rooms that already exist.
//
// The rule lives here, next to the read/post rule in room-access.ts, so joinRoom stays a thin
// action and the membership walk is tested without Next. Nothing here is the authorization
// boundary by itself: joinRoom still holds the admin client. This is the check it was not
// making. Fail-closed on a missing scope, a missing row, or a thrown read.

import type { RoomVisibility } from '@/lib/messages/room-access'

/** The admin client's `.from` is all this module needs. joinRoom already holds one; tests pass
 *  the same chainable shape. Not imported from lib/supabase/admin, so this file is not an
 *  RLS-bypass importer of its own. */
export type RoomScopeAdmin = {
  from: (table: string) => unknown
}

type Row = Record<string, unknown>

type Filter = {
  select: (columns: string) => Filter
  eq: (column: string, value: string) => Filter
  in: (column: string, values: readonly string[]) => Filter
  limit: (n: number) => Filter
  maybeSingle: () => Promise<{ data: Row | null }>
} & PromiseLike<{ data: Row[] | null }>

const SCOPED: readonly RoomVisibility[] = ['circle', 'hub', 'nexus', 'outpost', 'channel']

function isScopedVisibility(v: string): v is Exclude<RoomVisibility, 'public' | 'private'> {
  return (SCOPED as readonly string[]).includes(v)
}

function filter(admin: RoomScopeAdmin, table: string): Filter {
  return admin.from(table) as Filter
}

function ids(rows: Row[] | null, column: string): string[] {
  return (rows ?? []).map((r) => r[column]).filter((v): v is string => typeof v === 'string' && v.length > 0)
}

async function one(admin: RoomScopeAdmin, table: string, column: string, value: string, columns: string): Promise<Row | null> {
  const { data } = await filter(admin, table).select(columns).eq(column, value).maybeSingle()
  return data
}

async function listEq(admin: RoomScopeAdmin, table: string, column: string, value: string, columns: string): Promise<Row[]> {
  const { data } = await filter(admin, table).select(columns).eq(column, value)
  return data ?? []
}

async function listIn(admin: RoomScopeAdmin, table: string, column: string, values: readonly string[], columns: string): Promise<Row[]> {
  if (values.length === 0) return []
  const { data } = await filter(admin, table).select(columns).in(column, values)
  return data ?? []
}

/** Active memberships.circle_id rows for this profile, limited to the given circles. */
async function isActiveMemberOfCircles(admin: RoomScopeAdmin, profileId: string, circleIds: string[]): Promise<boolean> {
  if (circleIds.length === 0) return false
  const { data } = await filter(admin, 'memberships')
    .select('id')
    .in('circle_id', circleIds)
    .eq('profile_id', profileId)
    .eq('status', 'active')
    .limit(1)
    .maybeSingle()
  return !!data
}

/** Circle ids under this Hub / Nexus / Outpost, the same walk place-tree uses for audience. */
async function circleIdsUnder(admin: RoomScopeAdmin, visibility: 'hub' | 'nexus' | 'outpost', scopeId: string): Promise<string[]> {
  if (visibility === 'hub') {
    return ids(await listEq(admin, 'circles', 'hub_id', scopeId, 'id'), 'id')
  }
  if (visibility === 'nexus') {
    const hubIds = ids(await listEq(admin, 'hubs', 'nexus_id', scopeId, 'id'), 'id')
    return ids(await listIn(admin, 'circles', 'hub_id', hubIds, 'id'), 'id')
  }
  const nexusIds = ids(await listEq(admin, 'nexuses', 'outpost_id', scopeId, 'id'), 'id')
  const hubIds = ids(await listIn(admin, 'hubs', 'nexus_id', nexusIds, 'id'), 'id')
  return ids(await listIn(admin, 'circles', 'hub_id', hubIds, 'id'), 'id')
}

/**
 * Does this profile belong to the room's scope? Public and private are not asked here
 * (joinRoom handles those). A scoped room with no scope_id is a no.
 */
export async function belongsToRoomScope(
  admin: RoomScopeAdmin,
  opts: { visibility: string; scopeId: string | null; profileId: string },
): Promise<boolean> {
  const { visibility, scopeId, profileId } = opts
  if (!scopeId || !profileId || !isScopedVisibility(visibility)) return false
  try {
    if (visibility === 'channel') {
      const { data } = await filter(admin, 'topical_channel_memberships')
        .select('profile_id')
        .eq('topical_channel_id', scopeId)
        .eq('profile_id', profileId)
        .maybeSingle()
      return !!data
    }
    if (visibility === 'circle') {
      const circle = await one(admin, 'circles', 'id', scopeId, 'host_id')
      if (!circle) return false
      if (circle.host_id === profileId) return true
      return isActiveMemberOfCircles(admin, profileId, [scopeId])
    }
    if (visibility === 'hub') {
      const hub = await one(admin, 'hubs', 'id', scopeId, 'guide_id')
      if (!hub) return false
      if (hub.guide_id === profileId) return true
      return isActiveMemberOfCircles(admin, profileId, await circleIdsUnder(admin, 'hub', scopeId))
    }
    if (visibility === 'nexus') {
      const nexus = await one(admin, 'nexuses', 'id', scopeId, 'mentor_id')
      if (!nexus) return false
      if (nexus.mentor_id === profileId) return true
      return isActiveMemberOfCircles(admin, profileId, await circleIdsUnder(admin, 'nexus', scopeId))
    }
    // outpost: no leader FK on the row. The roster is every active member of a Circle under a
    // Nexus that sits on this Outpost.
    const nexuses = await listEq(admin, 'nexuses', 'outpost_id', scopeId, 'id')
    if (nexuses.length === 0) return false
    return isActiveMemberOfCircles(admin, profileId, await circleIdsUnder(admin, 'outpost', scopeId))
  } catch {
    return false
  }
}

/** The line joinRoom throws when the caller may not join. Private keeps the copy it already used. */
export function joinRoomRefusal(visibility: string): string {
  switch (visibility) {
    case 'private':
      return 'This room is private. You need an invite to join.'
    case 'circle':
      return 'You have to belong to this Circle to join its room.'
    case 'hub':
      return 'You have to belong to this Hub to join its room.'
    case 'nexus':
      return 'You have to belong to this Nexus to join its room.'
    case 'outpost':
      return 'You have to belong to this Outpost to join its room.'
    case 'channel':
      return 'Tune into this Channel to join its room.'
    default:
      return 'You cannot join this room.'
  }
}
