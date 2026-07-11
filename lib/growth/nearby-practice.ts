// "A FEW PEOPLE NEAR YOU ARE INTO THIS" — the near-you ignition signal behind the
// second host prompt. Given a member, it answers one cheap question: is there a
// Practice that this member logs AND that ~2-3 OTHER members in their own metro log
// too? If so, that shared interest is the opening to start a Circle. Server-only.
//
// It reuses the existing locality model (keystone geo, ADR-088: profiles.home_geocell_*
// fuzzed to a city bucket via cityKey) and the existing Practice-adoption table
// (member_practices: one active row per member/practice). No new adoption data is
// invented.
//
// CHEAP BY DESIGN: at most four bounded reads — my cell, my practices, my neighbours
// (one indexed bounding-box query over profiles.home_geocell_*, exact-matched to my
// city bucket in memory), and the neighbours' logs for MY practices. Fail-safe: any
// error resolves to null (no signal), so the feed never breaks. The geocell columns
// are not in the generated types yet, so this reaches them with untyped casts (ADR-246).

import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { cityKey, CITY_GRID_DECIMALS } from '@/lib/keystone/density-rollup'

function db(): SupabaseClient {
  return createAdminClient()
}

export interface NearbyPracticeSignal {
  practiceId: string
  /** The Practice title, for the prompt copy (falls back to a generic phrase). */
  practiceLabel: string
  /** How many OTHER members in the metro log this Practice (>= NEARBY_MIN). */
  count: number
}

/** "A few" = at least this many OTHER members sharing the interest. Two neighbours plus
 *  the member is the smallest cluster worth gathering. */
const NEARBY_MIN = 2

/** Half a city-grid cell — a value rounds to key K (at CITY_GRID_DECIMALS decimals) iff
 *  it sits within +/- this of K. So [K - HALF_CELL, K + HALF_CELL) is the EXACT bounding
 *  box for "shares my city bucket", which lets one range query do the coarse filter. */
const HALF_CELL = 0.5 * Math.pow(10, -CITY_GRID_DECIMALS)

/** Cap the neighbour set so the follow-up `in(...)` stays small even in a dense metro. */
const MAX_NEIGHBOURS = 300

/**
 * The strongest shared Practice between a member and their metro neighbours, or null
 * when there is no home location, no logged Practice, too few neighbours, or no overlap.
 */
export async function nearbyPracticeSignal(profileId: string): Promise<NearbyPracticeSignal | null> {
  try {
    const client = db()

    // 1. My fuzzed home cell. No location -> no near-you signal.
    const { data: meRow } = await client
      .from('profiles')
      .select('home_geocell_lat, home_geocell_lng')
      .eq('id', profileId)
      .maybeSingle()
    const me = (meRow ?? null) as { home_geocell_lat: number | null; home_geocell_lng: number | null } | null
    if (me?.home_geocell_lat == null || me?.home_geocell_lng == null) return null
    const myKey = cityKey(Number(me.home_geocell_lat), Number(me.home_geocell_lng))
    const [keyLat, keyLng] = myKey.split(',').map(Number)

    // 2. The Practices I have adopted — my interests. member_practices holds one active
    //    row per member/practice (index on (profile_id, active)), so this is one cheap read.
    const { data: myAdoptRows } = await client
      .from('member_practices')
      .select('practice_id')
      .eq('profile_id', profileId)
      .eq('active', true)
      .limit(500)
    const myPractices = [
      ...new Set(
        ((myAdoptRows ?? []) as { practice_id: string | null }[])
          .map((r) => r.practice_id)
          .filter((id): id is string => !!id),
      ),
    ]
    if (myPractices.length === 0) return null

    // 3. Neighbours: members whose fuzzed cell rounds to MY city bucket. One bounded box
    //    query (indexed on the geocell columns), then an exact cityKey match in memory.
    const { data: nearRows } = await client
      .from('profiles')
      .select('id, home_geocell_lat, home_geocell_lng')
      .neq('id', profileId)
      .gte('home_geocell_lat', keyLat - HALF_CELL)
      .lt('home_geocell_lat', keyLat + HALF_CELL)
      .gte('home_geocell_lng', keyLng - HALF_CELL)
      .lt('home_geocell_lng', keyLng + HALF_CELL)
      .limit(1000)
    const neighbours = ((nearRows ?? []) as { id: string; home_geocell_lat: number | null; home_geocell_lng: number | null }[])
      .filter(
        (p) =>
          p.home_geocell_lat != null &&
          p.home_geocell_lng != null &&
          cityKey(Number(p.home_geocell_lat), Number(p.home_geocell_lng)) === myKey,
      )
      .map((p) => p.id)
      .slice(0, MAX_NEIGHBOURS)
    if (neighbours.length < NEARBY_MIN) return null

    // 4. Which of MY Practices have those neighbours adopted too? Count DISTINCT members
    //    per Practice, and take the most-shared one.
    const { data: sharedRows } = await client
      .from('member_practices')
      .select('profile_id, practice_id')
      .eq('active', true)
      .in('practice_id', myPractices)
      .in('profile_id', neighbours)
    const byPractice = new Map<string, Set<string>>()
    for (const row of (sharedRows ?? []) as { profile_id: string; practice_id: string | null }[]) {
      if (!row.practice_id) continue
      const set = byPractice.get(row.practice_id) ?? new Set<string>()
      set.add(row.profile_id)
      byPractice.set(row.practice_id, set)
    }
    let best: { practiceId: string; count: number } | null = null
    for (const [practiceId, members] of byPractice) {
      if (members.size >= NEARBY_MIN && (!best || members.size > best.count)) {
        best = { practiceId, count: members.size }
      }
    }
    if (!best) return null

    // 5. Name the Practice for the copy.
    const { data: pRow } = await client
      .from('practices')
      .select('title')
      .eq('id', best.practiceId)
      .maybeSingle()
    const label = ((pRow as { title?: string | null } | null)?.title ?? '').trim() || 'this practice'

    return { practiceId: best.practiceId, practiceLabel: label, count: best.count }
  } catch {
    return null
  }
}
