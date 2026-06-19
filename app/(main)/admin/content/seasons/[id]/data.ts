// Season Composer data loader (server-only). Gathers everything the season detail needs
// in one place: the season's identity + window + status, its official Journeys (via the
// season's Quest), and for each Journey its play window, Pillar mix, per-Pillar Zap
// balance inputs, and Expression Challenge status. Reads go through the service-role
// admin client; the page gate (janitor/curator) is what authorizes the read — this
// module never gates on its own. No writes.

import { createAdminClient } from '@/lib/supabase/admin'
import { rankedJourneys } from '@/lib/admin/content-signals'
import { getPillars, pillarsById, type PillarSlug } from '@/lib/pillars'
import type { BalancePractice } from '@/lib/quest/pillar-balance'

export interface SeasonRecord {
  id: string
  season_number: number
  name: string
  theme: string | null
  starts_at: string | null
  ends_at: string | null
  status: string
}

export interface SeasonJourney {
  id: string
  slug: string
  title: string
  /** Quest play-window (inclusive ISO). Null = always open. */
  windowStartsAt: string | null
  windowEndsAt: string | null
  /** Practices reduced to the balance inputs (Pillar + weight class). */
  practices: BalancePractice[]
  /** Distinct Pillars the Journey touches, in pillar order. */
  pillarMix: { slug: PillarSlug; name: string }[]
  practiceCount: number
  /** The Expression Challenge that caps this Journey this season, if any. */
  expression: { id: string; name: string } | null
}

export interface SeasonDetail {
  season: SeasonRecord
  /** The season's Quest id (the container its official Journeys hang under), or null. */
  questId: string | null
  journeys: SeasonJourney[]
}

/** Load a season by id with its Journeys, Pillar mix, balance inputs, and Expression
 *  Challenge status. Returns null when the season does not exist. */
export async function loadSeasonDetail(id: string): Promise<SeasonDetail | null> {
  const db = createAdminClient()

  const { data: seasonRow } = await db
    .from('seasons')
    .select('id, season_number, name, theme, starts_at, ends_at, status')
    .eq('id', id)
    .maybeSingle()
  const season = seasonRow as SeasonRecord | null
  if (!season) return null

  // The season's Quest container (quests.season = season_number). A season may have at
  // most one active Quest in practice; we take the first.
  const { data: questRows } = await db
    .from('quests')
    .select('id')
    .eq('season', season.season_number)
    .order('sort_order', { ascending: true })
  const questId = ((questRows ?? []) as { id: string }[])[0]?.id ?? null

  if (!questId) {
    return { season, questId: null, journeys: [] }
  }

  // The official Journeys under this Quest.
  const { data: journeyRows } = await db
    .from('journey_plans')
    .select('id, slug, title, window_starts_at, window_ends_at')
    .eq('quest_id', questId)
    .eq('official', true)
    .order('window_starts_at', { ascending: true, nullsFirst: true })
    .order('title', { ascending: true })
  const journeys = (journeyRows ?? []) as {
    id: string
    slug: string
    title: string
    window_starts_at: string | null
    window_ends_at: string | null
  }[]
  const journeyIds = journeys.map((j) => j.id)

  // Pillars (for slug + name), the Journeys' practice items, and the season's Expression
  // Challenges — fetched together so the page composes from one round of reads.
  const [pillars, itemsResult, challengeResult] = await Promise.all([
    getPillars(),
    journeyIds.length
      ? db
          .from('journey_plan_items')
          .select('plan_id, practice_id, domain_id')
          .in('plan_id', journeyIds)
      : Promise.resolve({ data: [] as { plan_id: string; practice_id: string; domain_id: string | null }[] }),
    db
      .from('season_challenges')
      .select('id, name, journey_id')
      .eq('season', season.season_number)
      .not('journey_id', 'is', null),
  ])

  const pillarMap = pillarsById(pillars)
  const items = (itemsResult.data ?? []) as {
    plan_id: string
    practice_id: string
    domain_id: string | null
  }[]
  const challenges = (challengeResult.data ?? []) as {
    id: string
    name: string
    journey_id: string | null
  }[]

  // The per-log Zap value lives on the practice, not the item snapshot — fetch the practices
  // referenced by these items so the balance reads the real value (reward_zaps override → weight
  // class fallback).
  const practiceIds = Array.from(new Set(items.map((i) => i.practice_id)))
  const { data: practiceRows } = practiceIds.length
    ? await db.from('practices').select('id, weight_class, reward_zaps').in('id', practiceIds)
    : { data: [] as { id: string; weight_class: string | null; reward_zaps: number | null }[] }
  const valueById = new Map(
    ((practiceRows ?? []) as { id: string; weight_class: string | null; reward_zaps: number | null }[]).map(
      (p) => [p.id, { weightClass: p.weight_class, rewardZaps: p.reward_zaps }],
    ),
  )

  const itemsByJourney = new Map<string, typeof items>()
  for (const it of items) {
    const list = itemsByJourney.get(it.plan_id) ?? []
    list.push(it)
    itemsByJourney.set(it.plan_id, list)
  }
  const expressionByJourney = new Map<string, { id: string; name: string }>()
  for (const c of challenges) {
    if (c.journey_id) expressionByJourney.set(c.journey_id, { id: c.id, name: c.name })
  }

  const detailJourneys: SeasonJourney[] = journeys.map((j) => {
    const journeyItems = itemsByJourney.get(j.id) ?? []
    const practices: BalancePractice[] = journeyItems.map((it) => {
      const v = valueById.get(it.practice_id)
      return {
        pillar: (it.domain_id ? pillarMap.get(it.domain_id)?.slug : null) ?? null,
        weightClass: v?.weightClass ?? null,
        rewardZaps: v?.rewardZaps ?? null,
      }
    })
    // Distinct Pillars the Journey touches, in canonical pillar order.
    const touched = new Set(
      journeyItems
        .map((it) => (it.domain_id ? pillarMap.get(it.domain_id) : null))
        .filter((p): p is NonNullable<typeof p> => Boolean(p))
        .map((p) => p.slug),
    )
    const pillarMix = pillars
      .filter((p) => touched.has(p.slug))
      .map((p) => ({ slug: p.slug, name: p.name }))

    return {
      id: j.id,
      slug: j.slug,
      title: j.title,
      windowStartsAt: j.window_starts_at,
      windowEndsAt: j.window_ends_at,
      practices,
      pillarMix,
      practiceCount: journeyItems.length,
      expression: expressionByJourney.get(j.id) ?? null,
    }
  })

  return { season, questId, journeys: detailJourneys }
}

export interface AssignableJourney {
  id: string
  title: string
  status: string
  /** True when it's currently official under ANOTHER Quest (assigning it MOVES it). */
  inOtherQuest: boolean
}

/** Existing Journeys that can be assigned to this season's Quest. Reuses rankedJourneys() — the
 *  SAME "what Journeys exist" definition the admin Journeys-curation surface shows (public OR
 *  pending, never a bare draft, never an unlisted seed scaffold) — so the dropdown stays in
 *  lockstep with the library: a Journey the operator can see in curation is one they can assign,
 *  and the hidden seed scaffolds (quest-1-*, official-1-*) never leak in. Drops the ones already
 *  official under THIS Quest (they already list above). Each carries whether it's currently
 *  official under ANOTHER Quest, so the operator knows an assign would MOVE it. */
export async function loadAssignableJourneys(questId: string): Promise<AssignableJourney[]> {
  const journeys = await rankedJourneys()
  return journeys
    .filter((j) => !(j.official && j.quest_id === questId)) // already in this season
    .map((j) => ({
      id: j.id,
      title: j.title,
      status: j.status,
      inOtherQuest: j.official && !!j.quest_id && j.quest_id !== questId,
    }))
    .sort((a, b) => a.title.localeCompare(b.title))
}
