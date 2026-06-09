import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'

// Orbits & Resonance reads (ADR-186, P2). The my_orbit / near_misses RPCs are
// SECURITY DEFINER and identify the caller via auth.uid(), so they MUST be called
// with the authenticated server client (which carries the user's JWT) — NOT the
// service-role admin client (where auth.uid() is null). Resonance is private to the
// caller by construction.

export type Orbit = 'inner' | 'middle' | 'outer'

export interface OrbitMember {
  profileId: string
  displayName: string
  handle: string
  avatarUrl: string | null
  howMet: 'in_person' | 'online' | 'unknown'
  metAt: string | null
  sharedCircles: number
  coEvents: number
  lastTogether: string | null
  /** Private relationship strength (co-presence + recency). Never a public ranking. */
  resonance: number
  orbit: Orbit
}

/** The caller's connections, weighted by real co-presence — highest resonance first. */
export async function getMyOrbit(limit = 100): Promise<OrbitMember[]> {
  // my_orbit/near_misses aren't in the generated types yet → untyped cast (repo
  // convention), but still the AUTHED client so auth.uid() resolves to the caller.
  const supabase = (await createClient()) as unknown as SupabaseClient
  const { data, error } = await supabase.rpc('my_orbit', { _limit: limit })
  if (error || !Array.isArray(data)) return []
  return (data as Record<string, unknown>[]).map((r) => ({
    profileId: String(r.profile_id),
    displayName: String(r.display_name ?? ''),
    handle: String(r.handle ?? ''),
    avatarUrl: (r.avatar_url as string | null) ?? null,
    howMet: (r.how_met as OrbitMember['howMet']) ?? 'unknown',
    metAt: (r.met_at as string | null) ?? null,
    sharedCircles: Number(r.shared_circles ?? 0),
    coEvents: Number(r.co_events ?? 0),
    lastTogether: (r.last_together as string | null) ?? null,
    resonance: Number(r.resonance ?? 0),
    orbit: (r.orbit as Orbit) ?? 'outer',
  }))
}

export interface NearMiss {
  profileId: string
  displayName: string
  handle: string
  avatarUrl: string | null
  sharedCircles: number
  coEvents: number
  /** sharedCircles + coEvents — how often your paths have crossed unconnected. */
  overlap: number
}

/** People the caller keeps crossing paths with but hasn't connected to — the
 *  serendipity to close (respects discoverability tiers). */
export async function getNearMisses(limit = 20): Promise<NearMiss[]> {
  const supabase = (await createClient()) as unknown as SupabaseClient
  const { data, error } = await supabase.rpc('near_misses', { _limit: limit })
  if (error || !Array.isArray(data)) return []
  return (data as Record<string, unknown>[]).map((r) => ({
    profileId: String(r.profile_id),
    displayName: String(r.display_name ?? ''),
    handle: String(r.handle ?? ''),
    avatarUrl: (r.avatar_url as string | null) ?? null,
    sharedCircles: Number(r.shared_circles ?? 0),
    coEvents: Number(r.co_events ?? 0),
    overlap: Number(r.overlap ?? 0),
  }))
}

// Display helpers (pure) — shared by the Friends surface and the profile panel.
export const ORBIT_LABEL: Record<Orbit, string> = {
  inner: 'Inner orbit',
  middle: 'Middle orbit',
  outer: 'Outer orbit',
}

/** A gentle, non-creepy reason-to-reconnect line from the shared context. */
export function resonanceContext(m: Pick<OrbitMember, 'sharedCircles' | 'coEvents' | 'lastTogether'>): string {
  const bits: string[] = []
  if (m.sharedCircles > 0) bits.push(`${m.sharedCircles} shared circle${m.sharedCircles === 1 ? '' : 's'}`)
  if (m.coEvents > 0) bits.push(`${m.coEvents} event${m.coEvents === 1 ? '' : 's'} together`)
  return bits.join(' · ')
}
