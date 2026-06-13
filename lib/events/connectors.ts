// Connector suggestions (Events B-4: discovery polish).
//
// "People going to this who share your Channels and aren't connected to you yet."
// The honest, non-creepy version of social proof: we surface a stranger ONLY when
// there is genuine common ground (a shared Channel they both tune in to) and a
// real reason to meet (both going to the same upcoming event). No cold ranking,
// no people-as-points — the shared Channel IS the reason, and we say it plainly.
//
// Reads, all through the service-role admin client (server-only):
//   • event_rsvps          — who's 'going' to the candidate event(s)
//   • topical_channel_memberships — the viewer's Channels ∩ each candidate's
//   • friendships          — exclude anyone already connected (or pending)
//   • profiles             — safe display shape; honor ghost_mode
//
// Degrades gracefully: a missing signal drops a candidate, never throws. Returns
// [] for signed-out viewers or when nothing clears the shared-Channel bar.

import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'

export interface ConnectorSuggestion {
  profileId: string
  displayName: string
  handle: string
  avatarUrl: string | null
  /** The event (slug) that gives a reason to meet — for the "going to X" line. */
  eventId: string
  /** Channels you both tune in to (names). The reason to connect, said plainly. */
  sharedChannels: string[]
}

function db(): SupabaseClient {
  return createAdminClient()
}

/**
 * Suggest fellow attendees worth meeting across one or more events.
 *
 * @param viewerProfileId the signed-in viewer (profiles.id).
 * @param eventIds        candidate events (e.g. the "For You" lane, or one event).
 * @param limit           max suggestions to return (default 6).
 * @returns up to `limit` strangers going to a candidate event with whom the
 *          viewer shares at least one Channel, never already-connected people.
 */
export async function suggestConnectorsForEvents(
  viewerProfileId: string,
  eventIds: string[],
  limit = 6,
): Promise<ConnectorSuggestion[]> {
  if (!viewerProfileId || eventIds.length === 0) return []
  const client = db()

  // ── The viewer's Channels (the shared-interest bar) ────────────────────────
  const { data: myChannelRows } = await client
    .from('topical_channel_memberships')
    .select('topical_channel_id')
    .eq('profile_id', viewerProfileId)
  const myChannelIds = new Set(
    ((myChannelRows ?? []) as { topical_channel_id: string }[]).map((r) => r.topical_channel_id),
  )
  // No Channels tuned in → no shared ground to honestly claim. Show nothing.
  if (myChannelIds.size === 0) return []

  // ── Who's going to the candidate events (excluding the viewer) ─────────────
  const { data: goingRows } = await client
    .from('event_rsvps')
    .select('event_id, profile_id')
    .in('event_id', eventIds)
    .eq('status', 'going')
  const going = ((goingRows ?? []) as { event_id: string; profile_id: string }[]).filter(
    (r) => r.profile_id !== viewerProfileId,
  )
  if (going.length === 0) return []

  // First event we see each attendee going to = the reason-to-meet anchor.
  const attendeeEvent = new Map<string, string>()
  for (const r of going) {
    if (!attendeeEvent.has(r.profile_id)) attendeeEvent.set(r.profile_id, r.event_id)
  }
  const attendeeIds = [...attendeeEvent.keys()]

  // ── Exclude anyone already connected (accepted OR pending — don't re-suggest
  //    someone there's already a thread with). ────────────────────────────────
  const { data: friendRows } = await client
    .from('friendships')
    .select('user_a_id, user_b_id, status')
    .in('status', ['accepted', 'pending'])
    .or(`user_a_id.eq.${viewerProfileId},user_b_id.eq.${viewerProfileId}`)
  const connectedIds = new Set<string>()
  for (const f of (friendRows ?? []) as { user_a_id: string; user_b_id: string }[]) {
    connectedIds.add(f.user_a_id === viewerProfileId ? f.user_b_id : f.user_a_id)
  }

  const candidateIds = attendeeIds.filter((id) => !connectedIds.has(id))
  if (candidateIds.length === 0) return []

  // ── Shared Channels per candidate (the actual bar + the displayed reason) ──
  const { data: candChannelRows } = await client
    .from('topical_channel_memberships')
    .select('profile_id, topical_channel_id')
    .in('profile_id', candidateIds)
  const sharedByProfile = new Map<string, Set<string>>()
  for (const r of (candChannelRows ?? []) as { profile_id: string; topical_channel_id: string }[]) {
    if (!myChannelIds.has(r.topical_channel_id)) continue
    const set = sharedByProfile.get(r.profile_id) ?? new Set<string>()
    set.add(r.topical_channel_id)
    sharedByProfile.set(r.profile_id, set)
  }
  // Keep only candidates that actually share a Channel.
  const qualified = candidateIds.filter((id) => (sharedByProfile.get(id)?.size ?? 0) > 0)
  if (qualified.length === 0) return []

  // ── Resolve display shapes + Channel names; honor ghost_mode ───────────────
  const sharedChannelIds = [
    ...new Set(qualified.flatMap((id) => [...(sharedByProfile.get(id) ?? [])])),
  ]
  const [{ data: profileRows }, { data: channelRows }] = await Promise.all([
    client
      .from('profiles')
      .select('id, display_name, handle, avatar_url, ghost_mode')
      .in('id', qualified),
    client
      .from('topical_channels')
      .select('id, name')
      .in('id', sharedChannelIds),
  ])

  const channelName = new Map<string, string>()
  for (const c of (channelRows ?? []) as { id: string; name: string }[]) channelName.set(c.id, c.name)

  type ProfRow = {
    id: string
    display_name: string
    handle: string
    avatar_url: string | null
    ghost_mode: boolean | null
  }

  const suggestions: ConnectorSuggestion[] = []
  for (const p of (profileRows ?? []) as ProfRow[]) {
    if (p.ghost_mode) continue // a member who's gone quiet isn't surfaced as a suggestion
    const shared = [...(sharedByProfile.get(p.id) ?? [])]
      .map((cid) => channelName.get(cid))
      .filter((n): n is string => !!n)
    if (shared.length === 0) continue
    suggestions.push({
      profileId: p.id,
      displayName: p.display_name,
      handle: p.handle,
      avatarUrl: p.avatar_url,
      eventId: attendeeEvent.get(p.id)!,
      sharedChannels: shared,
    })
  }

  // Most shared Channels first — the strongest common ground leads.
  suggestions.sort((a, b) => b.sharedChannels.length - a.sharedChannels.length)
  return suggestions.slice(0, Math.max(0, limit))
}
