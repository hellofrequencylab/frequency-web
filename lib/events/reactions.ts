'use server'

// Boops — persisted event-post reactions (EVENTS-REWORK B3 / ADR-255 interactive
// layer). A "Boop" is one member tapping one face on one event post. This is the
// data layer the activity feed rides: real counts only (Law: a number is real or
// it's absent), never a fabricated tally.
//
// Storage is the `event_post_reactions` table (migration
// 20260626000000_event_post_reactions.sql), keyed unique on (post, profile, kind)
// so a member's reaction toggles instead of stacking. The table is in the generated
// DB types (lib/database.types.ts) now, so reads/writes use the typed admin client.
//
// AUTHORIZATION: the admin client bypasses RLS, so every entry point re-checks
// server-side exactly like the post actions do — a member must be able to READ the
// parent event to see/aggregate its reactions, and must be on the event (host /
// cohost / guest) to add one. The DB migration encodes the same rules in RLS as the
// second line of defence.

import { createAdminClient } from '@/lib/supabase/admin'
import { getMyProfileId } from '@/lib/auth'
import { isEventCohost } from '@/lib/events/cohosts'

// The Partiful-style reaction set (EVENTS-DESIGN §2.2/§8). This is a `'use server'`
// module, so it can only EXPORT async functions (types are erased and fine). The
// runtime set therefore lives here as a private const and is mirrored by the BOOPS
// array the activity bar renders — keep the two in lockstep. Only these faces are
// accepted server-side. `BoopKind` is exported as a type for the UI to share.
const BOOP_KINDS = ['👋', '🔥', '🎉', '❤️', '😂'] as const
export type BoopKind = (typeof BOOP_KINDS)[number]

function isBoopKind(value: string): value is BoopKind {
  return (BOOP_KINDS as readonly string[]).includes(value)
}

/** Per-post reaction state for the activity feed: how many of each face, and which
 *  faces the viewer themselves booped. `counts` only carries kinds with at least one
 *  reaction (a zero is absent, not shown). */
export interface PostReactions {
  /** kind → count (only kinds with count > 0). */
  counts: Partial<Record<BoopKind, number>>
  /** The kinds the current viewer has booped on this post. */
  mine: BoopKind[]
}

interface ReactionRow {
  post_id: string
  kind: string
  profile_id: string
}

/** Resolve the event a post belongs to (its event_id), or null if the post is gone.
 *  Used to authorize against the parent event. */
async function postEventId(
  admin: ReturnType<typeof createAdminClient>,
  postId: string,
): Promise<string | null> {
  const { data } = await admin
    .from('event_posts')
    .select('event_id')
    .eq('id', postId)
    .maybeSingle()
  return data?.event_id ?? null
}

/** Is this profile the host or a guest (any RSVP intent) of the event? Mirrors the
 *  social-actions `isOnEvent` gate — only people attached to the event may boop. */
async function isOnEvent(
  admin: ReturnType<typeof createAdminClient>,
  eventId: string,
  profileId: string,
): Promise<boolean> {
  const { data: ev } = await admin
    .from('events')
    .select('host_id')
    .eq('id', eventId)
    .maybeSingle()
  if (!ev) return false
  if (ev.host_id === profileId) return true

  if (await isEventCohost(eventId, profileId)) return true

  const { data: rsvp } = await admin
    .from('event_rsvps')
    .select('status')
    .eq('event_id', eventId)
    .eq('profile_id', profileId)
    .maybeSingle()
  return !!rsvp && ['going', 'maybe', 'waitlist'].includes(rsvp.status ?? '')
}

/** Can the caller READ this event (and therefore its reactions)? Mirrors the
 *  can_read_event RLS rule via the visibility columns. SECURITY-equivalent check for
 *  the admin (RLS-bypassing) read path. */
async function canReadEvent(
  admin: ReturnType<typeof createAdminClient>,
  eventId: string,
  profileId: string | null,
): Promise<boolean> {
  const { data: event } = await admin
    .from('events')
    .select('visibility, host_id')
    .eq('id', eventId)
    .maybeSingle()
  if (!event) return false

  // Public + link-shared events are readable by anyone; the host always reads their
  // own. Anything more restrictive (circle_only / private) only surfaces on the
  // event page itself, where the page already gated the viewer — a viewer who is on
  // the event (host/cohost/guest) can always read it.
  if (event.visibility === 'public' || event.visibility === 'unlisted') return true
  if (profileId && event.host_id === profileId) return true
  if (profileId && (await isOnEvent(admin, eventId, profileId))) return true
  return false
}

/** Fold reaction rows into per-post {counts, mine} for the given viewer. */
// Post IDs that, used as an object key, would pollute the prototype chain. `postIds`
// reaches this from a `'use server'` action (caller-controlled), so never write one
// of these as a property name (CodeQL: remote property injection).
const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype'])

function aggregate(
  rows: ReactionRow[],
  postIds: string[],
  myProfileId: string | null,
): Record<string, PostReactions> {
  // Null-prototype map: a caller-supplied key can never reach Object.prototype, and
  // we still skip the reserved names explicitly as a second barrier.
  const out: Record<string, PostReactions> = Object.create(null)
  for (const id of postIds) {
    if (UNSAFE_KEYS.has(id)) continue
    out[id] = { counts: {}, mine: [] }
  }

  for (const row of rows) {
    if (!isBoopKind(row.kind)) continue
    const bucket = out[row.post_id]
    if (!bucket) continue
    bucket.counts[row.kind] = (bucket.counts[row.kind] ?? 0) + 1
    if (myProfileId && row.profile_id === myProfileId) bucket.mine.push(row.kind)
  }
  return out
}

/**
 * Load real reaction counts (+ the viewer's own booped kinds) for a set of posts in
 * one event. Returns an empty map for posts with no reactions. Authorized: the
 * caller must be able to read the parent event; otherwise an empty map comes back
 * (we never leak counts for an event the viewer can't see).
 */
export async function getEventPostReactions(
  eventId: string,
  postIds: string[],
): Promise<Record<string, PostReactions>> {
  const ids = Array.from(new Set(postIds.filter(Boolean)))
  if (ids.length === 0) return {}

  const admin = createAdminClient()
  const myProfileId = await getMyProfileId()

  if (!(await canReadEvent(admin, eventId, myProfileId))) {
    // Can't see the event → no counts. Still return a shaped (empty) map so the UI
    // renders the unbooped state without special-casing.
    return aggregate([], ids, myProfileId)
  }

  const { data } = await admin
    .from('event_post_reactions')
    .select('post_id, kind, profile_id')
    .in('post_id', ids)

  return aggregate(data ?? [], ids, myProfileId)
}

/** What a toggle did and the post's resulting reaction state. */
export interface ToggleResult {
  ok: boolean
  /** True when this call ADDED the reaction, false when it removed it. */
  added: boolean
  /** The post's reactions after the toggle (real counts + the viewer's kinds). */
  reactions: PostReactions
}

/**
 * Toggle the caller's reaction of `kind` on `postId`: add it if absent, remove it if
 * present. Self-authorized — only ever touches the caller's own (post, profile,
 * kind) row, and only when the caller is on the parent event. Returns the post's
 * fresh, real reaction state so the UI shows true numbers, never an optimistic guess.
 */
export async function toggleEventPostReaction(
  postId: string,
  kind: string,
): Promise<ToggleResult> {
  const empty: ToggleResult = { ok: false, added: false, reactions: { counts: {}, mine: [] } }

  const myProfileId = await getMyProfileId()
  if (!myProfileId) return empty
  if (!isBoopKind(kind)) return empty

  const admin = createAdminClient()
  const eventId = await postEventId(admin, postId)
  if (!eventId) return empty

  // Only someone on the event may boop (host / cohost / guest) — same gate as posting.
  if (!(await isOnEvent(admin, eventId, myProfileId))) return empty

  const db = createAdminClient()

  const { data: existing } = await db
    .from('event_post_reactions')
    .select('id')
    .eq('post_id', postId)
    .eq('profile_id', myProfileId)
    .eq('kind', kind)
    .maybeSingle()

  let added: boolean
  if (existing) {
    await db
      .from('event_post_reactions')
      .delete()
      .eq('post_id', postId)
      .eq('profile_id', myProfileId)
      .eq('kind', kind)
    added = false
  } else {
    // Unique (post, profile, kind) makes a double-tap idempotent — swallow a
    // duplicate that races in and treat it as "already added".
    const { error } = await db.from('event_post_reactions').insert({
      post_id: postId,
      profile_id: myProfileId,
      kind,
    })
    if (error && !/(duplicate|unique)/i.test(error.message)) {
      console.error('[toggleEventPostReaction]', error.message)
      return empty
    }
    added = true
  }

  const map = await getEventPostReactions(eventId, [postId])
  return { ok: true, added, reactions: map[postId] ?? { counts: {}, mine: [] } }
}
