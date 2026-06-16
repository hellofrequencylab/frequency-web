// Preview-as-a-member data builder (server-only). Builds the exact SeasonMapJourney[]
// the member-facing SeasonMap renders, but for a SELECTED season regardless of status
// (Draft / Scheduled / Live / Ended) and with NEUTRAL, zero member progress — so an
// operator sees how the season's three Pillar Journeys will read on /crew before it goes
// live. Mirrors the shape readSeasonMap builds on /crew, minus every member read: no
// completions, no challenge progress, no enrollment. Read-only; reads go through the
// service-role admin client (the page gate authorizes). No writes.

import { createAdminClient } from '@/lib/supabase/admin'
import { rankForCompletion, type SeasonRank } from '@/lib/season-ranks'
import type { SeasonMapJourney } from '@/components/quest/season-map'

const DAYS_TO_FINISH = 14

// The three Pillar Journeys a Quest ships — Mind, Body, Spirit carry the arcs.
const PILLAR_LABEL: Record<string, 'Mind' | 'Body' | 'Spirit'> = {
  mind: 'Mind',
  body: 'Body',
  spirit: 'Spirit',
}
const PILLAR_ORDER: Record<string, number> = { mind: 0, body: 1, spirit: 2 }

export interface SeasonPreview {
  seasonName: string
  /** Whole weeks left in the 13-week Quest from the season's own window, or null. */
  weeksLeft: number | null
  /** Neutral preview rank (a not-yet-started member is Ghost). */
  rank: SeasonRank
  /** Always 0 in preview — the operator sees the fresh-start read. */
  journeysFinished: number
  /** The three Pillar Journeys (Mind → Body → Spirit), each at zero progress. */
  journeys: SeasonMapJourney[]
}

function weeksLeftFrom(endsAt: string | null): number | null {
  if (!endsAt) return null
  const ms = new Date(endsAt).getTime() - Date.now()
  if (ms <= 0) return 0
  return Math.ceil(ms / (7 * 24 * 60 * 60 * 1000))
}

/** Build the member-facing preview for a season by id. Returns null if the season is
 *  gone; returns a preview with an empty journeys[] when the season has no Quest or no
 *  official Journeys yet (the page renders an empty hero in that case). */
export async function loadSeasonPreview(id: string): Promise<SeasonPreview | null> {
  const db = createAdminClient()

  const { data: seasonRow } = await db
    .from('seasons')
    .select('season_number, name, ends_at')
    .eq('id', id)
    .maybeSingle()
  const season = seasonRow as { season_number: number; name: string; ends_at: string | null } | null
  if (!season) return null

  const base: SeasonPreview = {
    seasonName: season.name,
    weeksLeft: weeksLeftFrom(season.ends_at),
    rank: rankForCompletion(0),
    journeysFinished: 0,
    journeys: [],
  }

  // The season's Quest container (the first, mirroring loadSeasonDetail).
  const { data: questRows } = await db
    .from('quests')
    .select('id')
    .eq('season', season.season_number)
    .order('sort_order', { ascending: true })
  const questId = ((questRows ?? []) as { id: string }[])[0]?.id ?? null
  if (!questId) return base

  // The official Journeys under this Quest, with each Journey's items' Pillar (domain).
  const { data: planRows } = await db
    .from('journey_plans')
    .select('id, slug, title, emoji, journey_plan_items(domain_id, sort_order)')
    .eq('quest_id', questId)
    .eq('official', true)
  const plans = (planRows ?? []) as Array<{
    id: string
    slug: string
    title: string
    emoji: string | null
    journey_plan_items: { domain_id: string | null; sort_order: number }[] | null
  }>
  if (plans.length === 0) return base

  // Resolve each Journey's Pillar slug from its first practice item's domain.
  const domainIds = [
    ...new Set(
      plans.flatMap(
        (p) => (p.journey_plan_items ?? []).map((i) => i.domain_id).filter(Boolean) as string[],
      ),
    ),
  ]
  const slugByDomain = new Map<string, string>()
  if (domainIds.length > 0) {
    const { data: pillarRows } = await db.from('pillars').select('id, slug').in('id', domainIds)
    for (const r of (pillarRows ?? []) as { id: string; slug: string }[]) {
      slugByDomain.set(r.id, r.slug)
    }
  }

  const rows = plans
    .map((p) => {
      const firstDomain =
        [...(p.journey_plan_items ?? [])]
          .sort((a, b) => a.sort_order - b.sort_order)
          .find((i) => i.domain_id)?.domain_id ?? null
      return {
        slug: p.slug,
        title: p.title,
        emoji: p.emoji,
        pillarSlug: firstDomain ? slugByDomain.get(firstDomain) ?? null : null,
      }
    })
    // Keep only the three Pillar Journeys (Mind/Body/Spirit), ordered.
    .filter((r) => r.pillarSlug && PILLAR_LABEL[r.pillarSlug])
    .sort((a, b) => (PILLAR_ORDER[a.pillarSlug!] ?? 9) - (PILLAR_ORDER[b.pillarSlug!] ?? 9))
  if (rows.length === 0) return base

  // Neutral, zero-progress preview: every arc is 'upcoming', no days, Expression pending.
  const journeys: SeasonMapJourney[] = rows.map((r) => ({
    slug: r.slug,
    title: r.title,
    pillar: PILLAR_LABEL[r.pillarSlug!],
    emoji: r.emoji,
    state: 'upcoming',
    daysLogged: 0,
    daysNeeded: DAYS_TO_FINISH,
    expression: 'pending',
  }))

  return { ...base, journeys }
}
