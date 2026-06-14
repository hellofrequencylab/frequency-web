import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { distanceKm } from '@/lib/distance'

// Event Dispatch audience resolver (ADR-255 / EVENTS-REWORK A2).
//
// The owner's rule: an Event Dispatch reaches the event's GUESTS + the hosting
// CIRCLE (these get a PUSH), plus the SURROUNDING AREA as a passive, resonance-
// gated FEED surface — "the feed of people close by who have resonance." So the
// PUSH fan-out (resolveEventDispatchAudience) is the union of:
//
//   1. Guests        — event_rsvps with status going/maybe/waitlist and muted=false
//                       (the per-event mute is honoured, ADR-255).
//   2. Hosting Circle — every active member of the event's Circle, when the event
//                       is Circle-scoped (scope_type='circle', scope_id=<circle>).
//
// The surrounding-area "bleed" is NOT pushed (pushing unsolicited to nearby
// strangers is spam). It surfaces in the FEED only, and only to nearby members who
// RESONATE with the host — viewerInEventDispatchArea (below) is the gate, called
// per feed render with the viewer's orbit. Each member's home radius decides "how
// local," and resonance decides "who," so proximity alone never surfaces an event.
//
// The push set is a fan-out audience (who gets a push), NOT a visibility grant: the
// downstream send-gate still applies each member's notification prefs, quiet hours
// and consent at drain time (lib/queue/handlers.ts → sendPushToProfile), and the
// feed read path re-checks event visibility so a private event never leaks.
//
// New columns/tables (events.geog, event_rsvps.muted) aren't in
// lib/database.types.ts yet, so this runs on the untyped admin client per the
// established `as unknown as SupabaseClient` cast convention.

function untyped(): SupabaseClient {
  return createAdminClient()
}

/** A GeoJSON-ish point as PostgREST serialises a PostGIS geography column. */
interface PointGeoJson {
  type?: string
  coordinates?: [number, number]
}

/** Pull (lng, lat) out of a serialised events.geog value; null when absent/malformed. */
function pointFromGeog(geog: unknown): { lat: number; lng: number } | null {
  const g = geog as PointGeoJson | null
  const coords = g?.coordinates
  if (!coords || coords.length < 2) return null
  const [lng, lat] = coords
  if (typeof lat !== 'number' || typeof lng !== 'number') return null
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  return { lat, lng }
}

/**
 * Resolve the deduplicated PUSH recipient set for an Event Dispatch fan-out:
 * guests (non-muted) ∪ hosting-Circle members. The surrounding-area bleed is NOT
 * here — it is a resonance-gated FEED surface (viewerInEventDispatchArea), never a
 * push, so this resolver only covers the people directly tied to the event.
 *
 * Best-effort and additive: a failure on either source returns what the other
 * produced rather than aborting the fan-out.
 */
export async function resolveEventDispatchAudience(
  eventId: string,
): Promise<string[]> {
  const admin = untyped()
  const audience = new Set<string>()

  // 1. Guests — going/maybe/waitlist, per-event mute honoured.
  try {
    const { data } = await admin
      .from('event_rsvps')
      .select('profile_id')
      .eq('event_id', eventId)
      .eq('muted', false)
      .in('status', ['going', 'maybe', 'waitlist'])
    for (const r of (data ?? []) as unknown as { profile_id: string }[]) {
      if (r.profile_id) audience.add(r.profile_id)
    }
  } catch {
    // skip this source; the rest of the audience still resolves
  }

  // 2. Hosting Circle — active members of the event's Circle (when Circle-scoped).
  let scopeType: string | null = null
  let scopeId: string | null = null
  try {
    const { data } = await admin
      .from('events')
      .select('scope_type, scope_id')
      .eq('id', eventId)
      .maybeSingle()
    const ev = (data ?? null) as { scope_type: string | null; scope_id: string | null } | null
    scopeType = ev?.scope_type ?? null
    scopeId = ev?.scope_id ?? null
  } catch {
    // no scope read — guests-only fan-out still proceeds
  }

  if (scopeType === 'circle' && scopeId) {
    try {
      const { data } = await admin
        .from('memberships')
        .select('profile_id')
        .eq('circle_id', scopeId)
        .eq('status', 'active')
      for (const m of (data ?? []) as { profile_id: string }[]) {
        if (m.profile_id) audience.add(m.profile_id)
      }
    } catch {
      // skip Circle members; guests still receive the Dispatch
    }
  }

  return [...audience]
}

/**
 * Does this viewer have a live, non-muted RSVP to the event? The "guest reach"
 * leg of the feed gate — a guest sees an Event Dispatch even outside their Circle
 * or radius. event_rsvps.muted is untyped, so this runs on the untyped handle.
 */
export async function viewerHasActiveRsvp(
  eventId: string,
  profileId: string,
): Promise<boolean> {
  const admin = untyped()
  const { data } = await admin
    .from('event_rsvps')
    .select('id')
    .eq('event_id', eventId)
    .eq('profile_id', profileId)
    .eq('muted', false)
    .in('status', ['going', 'maybe', 'waitlist'])
    .maybeSingle()
  return !!(data as { id: string } | null)
}

/** The event fields the feed gate needs (read once on the admin client). */
export interface EventDispatchTarget {
  id: string
  slug: string | null
  visibility: string | null
  scope_type: string | null
  scope_id: string | null
  host_id: string | null
  geog: unknown
}

/** The viewer context the feed gate needs (resolved once per feed render). */
export interface DispatchViewerContext {
  profileId: string | null
  circleIds: string[]
  regionId: string | null
  /** Member home + "how local" radius, when set (the geo-bleed reach). */
  home: { lat: number; lng: number; radiusM: number } | null
  /**
   * Profile IDs the viewer resonates with (their orbit, lib/connections/resonance).
   * The surrounding-area bleed surfaces an event in this viewer's feed only when the
   * event's host is in this set — "the feed of people close by who have resonance."
   */
  resonantHostIds: Set<string>
}

/**
 * Can this viewer READ the event? Mirrors the events "visibility-aware read" RLS /
 * can_read_event() (migration 20260625010000) so the feed — which fetches event
 * dispatches on the admin client (RLS bypassed) — never surfaces an event the
 * viewer couldn't see. Private events + drafts are host-only: a private event
 * never bleeds into the surrounding area.
 */
export function viewerCanReadEvent(
  event: EventDispatchTarget,
  viewer: DispatchViewerContext,
): boolean {
  const v = event.visibility ?? 'circle_only'
  if (v === 'public' || v === 'unlisted') return true
  if (viewer.profileId && event.host_id === viewer.profileId) return true
  if (v === 'circle_only') {
    if (event.scope_type === 'circle' && event.scope_id) {
      return viewer.circleIds.includes(event.scope_id)
    }
    if (event.scope_type === 'region' && event.scope_id) {
      return viewer.regionId != null && event.scope_id === viewer.regionId
    }
  }
  // private / draft / anything else → host-only (handled above).
  return false
}

/**
 * Should this Event Dispatch SURFACE in this viewer's feed? Leak-guarded: the
 * viewer must first be able to read the event, then be in its Dispatch audience —
 * the hosting Circle (for a Circle event) or the surrounding area (their home is
 * within their own feed radius of the event point). Public/unlisted events still
 * require the in-area / Circle reach so a public event across the country doesn't
 * blanket every member's feed; that's the "bleed into the surrounding area" rule.
 *
 * Guest membership (an explicit RSVP) is checked separately by the caller when it
 * already has the viewer's RSVP in hand; this predicate covers the Circle + geo
 * reach, which is what the feed reads without a per-viewer RSVP lookup.
 */
export function viewerInEventDispatchArea(
  event: EventDispatchTarget,
  viewer: DispatchViewerContext,
): boolean {
  if (!viewerCanReadEvent(event, viewer)) return false

  // The host always sees their own Dispatch.
  if (viewer.profileId && event.host_id === viewer.profileId) return true

  // Hosting-Circle member.
  if (event.scope_type === 'circle' && event.scope_id && viewer.circleIds.includes(event.scope_id)) {
    return true
  }

  // Surrounding-area bleed: a NEARBY member sees the Dispatch only when they also
  // RESONATE with the host (the host is in their orbit) — "the feed of people close
  // by who have resonance." Proximity alone never surfaces an event to a stranger.
  // Distance uses the member's OWN radius (their "how local" setting), so each
  // member controls how far events reach them; resonance decides who.
  const point = pointFromGeog(event.geog)
  if (point && viewer.home && event.host_id && viewer.resonantHostIds.has(event.host_id)) {
    const within = distanceKm(point.lat, point.lng, viewer.home.lat, viewer.home.lng)
    if (within <= viewer.home.radiusM / 1000) return true
  }

  return false
}
