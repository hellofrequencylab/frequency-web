import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'

// Event cohosts (slice B-2). A host can add/remove cohosts; cohosts are displayed
// on the event page. `isEventCohost` is the reusable gate other slices will wire
// into event capability checks later.
//
// event_cohosts isn't in the generated DB types yet (added by migration
// 20260613100000), so we read through the `as unknown as SupabaseClient` cast —
// the repo convention for not-yet-regenerated tables (see event_ticket_types).

export type Cohost = {
  id: string
  profileId: string
  displayName: string
  handle: string
  avatarUrl: string | null
}

/**
 * Is this profile a cohost of the event? Cheap existence check on the admin
 * client (bypasses RLS — this is a server-side authorization primitive, callers
 * pass the profile id they've already resolved). Returns false on any error so a
 * read failure never grants access.
 */
export async function isEventCohost(eventId: string, profileId: string): Promise<boolean> {
  if (!eventId || !profileId) return false
  const admin = createAdminClient()
  const { data } = await (admin as unknown as SupabaseClient)
    .from('event_cohosts')
    .select('id')
    .eq('event_id', eventId)
    .eq('profile_id', profileId)
    .maybeSingle()
  return !!data
}

/**
 * The cohosts displayed on an event page, oldest first. Joins the profile so the
 * UI can render a face + handle without a second query.
 */
export async function listCohosts(eventId: string): Promise<Cohost[]> {
  if (!eventId) return []
  const admin = createAdminClient()
  const { data } = await (admin as unknown as SupabaseClient)
    .from('event_cohosts')
    .select(
      'id, profile:profiles!profile_id ( id, display_name, handle, avatar_url )',
    )
    .eq('event_id', eventId)
    .order('created_at', { ascending: true })

  type Row = {
    id: string
    profile: { id: string; display_name: string; handle: string; avatar_url: string | null } | null
  }

  return ((data ?? []) as unknown as Row[])
    .filter((r) => r.profile != null)
    .map((r) => ({
      id: r.id,
      profileId: r.profile!.id,
      displayName: r.profile!.display_name,
      handle: r.profile!.handle,
      avatarUrl: r.profile!.avatar_url,
    }))
}
