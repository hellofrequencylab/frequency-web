// Preview-as-a-member data builder (server-only). Builds the PillarProgress[] the
// member-facing SeasonMap renders, for a SELECTED season regardless of status (Draft /
// Scheduled / Live / Ended) and with NEUTRAL, zero member progress — so an operator
// sees how the season's four-Pillar map will read on /crew before it goes live. No
// member reads (no completions, no enrollment). Read-only via the service-role admin
// client (the page gate authorizes). No writes.

import { createAdminClient } from '@/lib/supabase/admin'
import { rankForCompletion, type SeasonRank } from '@/lib/season-ranks'
import type { PillarProgress } from '@/components/quest/season-map'
import { getPillars, PILLAR_SLUGS } from '@/lib/pillars'

const PILLAR_DAYS_TARGET = 14

export interface SeasonPreview {
  seasonName: string
  /** Whole weeks left in the 13-week Quest from the season's own window, or null. */
  weeksLeft: number | null
  /** Neutral preview rank (a not-yet-started member is Ghost). */
  rank: SeasonRank
  /** Always 0 in preview — the operator sees the fresh-start read. */
  journeysFinished: number
  /** The four Pillars (Mind / Body / Spirit / Expression), each at zero progress. */
  pillars: PillarProgress[]
}

function weeksLeftFrom(endsAt: string | null): number | null {
  if (!endsAt) return null
  const ms = new Date(endsAt).getTime() - Date.now()
  if (ms <= 0) return 0
  return Math.ceil(ms / (7 * 24 * 60 * 60 * 1000))
}

// The four Pillars at zero progress — the fresh-start read every season opens with.
async function neutralPillars(): Promise<PillarProgress[]> {
  try {
    const ps = await getPillars()
    if (ps.length > 0) {
      return ps.map((p) => ({ slug: p.slug, name: p.name, daysLogged: 0, daysTarget: PILLAR_DAYS_TARGET }))
    }
  } catch {
    /* fall through to the static slugs */
  }
  return PILLAR_SLUGS.map((slug) => ({
    slug,
    name: slug.charAt(0).toUpperCase() + slug.slice(1),
    daysLogged: 0,
    daysTarget: PILLAR_DAYS_TARGET,
  }))
}

/** Build the member-facing preview for a season by id. Returns null if the season is
 *  gone. The four-Pillar map renders the same for every season (fresh start). */
export async function loadSeasonPreview(id: string): Promise<SeasonPreview | null> {
  const db = createAdminClient()

  const { data: seasonRow } = await db
    .from('seasons')
    .select('name, ends_at')
    .eq('id', id)
    .maybeSingle()
  const season = seasonRow as { name: string; ends_at: string | null } | null
  if (!season) return null

  return {
    seasonName: season.name,
    weeksLeft: weeksLeftFrom(season.ends_at),
    rank: rankForCompletion(0),
    journeysFinished: 0,
    pillars: await neutralPillars(),
  }
}
