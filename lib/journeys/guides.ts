import 'server-only'

// JOURNEY GUIDES (owner 2026-11-17): the people who lead a Journey. A Journey's HOST is its home Space
// (journey_plans.space_id) plus any co-host Spaces (lib/journeys/space-shares.ts); its GUIDES are people,
// any number, in order. With no guides, the Journey page shows the host Space as the guide.
//
// A guide is credited and may host Runs of the Journey in a Circle of its home Space (guideMayRunIn).
// A guide never gets content, settings or price access: getJourneyCapabilities does not read this table.
//
// journey_plan_guides is service-role only (supabase/migrations/20270346090000_journey_plan_guides.sql),
// so every read here uses the admin client and every write is gated by the caller's action.

import { createAdminClient } from '@/lib/supabase/admin'

function db() {
  return createAdminClient() as unknown as {
    from: (table: string) => any // eslint-disable-line @typescript-eslint/no-explicit-any
  }
}

export interface JourneyGuide {
  profileId: string
  handle: string
  displayName: string
  avatarUrl: string | null
}

/** A Journey's guides, in order. Inactive profiles drop out. Fail-soft: an error reads as no guides. */
export async function listJourneyGuides(planId: string): Promise<JourneyGuide[]> {
  const { data, error } = await db()
    .from('journey_plan_guides')
    .select('profile_id, sort_order, created_at, profiles!journey_plan_guides_profile_id_fkey(handle, display_name, avatar_url, is_active)')
    .eq('plan_id', planId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })
  if (error) {
    console.error('[journey-guides] list failed', { planId, message: error.message })
    return []
  }
  type Row = { profile_id: string; profiles: { handle: string | null; display_name: string | null; avatar_url: string | null; is_active: boolean | null } | null }
  return ((data ?? []) as Row[])
    .filter((r) => r.profiles?.handle && r.profiles.is_active !== false)
    .map((r) => ({
      profileId: r.profile_id,
      handle: r.profiles!.handle!,
      displayName: r.profiles!.display_name ?? r.profiles!.handle!,
      avatarUrl: r.profiles!.avatar_url,
    }))
}

/** Is this person a guide of this Journey? */
async function isJourneyGuide(planId: string, profileId: string | null): Promise<boolean> {
  if (!profileId) return false
  const { data } = await db().from('journey_plan_guides').select('id').eq('plan_id', planId).eq('profile_id', profileId).maybeSingle()
  return !!data
}

/** PURE. May a guide start or host a Run of the Journey in this Circle? Only in a Circle of the Journey's
 *  own home Space: guiding a Journey is not a key to every Circle that adopts it. */
export function guideMayRunInSpace(facts: { isGuide: boolean; planSpaceId: string | null; circleSpaceId: string | null }): boolean {
  return facts.isGuide && !!facts.planSpaceId && facts.planSpaceId === facts.circleSpaceId
}

/** The IO front door for guideMayRunInSpace. */
export async function guideMayRunIn(planId: string, profileId: string, circleSpaceId: string | null): Promise<boolean> {
  if (!circleSpaceId) return false
  const { data } = await db().from('journey_plans').select('space_id').eq('id', planId).maybeSingle()
  const planSpaceId = (data as { space_id: string | null } | null)?.space_id ?? null
  return guideMayRunInSpace({ isGuide: await isJourneyGuide(planId, profileId), planSpaceId, circleSpaceId })
}

/** Add a guide at the end of the list. Idempotent: a person already guiding stays where they are. */
export async function addJourneyGuide(planId: string, profileId: string, addedBy: string): Promise<boolean> {
  const { data: last } = await db()
    .from('journey_plan_guides')
    .select('sort_order')
    .eq('plan_id', planId)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle()
  const next = ((last as { sort_order: number } | null)?.sort_order ?? -1) + 1
  const { error } = await db().from('journey_plan_guides').insert([{ plan_id: planId, profile_id: profileId, sort_order: next, added_by: addedBy }])
  if (error && error.code !== '23505') {
    console.error('[journey-guides] add failed', { planId, code: error.code, message: error.message })
    return false
  }
  return true
}

/** Remove a guide. */
export async function removeJourneyGuide(planId: string, profileId: string): Promise<boolean> {
  const { error } = await db().from('journey_plan_guides').delete().eq('plan_id', planId).eq('profile_id', profileId)
  if (error) {
    console.error('[journey-guides] remove failed', { planId, message: error.message })
    return false
  }
  return true
}

/** Every guide of every Journey a Space owns, for the Space's Journeys manager. */
export async function listGuidesForPlans(planIds: string[]): Promise<Record<string, JourneyGuide[]>> {
  const out: Record<string, JourneyGuide[]> = {}
  await Promise.all(planIds.map(async (id) => (out[id] = await listJourneyGuides(id))))
  return out
}
