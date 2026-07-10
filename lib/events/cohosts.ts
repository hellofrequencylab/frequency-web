import { createAdminClient } from '@/lib/supabase/admin'

// Event cohosts (slice B-2, invite/accept lifecycle). A host INVITES a member to
// cohost; the invitee accepts or declines. Only ACCEPTED cohosts are displayed on
// the event page and count for host-capability checks. `isEventCohost` is the
// reusable gate other slices wire into event capability checks.
//
// event_cohosts is in the generated DB types (added by migration 20260613100000,
// the status/invited_at/responded_at columns by 20261110000000), so the admin
// client is used directly and these reads are fully typed.

export type Cohost = {
  id: string
  profileId: string
  displayName: string
  handle: string
  avatarUrl: string | null
}

// The row shape returned by the profile-join reads below.
type CohostJoinRow = {
  id: string
  profile: { id: string; display_name: string; handle: string; avatar_url: string | null } | null
}

function toCohosts(rows: CohostJoinRow[]): Cohost[] {
  return rows
    .filter((r) => r.profile != null)
    .map((r) => ({
      id: r.id,
      profileId: r.profile!.id,
      displayName: r.profile!.display_name,
      handle: r.profile!.handle,
      avatarUrl: r.profile!.avatar_url,
    }))
}

/**
 * Is this profile an ACCEPTED cohost of the event? Cheap existence check on the
 * admin client (bypasses RLS — this is a server-side authorization primitive,
 * callers pass the profile id they've already resolved). A pending ('invited') or
 * declined invite is NOT yet a cohost, so it never grants access. Returns false on
 * any error so a read failure never grants access.
 */
export async function isEventCohost(eventId: string, profileId: string): Promise<boolean> {
  if (!eventId || !profileId) return false
  const admin = createAdminClient()
  const { data } = await admin
    .from('event_cohosts')
    .select('id')
    .eq('event_id', eventId)
    .eq('profile_id', profileId)
    .eq('status', 'accepted')
    .maybeSingle()
  return !!data
}

/**
 * The cohosts displayed on an event page, oldest first — ACCEPTED only, so a
 * pending invite never shows publicly. Joins the profile so the UI can render a
 * face + handle without a second query.
 */
export async function listCohosts(eventId: string): Promise<Cohost[]> {
  if (!eventId) return []
  const admin = createAdminClient()
  const { data } = await admin
    .from('event_cohosts')
    .select(
      'id, profile:profiles!profile_id ( id, display_name, handle, avatar_url )',
    )
    .eq('event_id', eventId)
    .eq('status', 'accepted')
    .order('created_at', { ascending: true })

  return toCohosts((data ?? []) as unknown as CohostJoinRow[])
}

/**
 * The event's PENDING cohost invites (status 'invited'), newest first — for the
 * host's cohost manager, so they can see who they've invited and cancel one.
 * Joins the profile like listCohosts.
 */
export async function listCohostInvites(eventId: string): Promise<Cohost[]> {
  if (!eventId) return []
  const admin = createAdminClient()
  const { data } = await admin
    .from('event_cohosts')
    .select(
      'id, invited_at, profile:profiles!profile_id ( id, display_name, handle, avatar_url )',
    )
    .eq('event_id', eventId)
    .eq('status', 'invited')
    .order('invited_at', { ascending: false })

  return toCohosts((data ?? []) as unknown as CohostJoinRow[])
}

/**
 * The viewer's OWN pending cohost invite for this event (or null). Drives the
 * Accept/Decline banner on the event page. Only a still-pending ('invited') row
 * counts — an accepted or declined one is not an open invite.
 */
export async function getMyCohostInvite(
  eventId: string,
  profileId: string,
): Promise<{ id: string } | null> {
  if (!eventId || !profileId) return null
  const admin = createAdminClient()
  const { data } = await admin
    .from('event_cohosts')
    .select('id')
    .eq('event_id', eventId)
    .eq('profile_id', profileId)
    .eq('status', 'invited')
    .maybeSingle()
  return data ? { id: data.id } : null
}
