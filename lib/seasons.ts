// Seasons: first-class season identity + lifecycle. The heavy lifting (mint
// trophies, convert zaps->gems, reset counters/streaks/challenges, advance to the
// next season) lives in the reset_season() RPC; this module reads the current
// season and exposes a typed way to end it. Server-only.
//
// The seasons table is new; until `supabase gen types` is re-run it is not in the
// generated Database types, so this module uses an untyped admin handle. Drop the
// cast after regen (see docs/START-HERE.md).

import { createAdminClient } from '@/lib/supabase/admin'
import type { SupabaseClient } from '@supabase/supabase-js'

export interface Season {
  id: string
  season_number: number
  name: string
  theme: string | null
  starts_at: string
  ends_at: string | null
  status: 'upcoming' | 'active' | 'ended'
}

function db(): SupabaseClient {
  return createAdminClient() as unknown as SupabaseClient
}

export async function getCurrentSeason(): Promise<Season | null> {
  const { data } = await db()
    .from('seasons')
    .select('id, season_number, name, theme, starts_at, ends_at, status')
    .eq('status', 'active')
    .maybeSingle()
  return (data as Season | null) ?? null
}

/**
 * End the current season now: mints trophies, converts zaps to gems (rank-based),
 * resets seasonal counters / streaks / challenges, and opens the next season.
 * Destructive and global; callers must gate to admin (janitor).
 */
export async function endSeasonNow(): Promise<void> {
  await db().rpc('reset_season')
}
