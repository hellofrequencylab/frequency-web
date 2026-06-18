// Granted cosmetics (Rewards Economy v2 / Season 1 award set).
//
// Ownership of a cosmetic = a store_redemptions row (gems_spent 0 for grants).
// The granted-only items are seeded with gem_cost 0 + is_active false, so they
// can never be bought — only awarded here. Idempotent per (member, item).
//
// Two award families are granted by sweeps:
//   * Rank cosmetics — auto at promotion: every rank at or below the member's
//     current season rank grants its cosmetic (Ghost flair → Master tokens).
//   * Journey cosmetics — completing an OFFICIAL Journey (journey_plans.official,
//     pillar from its items' domain_id) grants the pillar badge; all four grant
//     the Full Spectrum banner (S1-exclusive).

import { createAdminClient } from '@/lib/supabase/admin'
import type { SupabaseClient } from '@supabase/supabase-js'

function db(): SupabaseClient {
  return createAdminClient()
}

/** Rank → granted cosmetic item slugs (cumulative: holding a rank grants every
 *  slug at or below it). Mirrors the seeded store_items in 20260614000000. */
export const RANK_COSMETICS: Record<string, string[]> = {
  ghost:    ['rank-ghost-flair'],
  initiate: ['rank-initiate-badge'],
  adept:    ['rank-adept-ring'],
  master:   ['rank-master-token', 'master-club-mark'],
}

const RANK_ORDER = ['ghost', 'initiate', 'adept', 'master']

export const JOURNEY_BADGES: Record<string, string> = {
  mind: 'journey-badge-mind',
  body: 'journey-badge-body',
  spirit: 'journey-badge-spirit',
  expression: 'journey-badge-expression',
}

export const FULL_SPECTRUM_BADGE = 'full-spectrum-banner'

/** Grant a store item to a member (gems_spent 0). Idempotent: skips when the
 *  member already holds the item. Returns true when newly granted. */
export async function grantStoreItem(profileId: string, slug: string): Promise<boolean> {
  const admin = db()
  const { data: item } = await admin.from('store_items').select('id').eq('slug', slug).maybeSingle()
  const itemId = (item as { id: string } | null)?.id
  if (!itemId) return false

  const { data: owned } = await admin
    .from('store_redemptions')
    .select('id')
    .eq('profile_id', profileId)
    .eq('item_id', itemId)
    .limit(1)
    .maybeSingle()
  if (owned) return false

  const { error } = await admin.from('store_redemptions').insert({
    profile_id: profileId,
    item_id: itemId,
    gems_spent: 0,
    metadata: { granted: true, slug },
  })
  return !error
}

/** The pillar slug (mind / body / spirit / expression) for one Journey: the dominant
 *  domain_id across its practice items, resolved to a pillar slug. Null when the plan has
 *  no pillar-tagged items. Read-only; used to grant the right Journey badge on completion. */
export async function pillarForJourney(planId: string): Promise<string | null> {
  const admin = db()
  const { data: items } = await admin
    .from('journey_plan_items')
    .select('domain_id')
    .eq('plan_id', planId)
  const rows = (items ?? []) as { domain_id: string | null }[]
  if (rows.length === 0) return null

  const { data: pillars } = await admin.from('pillars').select('id, slug')
  const slugById = new Map(((pillars ?? []) as { id: string; slug: string }[]).map((p) => [p.id, p.slug]))

  const tally = new Map<string, number>()
  for (const it of rows) {
    const slug = it.domain_id ? slugById.get(it.domain_id) : undefined
    if (!slug) continue
    tally.set(slug, (tally.get(slug) ?? 0) + 1)
  }
  const top = [...tally.entries()].sort((a, b) => b[1] - a[1])[0]
  return top ? top[0] : null
}

/** Grant the Pillar journey-badge cosmetic for ONE just-finished Journey, then the
 *  Full Spectrum banner once the member holds all four pillar badges. Idempotent (rides
 *  grantStoreItem's per-member-per-item guard) + best-effort: a missing pillar/badge is a
 *  no-op, never an error. Used by the completion path (lib/quest/complete.ts) so a finish
 *  mints its Trophy immediately, without waiting for the batch sweepJourneyBadges. */
export async function grantJourneyBadgeOnCompletion(profileId: string, planId: string): Promise<boolean> {
  try {
    const pillar = await pillarForJourney(planId)
    if (!pillar || !JOURNEY_BADGES[pillar]) return false
    const granted = await grantStoreItem(profileId, JOURNEY_BADGES[pillar])

    // Full Spectrum: held all four pillar badges? (mind + body + spirit + expression)
    const admin = db()
    const allSlugs = Object.values(JOURNEY_BADGES)
    const { data: items } = await admin.from('store_items').select('id, slug').in('slug', allSlugs)
    const badgeItemIds = ((items ?? []) as { id: string; slug: string }[]).map((i) => i.id)
    if (badgeItemIds.length >= allSlugs.length) {
      const { count } = await admin
        .from('store_redemptions')
        .select('id', { count: 'exact', head: true })
        .eq('profile_id', profileId)
        .in('item_id', badgeItemIds)
      if ((count ?? 0) >= allSlugs.length) await grantStoreItem(profileId, FULL_SPECTRUM_BADGE)
    }
    return granted
  } catch (err) {
    console.error('[grantJourneyBadgeOnCompletion]', err instanceof Error ? err.message : err)
    return false
  }
}

/** Sweep: grant every member the rank cosmetics for their current season rank
 *  (and all ranks below it). Cheap at beta scale; idempotent. */
export async function sweepRankCosmetics(): Promise<{ granted: number }> {
  const admin = db()
  const { data: profiles } = await admin
    .from('profiles')
    .select('id, current_season_rank')
    .gt('lifetime_zaps', 0)
  let granted = 0
  for (const p of (profiles ?? []) as { id: string; current_season_rank: string }[]) {
    const rankIdx = RANK_ORDER.indexOf(p.current_season_rank)
    if (rankIdx < 0) continue
    for (let i = 0; i <= rankIdx; i++) {
      for (const slug of RANK_COSMETICS[RANK_ORDER[i]] ?? []) {
        if (await grantStoreItem(p.id, slug)) granted++
      }
    }
  }
  return { granted }
}

/**
 * Sweep: journey badges for completed OFFICIAL Journeys. A completion is a
 * reward_grants row keyed journey.complete:<planId>:<season> (legacy season grants; the
 * season engine is retired per ADR-253, so this only re-sweeps historical completions).
 * The badge's pillar is the dominant domain_id across the plan's items. All four pillar
 * badges grant Full Spectrum. Defensive: unknown pillars grant nothing.
 */
export async function sweepJourneyBadges(): Promise<{ granted: number }> {
  const admin = db()
  let granted = 0

  const { data: grants } = await admin
    .from('reward_grants')
    .select('profile_id, rule_key')
    .like('rule_key', 'journey.complete:%')
  const rows = (grants ?? []) as { profile_id: string; rule_key: string }[]
  if (rows.length === 0) return { granted }

  const planIds = [...new Set(rows.map((r) => r.rule_key.split(':')[1]).filter(Boolean))]
  const { data: plans } = await admin
    .from('journey_plans')
    .select('id, official')
    .in('id', planIds)
    .eq('official', true)
  const officialIds = new Set(((plans ?? []) as { id: string }[]).map((p) => p.id))
  if (officialIds.size === 0) return { granted }

  // Pillar per official plan: the dominant items.domain_id, resolved to a slug.
  const { data: items } = await admin
    .from('journey_plan_items')
    .select('plan_id, domain_id')
    .in('plan_id', [...officialIds])
  const { data: pillars } = await admin.from('pillars').select('id, slug')
  const pillarSlugById = new Map(
    ((pillars ?? []) as { id: string; slug: string }[]).map((p) => [p.id, p.slug]),
  )
  const pillarByPlan = new Map<string, string>()
  const tally = new Map<string, Map<string, number>>()
  for (const it of (items ?? []) as { plan_id: string; domain_id: string | null }[]) {
    const slug = it.domain_id ? pillarSlugById.get(it.domain_id) : undefined
    if (!slug) continue
    const t = tally.get(it.plan_id) ?? new Map<string, number>()
    t.set(slug, (t.get(slug) ?? 0) + 1)
    tally.set(it.plan_id, t)
  }
  for (const [planId, t] of tally) {
    const top = [...t.entries()].sort((a, b) => b[1] - a[1])[0]
    if (top) pillarByPlan.set(planId, top[0])
  }

  // Grant badges per member, then Full Spectrum once all four are held.
  const byMember = new Map<string, Set<string>>()
  for (const r of rows) {
    const planId = r.rule_key.split(':')[1]
    if (!officialIds.has(planId)) continue
    const pillar = pillarByPlan.get(planId)
    if (!pillar || !JOURNEY_BADGES[pillar]) continue
    const set = byMember.get(r.profile_id) ?? new Set<string>()
    set.add(pillar)
    byMember.set(r.profile_id, set)
  }
  for (const [profileId, pillarSet] of byMember) {
    for (const pillar of pillarSet) {
      if (await grantStoreItem(profileId, JOURNEY_BADGES[pillar])) granted++
    }
    if (pillarSet.size >= 4 && (await grantStoreItem(profileId, FULL_SPECTRUM_BADGE))) granted++
  }
  return { granted }
}
