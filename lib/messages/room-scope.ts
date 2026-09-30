// ── Who may JOIN a scoped room: the caller must belong to the room's scope (LIVE-651, ADR-1626) ──
//
// A room's `visibility` is one of public, private, circle, hub, nexus, outpost or channel, and a
// scoped room carries the id of its place in `rooms.scope_id`. `joinRoom` writes the membership row
// through the ADMIN client, so RLS never stands between a caller and a scoped room: the check has
// to live here, in the app, before the write. Before this module joinRoom refused only `private`,
// so any signed-in member could join a Circle's room they were not in by posting its id (SEC-5).
//
// What "belongs" means per kind, read from the caller's own rows outward (a member holds a
// handful of memberships, so no query here fans out over a whole Nexus):
//   circle   an active `memberships` row in that Circle, the Circle's host, or an active
//            stewardship edge on it
//   hub      an active membership in a Circle under that Hub, the Hub's guide, or an edge on it
//   nexus    an active membership in a Circle under that Nexus, the Nexus's mentor, or an edge
//   outpost  an active membership in a Circle under a Nexus of that Outpost, or an edge on it
//   channel  tuned in (`topical_channel_memberships`), the same gate sendRoomMessage posts behind
//
// FAIL-CLOSED. A scoped room with no scope_id, a kind this build does not know, or any read that
// errors answers "does not belong". A wrong refusal is a member asking why; a wrong admission is
// a stranger inside a Circle's conversation.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'
import type { RoomVisibility } from './room-access'

// The caller hands in its own service-role client (joinRoom and inviteToRoom already hold one);
// this module never creates one, so it adds nothing to the admin-client ratchet.
type AdminClient = SupabaseClient<Database>

/** The scoped kinds: a room of one of these is joinable only from inside its place. */
export type ScopedRoomVisibility = Exclude<RoomVisibility, 'public' | 'private'>

const SCOPED: readonly ScopedRoomVisibility[] = ['circle', 'hub', 'nexus', 'outpost', 'channel']

export function isScopedRoomVisibility(v: unknown): v is ScopedRoomVisibility {
  return typeof v === 'string' && (SCOPED as readonly string[]).includes(v)
}

/**
 * The one line a refused caller reads, in the naming canon's words: you JOIN a Circle, Hub,
 * Nexus or Outpost, and you TUNE INTO a Channel (docs/NAMING.md). No em dash (CONTENT-VOICE).
 */
export function scopedRoomRefusal(visibility: ScopedRoomVisibility): string {
  switch (visibility) {
    case 'channel':
      return 'Tune into this Channel to join its room.'
    case 'circle':
      return 'This room is for members of its Circle. Join the Circle first.'
    case 'hub':
      return 'This room is for members of its Hub. Join a Circle in the Hub first.'
    case 'nexus':
      return 'This room is for members of its Nexus. Join a Circle in the Nexus first.'
    case 'outpost':
      return 'This room is for members of its Outpost. Join a Circle there first.'
  }
}

function ids(rows: unknown, key: string): string[] {
  if (!Array.isArray(rows)) return []
  const out: string[] = []
  for (const row of rows) {
    const v = (row as Record<string, unknown> | null)?.[key]
    if (typeof v === 'string' && v) out.push(v)
  }
  return [...new Set(out)]
}

/** Does the profile hold an ACTIVE stewardship edge on exactly this scope? */
async function stewardsScope(
  admin: AdminClient,
  profileId: string,
  scopeType: 'circle' | 'hub' | 'nexus' | 'outpost',
  scopeId: string,
): Promise<boolean> {
  const { data, error } = await admin
    .from('stewardships')
    .select('id')
    .eq('profile_id', profileId)
    .eq('scope_type', scopeType)
    .eq('scope_id', scopeId)
    .eq('state', 'active')
    .limit(1)
  return !error && Array.isArray(data) && data.length > 0
}

/** Does the profile lead this place through its leader column (host / guide / mentor)? */
async function leadsPlace(
  admin: AdminClient,
  profileId: string,
  scopeType: 'circle' | 'hub' | 'nexus',
  scopeId: string,
): Promise<boolean> {
  const res =
    scopeType === 'circle'
      ? await admin.from('circles').select('id').eq('id', scopeId).eq('host_id', profileId).limit(1)
      : scopeType === 'hub'
        ? await admin.from('hubs').select('id').eq('id', scopeId).eq('guide_id', profileId).limit(1)
        : await admin.from('nexuses').select('id').eq('id', scopeId).eq('mentor_id', profileId).limit(1)
  return !res.error && Array.isArray(res.data) && res.data.length > 0
}

/**
 * Is the profile an active member of a Circle that sits in this place? Walks UP from the caller's
 * own memberships (Circle -> Hub -> Nexus -> Outpost), so the reads are bounded by how many
 * Circles one member is in, not by how big the place is. Any read error answers false.
 */
async function memberOfPlace(
  admin: AdminClient,
  profileId: string,
  scopeType: 'circle' | 'hub' | 'nexus' | 'outpost',
  scopeId: string,
): Promise<boolean> {
  const mem = await admin
    .from('memberships')
    .select('circle_id')
    .eq('profile_id', profileId)
    .eq('status', 'active')
  if (mem.error) return false
  const circleIds = ids(mem.data, 'circle_id')
  if (circleIds.length === 0) return false
  if (scopeType === 'circle') return circleIds.includes(scopeId)

  const circles = await admin.from('circles').select('hub_id').in('id', circleIds)
  if (circles.error) return false
  const hubIds = ids(circles.data, 'hub_id')
  if (scopeType === 'hub') return hubIds.includes(scopeId)
  if (hubIds.length === 0) return false

  const hubs = await admin.from('hubs').select('nexus_id').in('id', hubIds)
  if (hubs.error) return false
  const nexusIds = ids(hubs.data, 'nexus_id')
  if (scopeType === 'nexus') return nexusIds.includes(scopeId)
  if (nexusIds.length === 0) return false

  const nexuses = await admin.from('nexuses').select('outpost_id').in('id', nexusIds)
  if (nexuses.error) return false
  return ids(nexuses.data, 'outpost_id').includes(scopeId)
}

/**
 * Does this profile belong to the scope a scoped room lives in? The gate `joinRoom` (and
 * `inviteToRoom`, for the invitee) asks before writing a `room_members` row through the admin
 * client. FAIL-CLOSED: no scope id, an unknown kind, or any read error answers false.
 */
export async function belongsToRoomScope(
  admin: AdminClient,
  room: { visibility: string; scope_id: string | null },
  profileId: string,
): Promise<boolean> {
  const { visibility, scope_id: scopeId } = room
  if (!isScopedRoomVisibility(visibility) || !scopeId || !profileId) return false
  try {
    if (visibility === 'channel') {
      const { data, error } = await admin
        .from('topical_channel_memberships')
        .select('profile_id')
        .eq('topical_channel_id', scopeId)
        .eq('profile_id', profileId)
        .limit(1)
      return !error && Array.isArray(data) && data.length > 0
    }
    if (await memberOfPlace(admin, profileId, visibility, scopeId)) return true
    if (visibility !== 'outpost' && (await leadsPlace(admin, profileId, visibility, scopeId))) return true
    return await stewardsScope(admin, profileId, visibility, scopeId)
  } catch {
    return false
  }
}
