import 'server-only'
import { createClient } from '@/lib/supabase/server'

// THE DOOR TO THE TEAM ROOM (SCAN-1350, clarity audit 2026-11-25). Every Space has one team room
// (LIVE-2529, lib/spaces/team-room.ts) but nothing on the calendar linked to it. Read on the session
// so RLS (am_room_member) decides: someone not in the room gets null and sees no door. Kept out of
// team-room.ts, which only ever takes the caller's service-role client.

export async function readSpaceTeamRoomHref(spaceId: string): Promise<string | null> {
  try {
    const { data } = await (await createClient())
      .from('rooms')
      .select('id')
      .eq('visibility', 'private')
      .eq('scope_id', spaceId)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()
    return data?.id ? `/messages/r/${data.id}` : null
  } catch {
    return null
  }
}
