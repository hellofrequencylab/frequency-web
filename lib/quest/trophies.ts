// The lifetime Trophy Case read — the permanent record beside the resettable
// seasonal rank.
//
// Two permanent records make up the case (the season is the doing; Gems and
// Trophies are what you keep):
//   • journey_completions — one row per finished Journey. Joined to journey_plans
//     for the Journey's identity (title, emoji) and to its first practice item's
//     Pillar for the label. Each completion lifts a rank, so the rank it EARNED is
//     derived from its position among that season's completions (1st → Initiate,
//     2nd → Adept, 3rd+ → Master).
//   • season_trophies — one row per season a member played, stamping the final
//     rank reached, the season's Zaps, Gems converted, and challenges finished.
//
// Server-only (admin client). The journey_plans / quests columns aren't in the
// generated types yet, so the joins read through the admin handle behind a
// try/catch and degrade to an empty case (never blocking the Vault). Pure data —
// the case is rendered by components/quest/trophy-case.tsx.

import { createAdminClient } from '@/lib/supabase/admin'
import { rankForCompletion, type SeasonRank } from '@/lib/season-ranks'

/** A pillar slug → label map (Mind · Body · Spirit · Expression). */
const PILLAR_LABEL: Record<string, string> = {
  mind: 'Mind',
  body: 'Body',
  spirit: 'Spirit',
  expression: 'Expression',
}

/** One finished Journey — a permanent Trophy. */
export interface JourneyTrophy {
  /** journey_completions row id (stable key). */
  id: string
  /** Journey slug (deep link target). */
  slug: string
  /** Journey name (e.g. "Clear Head"). */
  title: string
  /** A single emoji giving the Trophy a face. Null = a fallback glyph. */
  emoji: string | null
  /** The Pillar label this Journey carries, or null if unknown. */
  pillar: string | null
  /** The rank this Journey earned (its position in the season's climb). */
  rankEarned: SeasonRank
  /** When the Journey was finished (ISO). */
  completedAt: string
}

/** One season the member played — its stamped summary. */
export interface SeasonTrophy {
  /** Season number (the season_trophies.season key). */
  season: number
  /** The season's name (from the seasons table), or null if unnamed. */
  name: string | null
  /** Highest rank reached that season. */
  finalRank: SeasonRank
  /** Total season Zaps earned. */
  finalZaps: number
  /** Gems converted on the season reset. */
  gemsConverted: number
  /** Challenges finished that season. */
  challengesCompleted: number
}

/** A single season's block in the case: the season summary (if the season has
 *  ended and was stamped) plus the Journeys finished that season. */
export interface SeasonBlock {
  /** Season number — newest first across the case. */
  season: number
  /** The season's name, or null. */
  name: string | null
  /** The season's stamped summary, or null for the live (current) season. */
  summary: SeasonTrophy | null
  /** Journeys finished that season, newest first. */
  trophies: JourneyTrophy[]
}

export interface TrophyCaseData {
  /** Every season the member has a record in, newest first. */
  seasons: SeasonBlock[]
  /** Total finished Journeys across all seasons (the case's headline count). */
  totalTrophies: number
  /** Number of seasons played (a season_trophies row, or a finished Journey). */
  seasonsPlayed: number
}

const EMPTY: TrophyCaseData = { seasons: [], totalTrophies: 0, seasonsPlayed: 0 }

/**
 * Read a member's lifetime Trophy Case — every finished Journey grouped by
 * season (newest first), plus each past season's stamped summary. Self-contained
 * and fail-soft: any read error degrades to an empty case so the Vault shell
 * never blocks on it.
 */
export async function getTrophyCase(profileId: string): Promise<TrophyCaseData> {
  if (!profileId) return EMPTY

  try {
    const admin = createAdminClient()

    const [{ data: completionRows }, { data: trophyRows }, { data: seasonRows }] =
      await Promise.all([
        admin
          .from('journey_completions')
          .select(
            'id, journey_id, season, completed_at, journey_plans(slug, title, emoji, journey_plan_items(domain_id))',
          )
          .eq('profile_id', profileId)
          .order('completed_at', { ascending: true }),
        admin
          .from('season_trophies')
          .select('season, final_rank, final_zaps, gems_converted, challenges_completed')
          .eq('profile_id', profileId),
        admin.from('seasons').select('season_number, name'),
      ])

    type CompletionRow = {
      id: string
      journey_id: string
      season: number
      completed_at: string
      journey_plans: {
        slug: string
        title: string
        emoji: string | null
        journey_plan_items: { domain_id: string | null }[] | null
      } | null
    }
    const completions = (completionRows ?? []) as CompletionRow[]

    // Resolve each Journey's Pillar from its first practice item's domain.
    const domainIds = [
      ...new Set(
        completions.flatMap(
          (c) =>
            (c.journey_plans?.journey_plan_items ?? [])
              .map((i) => i.domain_id)
              .filter(Boolean) as string[],
        ),
      ),
    ]
    const pillarByDomain = new Map<string, string>()
    if (domainIds.length > 0) {
      const { data: pillarRows } = await admin
        .from('pillars')
        .select('id, slug')
        .in('id', domainIds)
      for (const r of (pillarRows ?? []) as { id: string; slug: string }[]) {
        pillarByDomain.set(r.id, r.slug)
      }
    }

    const nameBySeason = new Map<number, string | null>()
    for (const s of (seasonRows ?? []) as { season_number: number; name: string | null }[]) {
      nameBySeason.set(s.season_number, s.name)
    }

    const summaryBySeason = new Map<number, SeasonTrophy>()
    for (const t of (trophyRows ?? []) as Array<{
      season: number
      final_rank: string
      final_zaps: number
      gems_converted: number
      challenges_completed: number
    }>) {
      summaryBySeason.set(t.season, {
        season: t.season,
        name: nameBySeason.get(t.season) ?? null,
        finalRank: (t.final_rank as SeasonRank) ?? 'ghost',
        finalZaps: t.final_zaps,
        gemsConverted: t.gems_converted,
        challengesCompleted: t.challenges_completed,
      })
    }

    // Group completions by season, ascending within a season so the Nth finish
    // earns the Nth rank (1st → Initiate … 3rd+ → Master).
    const trophiesBySeason = new Map<number, JourneyTrophy[]>()
    for (const c of completions) {
      const plan = c.journey_plans
      const firstDomain =
        (plan?.journey_plan_items ?? []).find((i) => i.domain_id)?.domain_id ?? null
      const pillarSlug = firstDomain ? pillarByDomain.get(firstDomain) ?? null : null
      const list = trophiesBySeason.get(c.season) ?? []
      list.push({
        id: c.id,
        slug: plan?.slug ?? '',
        title: plan?.title ?? 'A Journey',
        emoji: plan?.emoji ?? null,
        pillar: pillarSlug ? PILLAR_LABEL[pillarSlug] ?? null : null,
        // Position in this season's climb = the rank this Journey earned.
        rankEarned: rankForCompletion(list.length + 1),
        completedAt: c.completed_at,
      })
      trophiesBySeason.set(c.season, list)
    }

    // Every season with any record: a finished Journey, a stamped summary, or both.
    const seasonNumbers = [
      ...new Set<number>([...trophiesBySeason.keys(), ...summaryBySeason.keys()]),
    ].sort((a, b) => b - a) // newest first

    const seasons: SeasonBlock[] = seasonNumbers.map((season) => ({
      season,
      name: nameBySeason.get(season) ?? null,
      summary: summaryBySeason.get(season) ?? null,
      // Newest Journey first within the season.
      trophies: (trophiesBySeason.get(season) ?? []).slice().reverse(),
    }))

    return {
      seasons,
      totalTrophies: completions.length,
      seasonsPlayed: seasonNumbers.length,
    }
  } catch {
    return EMPTY
  }
}
