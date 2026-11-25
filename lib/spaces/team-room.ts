import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'
import { log } from '@/lib/log'
import { teamRoomName, teamRoomPlan } from './team-room-core'

// ONE TEAM ROOM PER SPACE (LIVE-2529). A Space's owner and active members share one room to talk in,
// beside their DMs. It is an ordinary members-only room (visibility 'private', RLS am_room_member),
// marked as the Space's by `rooms.scope_id = <space id>`: no new table and no new visibility, so
// every room surface (the dock, /messages, tagging, search) already knows how to show it.
//
// ensureSpaceTeamRoom makes the room when the Space has none and brings its members in line with
// the team: the owner is an admin, every active member is in, and anyone who left the team is out.
// Only this room is touched, never a room a member made. It runs on every team change
// (lib/spaces/membership.ts), which is also Space creation, since the owner is seated there; and on
// "Spaces you run" for a Space made before this existed. Best effort: a failure is logged and
// never blocks the change that called it.
//
// The caller hands in its own service-role client (lib/spaces/membership.ts, the one writer of the
// team): room rows are written under service role like every room action, and this module never
// creates a client, so it adds nothing to the admin-client ratchet.

export async function ensureSpaceTeamRoom(admin: SupabaseClient<Database>, spaceId: string): Promise<string | null> {
  try {
    const { data: space } = await admin.from('spaces').select('id, name, owner_profile_id').eq('id', spaceId).maybeSingle()
    if (!space?.owner_profile_id) return null

    const { data: existing } = await admin
      .from('rooms')
      .select('id')
      .eq('visibility', 'private')
      .eq('scope_id', spaceId)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()

    let roomId = existing?.id ?? null
    if (!roomId) {
      const { data: made, error } = await admin
        .from('rooms')
        .insert({
          name: teamRoomName(space.name),
          description: 'Your Space team talks here. Only the team is in it.',
          visibility: 'private',
          scope_id: spaceId,
          creator_id: space.owner_profile_id,
        })
        .select('id')
        .single()
      if (error || !made) {
        log.warn('spaces.team_room_create_failed', { space_id: spaceId, error: error?.message })
        return null
      }
      roomId = made.id
    }

    const [{ data: members }, { data: current }] = await Promise.all([
      admin.from('space_members').select('profile_id, role').eq('space_id', spaceId).eq('status', 'active'),
      admin.from('room_members').select('profile_id, is_admin').eq('room_id', roomId),
    ])
    const plan = teamRoomPlan({
      ownerId: space.owner_profile_id,
      team: (members ?? []).map((m) => ({ profileId: m.profile_id, admin: m.role === 'admin' })),
      current: (current ?? []).map((r) => ({ profileId: r.profile_id, admin: r.is_admin })),
    })
    if (plan.upsert.length > 0) {
      const { error } = await admin
        .from('room_members')
        .upsert(plan.upsert.map((m) => ({ room_id: roomId, profile_id: m.profileId, is_admin: m.admin })), { onConflict: 'room_id,profile_id' })
      if (error) log.warn('spaces.team_room_join_failed', { space_id: spaceId, error: error.message })
    }
    if (plan.remove.length > 0) {
      const { error } = await admin.from('room_members').delete().eq('room_id', roomId).in('profile_id', plan.remove)
      if (error) log.warn('spaces.team_room_leave_failed', { space_id: spaceId, error: error.message })
    }
    return roomId
  } catch (err) {
    log.warn('spaces.team_room_failed', { space_id: spaceId, error: err instanceof Error ? err.message : String(err) })
    return null
  }
}
