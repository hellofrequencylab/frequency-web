// REGULARS DISCOVERY, the IO half (LIVE-944, ADR-1783). Two reads for /rewards: the Spaces running
// Regulars near the member, and the hunts live today. Both go through the service-role admin client
// (the loyalty tables are service-role only, scripts/table-grants.txt `internal`). Public rows only:
// a private Space never lists, and a draft hunt never lists. Reads FAIL-SAFE to [].

import { createAdminClient } from '@/lib/supabase/admin'
import { memberDay } from '@/lib/member-day'
import { loyaltyEnabled } from './store'
import { rankNearby, type LiveHunt, type NearbyRegular } from './nearby'

interface ProgramLite {
  space_id: string
  reward_title: string
  reward_value_cents: number
  stamps_required: number
}
interface SpaceLite {
  id: string
  slug: string
  name: string
  brand_name: string | null
  city: string | null
  latitude: number | null
  longitude: number | null
  visibility: string | null
}

/** The Spaces running Regulars, nearest to the member first. Up to `limit`. */
export async function listNearbyRegulars(profileId: string, limit = 12): Promise<NearbyRegular[]> {
  if (!loyaltyEnabled()) return []
  try {
    const db = createAdminClient()
    const [{ data: profile }, { data: programs }] = await Promise.all([
      db.from('profiles').select('home_lat, home_lng, city').eq('id', profileId).maybeSingle(),
      db.from('space_loyalty_programs').select('space_id, reward_title, reward_value_cents, stamps_required').eq('status', 'on').limit(500),
    ])
    const rows = (programs ?? []) as ProgramLite[]
    if (rows.length === 0) return []
    const { data: spaces } = await db
      .from('spaces')
      .select('id, slug, name, brand_name, city, latitude, longitude, visibility')
      .in('id', rows.map((p) => p.space_id))
    const bySpace = new Map(((spaces ?? []) as SpaceLite[]).filter((s) => s.visibility !== 'private').map((s) => [s.id, s]))
    const home = {
      lat: typeof profile?.home_lat === 'number' ? profile.home_lat : null,
      lng: typeof profile?.home_lng === 'number' ? profile.home_lng : null,
      city: typeof profile?.city === 'string' ? profile.city : null,
    }
    return rankNearby(
      rows.flatMap((p) => {
        const s = bySpace.get(p.space_id)
        if (!s) return []
        return [
          {
            spaceId: s.id,
            slug: s.slug,
            name: s.brand_name ?? s.name,
            city: s.city,
            latitude: typeof s.latitude === 'number' ? s.latitude : s.latitude === null ? null : Number(s.latitude),
            longitude: typeof s.longitude === 'number' ? s.longitude : s.longitude === null ? null : Number(s.longitude),
            rewardTitle: p.reward_title,
            rewardValueCents: p.reward_value_cents,
            stampsRequired: p.stamps_required,
          },
        ]
      }),
      home,
      limit,
    )
  } catch {
    return []
  }
}

/** The hunts live today (inside their window), soonest to end first. Up to `limit`. */
export async function listLiveHunts(limit = 6): Promise<LiveHunt[]> {
  if (!loyaltyEnabled()) return []
  try {
    const db = createAdminClient()
    const today = memberDay(null)
    const { data: hunts } = await db
      .from('loyalty_hunts')
      .select('id, slug, title, host_space_id, ends_on, reward_title')
      .eq('status', 'live')
      .lte('starts_on', today)
      .gte('ends_on', today)
      .order('ends_on', { ascending: true })
      .limit(Math.max(1, limit))
    const list = (hunts ?? []) as { id: string; slug: string; title: string; host_space_id: string; ends_on: string; reward_title: string }[]
    if (list.length === 0) return []
    const [{ data: stops }, { data: hosts }] = await Promise.all([
      db.from('loyalty_hunt_stops').select('hunt_id').in('hunt_id', list.map((h) => h.id)).eq('status', 'accepted'),
      db.from('spaces').select('id, name, brand_name').in('id', list.map((h) => h.host_space_id)),
    ])
    const stopCount = new Map<string, number>()
    for (const s of (stops ?? []) as { hunt_id: string }[]) stopCount.set(s.hunt_id, (stopCount.get(s.hunt_id) ?? 0) + 1)
    const hostName = new Map(((hosts ?? []) as { id: string; name: string; brand_name: string | null }[]).map((s) => [s.id, s.brand_name ?? s.name]))
    return list.map((h) => ({
      slug: h.slug,
      title: h.title,
      hostName: hostName.get(h.host_space_id) ?? 'A Space',
      endsOn: h.ends_on,
      stopsTotal: stopCount.get(h.id) ?? 0,
      rewardTitle: h.reward_title,
    }))
  } catch {
    return []
  }
}
