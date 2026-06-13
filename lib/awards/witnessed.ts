// Witnessed awards — peer-granted (Rewards Economy v2, Season 1).
//
// Two awards, both quiet "give" actions (never a prompt), displayed with the
// granted-by name:
//   carried_the_room — grantable only by a circle HOST, to a member of one of
//                      their circles, once per season per Host
//   strong_signal    — any member, once per season, to any member (not self)
//
// The witnessed_grants UNIQUE (season, award_slug, granted_by) is the once-per-
// season rule; this module owns the who-may-grant authz. Server-only.

import { createAdminClient } from '@/lib/supabase/admin'
import type { SupabaseClient } from '@supabase/supabase-js'

function db(): SupabaseClient {
  return createAdminClient()
}

export type WitnessedSlug = 'carried_the_room' | 'strong_signal'

export const WITNESSED_AWARDS: Record<WitnessedSlug, { label: string; description: string }> = {
  carried_the_room: {
    label: 'Carried the Room',
    description: 'Given by a circle Host to the member who held it together.',
  },
  strong_signal: {
    label: 'Strong Signal',
    description: 'Given member to member. One per season — make it count.',
  },
}

export interface WitnessedGrantResult {
  ok: boolean
  reason?: 'self' | 'not_host' | 'not_in_circle' | 'already_granted' | 'no_season' | 'error'
}

async function activeSeason(admin: SupabaseClient): Promise<number | null> {
  const { data } = await admin
    .from('seasons')
    .select('season_number')
    .eq('status', 'active')
    .limit(1)
    .maybeSingle()
  return (data as { season_number: number } | null)?.season_number ?? null
}

/**
 * Grant a witnessed award. Authz here; once-per-season-per-granter is the DB
 * unique. carried_the_room additionally requires the granter to host a circle
 * the recipient is an active member of.
 */
export async function grantWitnessedAward(
  granterId: string,
  recipientId: string,
  slug: WitnessedSlug,
): Promise<WitnessedGrantResult> {
  if (granterId === recipientId) return { ok: false, reason: 'self' }
  const admin = db()

  const season = await activeSeason(admin)
  if (season == null) return { ok: false, reason: 'no_season' }

  if (slug === 'carried_the_room') {
    // Granter must HOST a circle; recipient must be an active member of it.
    const { data: hosted } = await admin
      .from('memberships')
      .select('circle_id')
      .eq('profile_id', granterId)
      .eq('status', 'active')
      .eq('volunteer_role', 'host')
    const hostedIds = ((hosted ?? []) as { circle_id: string }[]).map((m) => m.circle_id)
    if (hostedIds.length === 0) return { ok: false, reason: 'not_host' }

    const { data: shared } = await admin
      .from('memberships')
      .select('circle_id')
      .eq('profile_id', recipientId)
      .eq('status', 'active')
      .in('circle_id', hostedIds)
      .limit(1)
      .maybeSingle()
    if (!shared) return { ok: false, reason: 'not_in_circle' }
  }

  const { error } = await admin.from('witnessed_grants').insert({
    season,
    award_slug: slug,
    granted_by: granterId,
    granted_to: recipientId,
  })
  if (error) {
    // unique (season, award_slug, granted_by) → this season's grant is spent
    return { ok: false, reason: error.code === '23505' ? 'already_granted' : 'error' }
  }
  return { ok: true }
}

export interface WitnessedAward {
  slug: WitnessedSlug
  label: string
  season: number
  grantedAt: string
  grantedBy: { id: string; displayName: string | null }
}

/** Awards a member has RECEIVED, newest first, with the granted-by name. */
export async function listWitnessedAwards(profileId: string): Promise<WitnessedAward[]> {
  const { data } = await db()
    .from('witnessed_grants')
    .select('award_slug, season, created_at, granter:profiles!witnessed_grants_granted_by_fkey(id, display_name)')
    .eq('granted_to', profileId)
    .order('created_at', { ascending: false })

  return ((data ?? []) as unknown as {
    award_slug: WitnessedSlug
    season: number
    created_at: string
    granter: { id: string; display_name: string | null } | null
  }[]).map((r) => ({
    slug: r.award_slug,
    label: WITNESSED_AWARDS[r.award_slug]?.label ?? r.award_slug,
    season: r.season,
    grantedAt: r.created_at,
    grantedBy: { id: r.granter?.id ?? '', displayName: r.granter?.display_name ?? null },
  }))
}

/** Whether a member still holds an ungiven grant of `slug` this season (for the
 *  quiet "give" affordance — shown only when giving is possible). */
export async function canGrantWitnessed(granterId: string, slug: WitnessedSlug): Promise<boolean> {
  const admin = db()
  const season = await activeSeason(admin)
  if (season == null) return false
  if (slug === 'carried_the_room') {
    const { data: hosted } = await admin
      .from('memberships')
      .select('circle_id')
      .eq('profile_id', granterId)
      .eq('status', 'active')
      .eq('volunteer_role', 'host')
      .limit(1)
      .maybeSingle()
    if (!hosted) return false
  }
  const { data: spent } = await admin
    .from('witnessed_grants')
    .select('id')
    .eq('season', season)
    .eq('award_slug', slug)
    .eq('granted_by', granterId)
    .limit(1)
    .maybeSingle()
  return !spent
}
