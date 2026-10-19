// REGULARS DISCOVERY, the pure half (LIVE-944, ADR-1783, docs/LOYALTY.md section 5). Ranks the Spaces
// running Regulars for one member and prints the one line each card shows. No Supabase, no Next:
// lib/loyalty/nearby.test.ts covers it. The reads live in ./discover.ts.

import { distanceKm } from '@/lib/distance'
import { formatRewardValue } from './program'

/** A Space running Regulars, as /rewards lists it. */
export interface NearbyRegular {
  spaceId: string
  slug: string
  name: string
  city: string | null
  /** Miles from the member's home, or null when either side has no coordinate. */
  distanceMiles: number | null
  rewardTitle: string
  rewardValueCents: number
  stampsRequired: number
}

/** A live hunt, as /rewards lists it. */
export interface LiveHunt {
  slug: string
  title: string
  hostName: string
  endsOn: string
  stopsTotal: number
  rewardTitle: string
}

interface RankInput {
  spaceId: string
  slug: string
  name: string
  city: string | null
  latitude: number | null
  longitude: number | null
  rewardTitle: string
  rewardValueCents: number
  stampsRequired: number
}

const KM_PER_MILE = 1.609344

/** The member's home, when their profile has one. */
export interface Home {
  lat: number | null
  lng: number | null
  city: string | null
}

/**
 * Order the Spaces running Regulars for one member: by distance from home when both sides have a
 * coordinate (Spaces with no pin last), else the member's own city first, then by name. Pure.
 */
export function rankNearby(spaces: RankInput[], home: Home, limit = 12): NearbyRegular[] {
  const hasHome = typeof home.lat === 'number' && typeof home.lng === 'number' && Number.isFinite(home.lat) && Number.isFinite(home.lng)
  const city = (home.city ?? '').trim().toLowerCase()
  const rows = spaces.map((s) => {
    const pinned = typeof s.latitude === 'number' && typeof s.longitude === 'number' && Number.isFinite(s.latitude) && Number.isFinite(s.longitude)
    const miles = hasHome && pinned ? distanceKm(home.lat as number, home.lng as number, s.latitude as number, s.longitude as number) / KM_PER_MILE : null
    return {
      row: {
        spaceId: s.spaceId,
        slug: s.slug,
        name: s.name,
        city: s.city,
        distanceMiles: miles === null ? null : Math.round(miles * 10) / 10,
        rewardTitle: s.rewardTitle,
        rewardValueCents: s.rewardValueCents,
        stampsRequired: s.stampsRequired,
      },
      sameCity: !!city && (s.city ?? '').trim().toLowerCase() === city,
    }
  })
  rows.sort((a, b) => {
    if (hasHome) {
      const da = a.row.distanceMiles ?? Number.POSITIVE_INFINITY
      const db = b.row.distanceMiles ?? Number.POSITIVE_INFINITY
      if (da !== db) return da - db
    } else if (a.sameCity !== b.sameCity) {
      return a.sameCity ? -1 : 1
    }
    return a.row.name.localeCompare(b.row.name)
  })
  return rows.slice(0, Math.max(0, limit)).map((r) => r.row)
}

/** "6 visits earn a free coffee ($6)". Pure. */
export function nearbyLine(r: Pick<NearbyRegular, 'stampsRequired' | 'rewardTitle' | 'rewardValueCents'>): string {
  const value = formatRewardValue(r.rewardValueCents)
  const visits = r.stampsRequired === 1 ? '1 visit earns' : `${r.stampsRequired} visits earn`
  return `${visits} ${r.rewardTitle || 'a reward'}${value ? ` (${value})` : ''}`
}

/** "0.4 mi", "12 mi", or null when there is no distance to print. Pure. */
export function distanceLabel(miles: number | null): string | null {
  if (miles === null || !Number.isFinite(miles) || miles < 0) return null
  if (miles < 10) return `${miles.toFixed(1)} mi`
  return `${Math.round(miles)} mi`
}

/** "Ends Nov 30" for a hunt's last day, read as a calendar date (no zone shift). Pure. */
export function endsLine(endsOn: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(endsOn)
  if (!m) return 'Ends soon'
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
  return `Ends ${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })}`
}
