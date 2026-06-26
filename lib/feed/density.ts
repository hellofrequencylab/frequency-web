// Server seam for the adaptive-radius feed (Resonance Feed Phase 2, ADR-416). Reads
// the member's fuzzed geocell + the rolled-up density for it, then returns the
// local-activity STATE (no-location / founder / active) and the EFFECTIVE feed
// radius after the ripple. The pure decision math lives in lib/feed/ripple.ts; this
// only fetches the inputs. Request-cached, fail-safe.
//
// PRIVACY: keyed to the member's home_geocell (the fuzzed ~1.1km cell), never a raw
// coordinate. The density table is service-role only; this reads it via the admin
// client server-side and returns only coarse counts + a state.

import { cache } from 'react'
import { createAdminClient } from '@/lib/supabase/admin'
import { localActivityState, rippleRadiusM, type CellDensity, type LocalActivityState } from './ripple'

export interface LocalActivity {
  state: LocalActivityState
  density: CellDensity | null
  /** The member's chosen feed radius (meters). */
  baseRadiusM: number
  /** The radius after the ripple expansion (>= base; wider when the area is sparse). */
  effectiveRadiusM: number
}

const DEFAULT_RADIUS_M = 25000

/**
 * Resolve the member's local-activity state + adaptive radius. Reads their fuzzed
 * geocell + feed radius, then the density cell for it. Fail-safe: any read error
 * resolves to 'no-location' with the base radius, so the feed still renders.
 */
export const getLocalActivity = cache(async (viewerProfileId: string | null): Promise<LocalActivity> => {
  const fallback: LocalActivity = {
    state: 'no-location',
    density: null,
    baseRadiusM: DEFAULT_RADIUS_M,
    effectiveRadiusM: DEFAULT_RADIUS_M,
  }
  if (!viewerProfileId) return fallback

  try {
    // The profile's fuzzed cell + chosen radius. Untyped handle: home_geocell_* /
    // feed_radius_m aren't in the generated types yet (ADR-088/246 cast pattern).
    const admin = createAdminClient()
    const { data: profile } = await (admin as ReturnType<typeof createAdminClient>)
      .from('profiles')
      .select('home_geocell_lat, home_geocell_lng, feed_radius_m')
      .eq('id', viewerProfileId)
      .maybeSingle()

    const p = (profile ?? null) as {
      home_geocell_lat: number | null
      home_geocell_lng: number | null
      feed_radius_m: number | null
    } | null
    const baseRadiusM = p?.feed_radius_m ?? DEFAULT_RADIUS_M
    const hasLocation = p?.home_geocell_lat != null && p?.home_geocell_lng != null

    let density: CellDensity | null = null
    if (hasLocation) {
      // resonance_density_cells is reached untyped until the types regenerate (ADR-246).
      const cellDb = admin as unknown as {
        from: (t: string) => {
          select: (c: string) => {
            eq: (col: string, v: number) => {
              eq: (col: string, v: number) => {
                maybeSingle: () => Promise<{ data: Record<string, number> | null }>
              }
            }
          }
        }
      }
      const { data: cell } = await cellDb
        .from('resonance_density_cells')
        .select('active_members, recent_posts, recent_events, recent_circles, density_score')
        .eq('geocell_lat', Number(p!.home_geocell_lat))
        .eq('geocell_lng', Number(p!.home_geocell_lng))
        .maybeSingle()
      if (cell) {
        density = {
          activeMembers: Number(cell.active_members ?? 0),
          recentPosts: Number(cell.recent_posts ?? 0),
          recentEvents: Number(cell.recent_events ?? 0),
          recentCircles: Number(cell.recent_circles ?? 0),
          densityScore: Number(cell.density_score ?? 0),
        }
      }
    }

    const state = localActivityState(hasLocation, density)
    return {
      state,
      density,
      baseRadiusM,
      effectiveRadiusM: hasLocation ? rippleRadiusM(baseRadiusM, density) : baseRadiusM,
    }
  } catch {
    return fallback
  }
})
