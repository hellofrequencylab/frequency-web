import { cache } from 'react'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCallerProfile } from '@/lib/auth'
import type { ProximityBand, LocationBand, DiscoverableBy } from '@/lib/connections/location'

// Server reads for the connection layer (ADR-186). The new profile columns + the
// connection_settings singleton aren't in the generated DB types yet → untyped-client
// cast (repo convention). Platform settings are request-cached.

// ── Platform settings (admin-tuned) ──────────────────────────────────────────
export interface ConnectionSettings {
  directoryEnabled: boolean
  proximityEnabled: boolean
  mapsEnabled: boolean
  resonanceEnabled: boolean
  nearMissEnabled: boolean
  defaultLocationBand: LocationBand
  minDiscoveryRadiusM: number
  maxDiscoveryRadiusM: number
  rewardIntroduction: number
  rewardWelcome: number
}

export const CONNECTION_DEFAULTS: ConnectionSettings = {
  directoryEnabled: true,
  proximityEnabled: true,
  mapsEnabled: false,
  resonanceEnabled: false,
  nearMissEnabled: false,
  defaultLocationBand: 'city',
  minDiscoveryRadiusM: 1000,
  maxDiscoveryRadiusM: 200000,
  rewardIntroduction: 15,
  rewardWelcome: 5,
}

/** Platform connection-layer config (the admin-tuned singleton), with safe defaults. */
export const getConnectionSettings = cache(async (): Promise<ConnectionSettings> => {
  try {
    const db = createAdminClient()
    const { data } = await db.from('connection_settings').select('*').eq('id', true).maybeSingle()
    if (!data) return CONNECTION_DEFAULTS
    const r = data as Record<string, unknown>
    return {
      directoryEnabled: r.directory_enabled !== false,
      proximityEnabled: r.proximity_enabled !== false,
      mapsEnabled: !!r.maps_enabled,
      resonanceEnabled: !!r.resonance_enabled,
      nearMissEnabled: !!r.near_miss_enabled,
      defaultLocationBand: (r.default_location_band as LocationBand) ?? 'city',
      minDiscoveryRadiusM: Number(r.min_discovery_radius_m ?? 1000),
      maxDiscoveryRadiusM: Number(r.max_discovery_radius_m ?? 200000),
      rewardIntroduction: Number(r.reward_introduction ?? 15),
      rewardWelcome: Number(r.reward_welcome ?? 5),
    }
  } catch {
    return CONNECTION_DEFAULTS
  }
})

// ── Per-user preferences ─────────────────────────────────────────────────────
export interface MyConnectionPrefs {
  directoryVisible: boolean
  discoverableBy: DiscoverableBy
  locationBand: LocationBand
  discoveryRadiusM: number
  /** How far the member's FEED reaches (feed_radius_m), distinct from discoverability.
   *  The ripple widens this on its own when the area is sparse (ADR-416/417). */
  feedRadiusM: number
  ghostMode: boolean
  /** Whether the member has a home location set (without which proximity is inert). */
  hasHome: boolean
  /** Live location sharing is on (location_mode = 'live'). */
  liveMode: boolean
  /** When the live position was last refreshed, if any. */
  liveUpdatedAt: string | null
}

/** The caller's own connection/location preferences, or null if not signed in. */
export async function getMyConnectionPrefs(): Promise<MyConnectionPrefs | null> {
  const me = await getCallerProfile()
  if (!me) return null
  const db = createAdminClient()
  const { data } = await db
    .from('profiles')
    .select('directory_visible, discoverable_by, location_band, discovery_radius_m, feed_radius_m, ghost_mode, home_lat, location_mode, live_updated_at')
    .eq('id', me.id)
    .maybeSingle()
  const r = (data ?? {}) as Record<string, unknown>
  return {
    directoryVisible: r.directory_visible !== false,
    discoverableBy: (r.discoverable_by as DiscoverableBy) ?? 'community',
    locationBand: (r.location_band as LocationBand) ?? 'city',
    discoveryRadiusM: Number(r.discovery_radius_m ?? 40000),
    feedRadiusM: Number(r.feed_radius_m ?? 25000),
    ghostMode: !!r.ghost_mode,
    hasHome: r.home_lat != null,
    liveMode: r.location_mode === 'live',
    liveUpdatedAt: (r.live_updated_at as string | null) ?? null,
  }
}

// ── Proximity directory (privacy-safe) ───────────────────────────────────────
export interface NearbyMember {
  profileId: string
  displayName: string
  handle: string
  avatarUrl: string | null
  communityRole: string
  band: ProximityBand
}

/** Members near a point, ranked by fuzzed-cell distance, each with only a coarse band
 *  label — never coordinates or metres (members_near RPC, ADR-186). */
export async function membersNear(
  lat: number,
  lng: number,
  radiusM = 40000,
  limit = 60,
): Promise<NearbyMember[]> {
  const db = createAdminClient()
  const { data, error } = await db.rpc('members_near', {
    _lat: lat,
    _lng: lng,
    _radius_m: Math.round(radiusM),
    _limit: limit,
  })
  if (error || !Array.isArray(data)) return []
  return (data as Record<string, unknown>[]).map((r) => ({
    profileId: String(r.profile_id),
    displayName: String(r.display_name ?? ''),
    handle: String(r.handle ?? ''),
    avatarUrl: (r.avatar_url as string | null) ?? null,
    communityRole: String(r.community_role ?? 'member'),
    band: (r.band as ProximityBand) ?? 'unknown',
  }))
}
