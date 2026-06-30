// Keystone density store — the server seam that reads `resonance_density_cells` and
// turns the fuzzed-geocell rows into the keystone read models (Growth OS Engine 8,
// GE8-1). The cold-start solver reads two things through here:
//
//   • getDensityByCity()      — the ranked city list + summary for the admin density read.
//   • getLocalitySeedSignal() — a viewer's locality seed signal, for the founder-bootstrap
//     prompt (GE8-4): is this corner empty / seeding / warm / live?
//
// `resonance_density_cells` is service-role only (RLS, no client policy) and is not in
// the generated DB types until regen, so we read it through an untyped admin handle (the
// repo-wide service-role convention, ADR-246, see lib/funnels/store.ts). Server-only.
//
// PRIVACY: every read is keyed to the FUZZED geocell, counts only, never a raw coordinate
// or identity. The locality read centers on the viewer's own home_geocell (their fuzzed
// ~1.1km cell) and reads the cells in their city bucket; it never returns who is there.
//
// The shapes are presentation-neutral view-models (PAGE-FRAMEWORK contract note): the
// admin density dashboard, the founder prompt, and any future mobile surface read the
// same objects, no density logic trapped in React.

import { cache } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  type DensityCell,
  type CityDensity,
  type KeystoneDensitySummary,
  type SeedSignal,
  cityKey,
  rollupByCity,
  summarizeDensity,
  seedReadiness,
} from './density-rollup'

// Untyped admin handle — the funnels/applications convention (ADR-246). The
// SupabaseClient return annotation widens off the typed-table union without a cast.
function db(): SupabaseClient {
  return createAdminClient()
}

interface DensityCellRow {
  geocell_lat: number | string
  geocell_lng: number | string
  active_members: number | null
  recent_posts: number | null
  recent_events: number | null
  recent_circles: number | null
  density_score: number | null
}

function mapCell(r: DensityCellRow): DensityCell {
  return {
    geocellLat: Number(r.geocell_lat),
    geocellLng: Number(r.geocell_lng),
    activeMembers: Number(r.active_members ?? 0),
    recentPosts: Number(r.recent_posts ?? 0),
    recentEvents: Number(r.recent_events ?? 0),
    recentCircles: Number(r.recent_circles ?? 0),
    densityScore: Number(r.density_score ?? 0),
  }
}

// One indexed select pulls every rolled-up cell (the table holds one row per ACTIVE
// cell only, so this is small) and the pure rollup does the clustering. Fail-safe: any
// read error resolves to an empty world, so the admin/feed still renders.
async function readAllCells(): Promise<DensityCell[]> {
  try {
    const { data, error } = await db()
      .from('resonance_density_cells')
      .select('geocell_lat, geocell_lng, active_members, recent_posts, recent_events, recent_circles, density_score')
    if (error || !data) return []
    return (data as DensityCellRow[]).map(mapCell)
  } catch {
    return []
  }
}

export interface DensityByCity {
  cities: CityDensity[]
  summary: KeystoneDensitySummary
}

/**
 * The admin density-by-city read: every fuzzed cell clustered into ranked city buckets
 * plus the headline summary. Request-cached. Fail-safe (empty world on any error).
 */
export const getDensityByCity = cache(async (): Promise<DensityByCity> => {
  const cells = await readAllCells()
  const cities = rollupByCity(cells)
  return { cities, summary: summarizeDensity(cities) }
})

export interface LocalitySeedSignal {
  /** The viewer's fuzzed city bucket key, or null when they have no home location. */
  cityKey: string | null
  signal: SeedSignal
}

/**
 * The seed signal for a viewer's OWN locality — the cells in their city bucket rolled
 * into one 'empty' | 'seeding' | 'warm' | 'live'. Drives the founder-bootstrap prompt:
 * a would-be founder in an empty/seeding/warm corner sees the prompt; a live corner does
 * not. Keyed to the viewer's fuzzed home_geocell, never a raw coordinate.
 *
 * No location -> an 'empty' signal with a null cityKey (the caller decides whether to
 * nudge for location or prompt to found). Fail-safe.
 */
export const getLocalitySeedSignal = cache(
  async (viewerProfileId: string | null): Promise<LocalitySeedSignal> => {
    const fallback: LocalitySeedSignal = { cityKey: null, signal: seedReadiness([]) }
    if (!viewerProfileId) return fallback

    try {
      // home_geocell_* isn't in the generated types yet; db() is already the untyped
      // service-role handle (ADR-246), so the payload is typed below, not the client.
      const { data: profile } = await db()
        .from('profiles')
        .select('home_geocell_lat, home_geocell_lng')
        .eq('id', viewerProfileId)
        .maybeSingle()

      const p = (profile ?? null) as {
        home_geocell_lat: number | null
        home_geocell_lng: number | null
      } | null
      if (p?.home_geocell_lat == null || p?.home_geocell_lng == null) return fallback

      const key = cityKey(Number(p.home_geocell_lat), Number(p.home_geocell_lng))
      // The viewer's locality is every cell that coarsens to their city bucket.
      const cells = (await readAllCells()).filter((c) => cityKey(c.geocellLat, c.geocellLng) === key)
      return { cityKey: key, signal: seedReadiness(cells) }
    } catch {
      return fallback
    }
  },
)
