// Event matching engine — the hybrid "For You" score (docs/EVENTS-SYSTEM.md §3).
//
//   score = α·interest + β·social + γ·context
//
//   • interest — cosine(viewer profiles.embedding, event_embeddings.embedding),
//                the semantic "this is your kind of thing" signal.
//   • social   — weighted count of the viewer's circle-mates + accepted
//                connections who are 'going' ("people you know are going").
//   • context  — proximity (lib/distance.ts, viewer home → host-circle location)
//                × time-decay (sooner = better, never past).
//
// Server-only (admin client). event_embeddings / profiles.embedding aren't in the
// generated DB types → untyped cast (repo convention, see lib/ai/room-search.ts).
// Pure, bounded work over a capped candidate set; degrades gracefully — a missing
// signal contributes 0, never an error, so the caller can always rank what it has.

import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { distanceKm } from '@/lib/distance'

// ── Hybrid weights (exported so the UI/tests can reason about the blend) ───────
export const INTEREST_WEIGHT = 0.45 // α — semantic interest match
export const SOCIAL_WEIGHT = 0.35 // β — who-you-know-is-going
export const CONTEXT_WEIGHT = 0.2 // γ — proximity × time

// How much a circle-mate vs an accepted connection counts toward the social
// signal. Connections (explicit ties) weigh more than co-membership.
const CIRCLEMATE_WEIGHT = 1
const CONNECTION_WEIGHT = 2
// The social signal saturates: knowing 3+ people going is already "very social".
const SOCIAL_SATURATION = 3
// Proximity falloff: within ~5 km is essentially "here"; ~25 km ≈ half.
const PROXIMITY_HALFLIFE_KM = 25
// Time-decay: an event ~14 days out is half as urgent as one happening now.
const TIME_HALFLIFE_DAYS = 14

export interface ScoredEvent {
  eventId: string
  score: number
  interest: number
  social: number
  context: number
}

function db(): SupabaseClient {
  return createAdminClient()
}

/** pgvector comes back over PostgREST as a "[a,b,c]" string. Tolerant parse. */
function parseVector(raw: unknown): number[] | null {
  if (Array.isArray(raw)) return raw as number[]
  if (typeof raw !== 'string') return null
  try {
    const v = JSON.parse(raw)
    return Array.isArray(v) ? (v as number[]) : null
  } catch {
    return null
  }
}

/** Cosine similarity mapped to [0,1] ((cos+1)/2). 0.5 = orthogonal. */
function cosineSim01(a: number[], b: number[]): number {
  if (a.length === 0 || a.length !== b.length) return 0
  let dot = 0
  let na = 0
  let nb = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    na += a[i] * a[i]
    nb += b[i] * b[i]
  }
  if (na === 0 || nb === 0) return 0
  const cos = dot / (Math.sqrt(na) * Math.sqrt(nb))
  return Math.max(0, Math.min(1, (cos + 1) / 2))
}

type EventRow = {
  id: string
  starts_at: string
  scope_id: string
  scope_type: string
  is_cancelled: boolean
}

/**
 * Rank events for one viewer by the hybrid interest+social+context score.
 *
 * @param profileId  the viewer (profiles.id).
 * @param eventIds   optional candidate set; when omitted, defaults to upcoming,
 *                   non-cancelled events in the viewer's active circles (the same
 *                   scope the /events Index already shows).
 * @returns events ranked by score desc. Empty when there are no candidates.
 */
export async function scoreEventsForViewer(
  profileId: string,
  eventIds?: string[],
): Promise<ScoredEvent[]> {
  const client = db()
  const now = Date.now()
  const nowIso = new Date(now).toISOString()

  // ── Candidate events ─────────────────────────────────────────────────────
  let events: EventRow[] = []
  if (eventIds && eventIds.length > 0) {
    const { data } = await client
      .from('events')
      .select('id, starts_at, scope_id, scope_type, is_cancelled')
      .in('id', eventIds)
      .eq('is_cancelled', false)
      .gte('starts_at', nowIso)
    events = (data ?? []) as EventRow[]
  } else {
    // Default scope: upcoming events in the viewer's active circles.
    const { data: memberships } = await client
      .from('memberships')
      .select('circle_id')
      .eq('profile_id', profileId)
      .eq('status', 'active')
    const circleIds = ((memberships ?? []) as { circle_id: string }[]).map((m) => m.circle_id)
    if (circleIds.length === 0) return []
    const { data } = await client
      .from('events')
      .select('id, starts_at, scope_id, scope_type, is_cancelled')
      .in('scope_id', circleIds)
      .eq('is_cancelled', false)
      .gte('starts_at', nowIso)
      .order('starts_at', { ascending: true })
      .limit(60)
    events = (data ?? []) as EventRow[]
  }
  if (events.length === 0) return []

  const ids = events.map((e) => e.id)

  // ── interest: viewer embedding × event embeddings ──────────────────────────
  const [{ data: meRow }, { data: embRows }] = await Promise.all([
    client.from('profiles').select('embedding, home_lat, home_lng').eq('id', profileId).maybeSingle(),
    client.from('event_embeddings').select('event_id, embedding').in('event_id', ids),
  ])
  const viewerVec = parseVector((meRow as { embedding?: unknown } | null)?.embedding)
  const eventVec: Record<string, number[]> = {}
  for (const r of (embRows ?? []) as { event_id: string; embedding: unknown }[]) {
    const v = parseVector(r.embedding)
    if (v) eventVec[r.event_id] = v
  }

  // ── social: circle-mates + connections who are 'going' ─────────────────────
  // Build the viewer's "people I know" set, then count how many are going to each.
  const [{ data: myMemberships }, { data: friendships }] = await Promise.all([
    client.from('memberships').select('circle_id').eq('profile_id', profileId).eq('status', 'active'),
    client
      .from('friendships')
      .select('user_a_id, user_b_id')
      .eq('status', 'accepted')
      .or(`user_a_id.eq.${profileId},user_b_id.eq.${profileId}`),
  ])
  const myCircleIds = ((myMemberships ?? []) as { circle_id: string }[]).map((m) => m.circle_id)

  const connectionIds = new Set<string>()
  for (const f of (friendships ?? []) as { user_a_id: string; user_b_id: string }[]) {
    connectionIds.add(f.user_a_id === profileId ? f.user_b_id : f.user_a_id)
  }

  const circleMateIds = new Set<string>()
  if (myCircleIds.length > 0) {
    const { data: mates } = await client
      .from('memberships')
      .select('profile_id')
      .in('circle_id', myCircleIds)
      .eq('status', 'active')
    for (const m of (mates ?? []) as { profile_id: string }[]) {
      if (m.profile_id !== profileId) circleMateIds.add(m.profile_id)
    }
  }

  // Weight per known person: a connection outranks a plain circle-mate.
  const knownWeight = new Map<string, number>()
  for (const id of circleMateIds) knownWeight.set(id, CIRCLEMATE_WEIGHT)
  for (const id of connectionIds) knownWeight.set(id, CONNECTION_WEIGHT) // overrides upward

  const socialRaw: Record<string, number> = {}
  if (knownWeight.size > 0) {
    const { data: going } = await client
      .from('event_rsvps')
      .select('event_id, profile_id')
      .in('event_id', ids)
      .eq('status', 'going')
      .in('profile_id', [...knownWeight.keys()])
    for (const r of (going ?? []) as { event_id: string; profile_id: string }[]) {
      socialRaw[r.event_id] = (socialRaw[r.event_id] ?? 0) + (knownWeight.get(r.profile_id) ?? 0)
    }
  }

  // ── context: proximity (host-circle location) × time-decay ─────────────────
  const home = meRow as { home_lat?: number | null; home_lng?: number | null } | null
  const homeLat = home?.home_lat != null ? Number(home.home_lat) : null
  const homeLng = home?.home_lng != null ? Number(home.home_lng) : null

  const circleScopeIds = [
    ...new Set(events.filter((e) => e.scope_type === 'circle').map((e) => e.scope_id)),
  ]
  const circleCoords: Record<string, { lat: number | null; lng: number | null }> = {}
  if (circleScopeIds.length > 0) {
    const { data: circles } = await client
      .from('circles')
      .select('id, latitude, longitude')
      .in('id', circleScopeIds)
    for (const c of (circles ?? []) as { id: string; latitude: number | null; longitude: number | null }[]) {
      circleCoords[c.id] = { lat: c.latitude != null ? Number(c.latitude) : null, lng: c.longitude != null ? Number(c.longitude) : null }
    }
  }

  // ── Compose ────────────────────────────────────────────────────────────────
  const scored: ScoredEvent[] = events.map((e) => {
    // interest: 0 when we can't compare (missing either embedding).
    const ev = eventVec[e.id]
    const interest = viewerVec && ev ? cosineSim01(viewerVec, ev) : 0

    // social: saturating — knowing SOCIAL_SATURATION weighted people ≈ 1.
    const social = Math.min(1, (socialRaw[e.id] ?? 0) / SOCIAL_SATURATION)

    // context: time-decay always available; proximity only when both points known.
    const daysOut = Math.max(0, (new Date(e.starts_at).getTime() - now) / (24 * 60 * 60 * 1000))
    const time = Math.pow(0.5, daysOut / TIME_HALFLIFE_DAYS) // 1 now → 0.5 at half-life

    const coords = e.scope_type === 'circle' ? circleCoords[e.scope_id] : undefined
    let proximity = 0.5 // neutral when we don't know where either side is
    if (homeLat != null && homeLng != null && coords?.lat != null && coords?.lng != null) {
      const km = distanceKm(homeLat, homeLng, coords.lat, coords.lng)
      proximity = Math.pow(0.5, km / PROXIMITY_HALFLIFE_KM) // 1 at 0 km → 0.5 at half-life
    }
    const context = proximity * time

    const score =
      INTEREST_WEIGHT * interest + SOCIAL_WEIGHT * social + CONTEXT_WEIGHT * context
    return { eventId: e.id, score, interest, social, context }
  })

  scored.sort((a, b) => b.score - a.score)
  return scored
}
