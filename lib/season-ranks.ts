// Canonical season ranks — The Field game system.
// Reference: notion.so/36bfb0d4b941810db128cf207401745e
//
// Naming is locked. Do not rename without updating the Notion canonical
// reference and the season_rank_enum migration.
//
// Colors come from the Dawn rank spectrum (defined in app/globals.css :root).
// Per the implementation spec Section 6, season ladders apex on `gold` (the
// brand light = highest-energy state). The volunteer ladder (in
// components/layout/app-shell.tsx) apexes on `plum` instead, so the human
// ladder stays visually distinct from the play ladders.

import { atLeastRole, type CommunityRole } from '@/lib/core/roles'

export type RankKey =
  | 'stone' | 'clay' | 'gold' | 'olive' | 'jade'
  | 'teal'  | 'slate' | 'indigo' | 'plum'  | 'rose'

export const SEASON_RANKS = [
  { rank: 'ghost',     label: 'Ghost',     minZaps: 0,    order: 1, rankKey: 'stone'  as RankKey, color: 'bg-rank-stone',  text: 'text-rank-stone'  },
  { rank: 'runner',    label: 'Runner',    minZaps: 100,  order: 2, rankKey: 'jade'   as RankKey, color: 'bg-rank-jade',   text: 'text-rank-jade'   },
  { rank: 'operative', label: 'Operative', minZaps: 300,  order: 3, rankKey: 'teal'   as RankKey, color: 'bg-rank-teal',   text: 'text-rank-teal'   },
  { rank: 'agent',     label: 'Agent',     minZaps: 750,  order: 4, rankKey: 'olive'  as RankKey, color: 'bg-rank-olive',  text: 'text-rank-olive'  },
  { rank: 'conduit',   label: 'Conduit',   minZaps: 1500, order: 5, rankKey: 'indigo' as RankKey, color: 'bg-rank-indigo', text: 'text-rank-indigo' },
  { rank: 'luminary',  label: 'Luminary',  minZaps: 3000, order: 6, rankKey: 'gold'   as RankKey, color: 'bg-rank-gold',   text: 'text-rank-gold'   },
] as const

export type SeasonRank = typeof SEASON_RANKS[number]['rank']

export const RANK_LABELS: Record<SeasonRank, string> = {
  ghost:     'Ghost',
  runner:    'Runner',
  operative: 'Operative',
  agent:     'Agent',
  conduit:   'Conduit',
  luminary:  'Luminary',
}

export const RANK_TO_KEY: Record<SeasonRank, RankKey> = {
  ghost:     'stone',
  runner:    'jade',
  operative: 'teal',
  agent:     'olive',
  conduit:   'indigo',
  luminary:  'gold',
}

// Inline-style helper — sets the three CSS vars the .rank-badge primitive
// in globals.css reads from. Pass to a `style={...}` prop.
export function rankBadgeStyle(rank: RankKey): React.CSSProperties {
  return {
    ['--rank' as string]:        `var(--rank-${rank})`,
    ['--rank-deep' as string]:   `var(--rank-${rank}-deep)`,
    ['--rank-bright' as string]: `var(--rank-${rank}-bright)`,
  }
}

export function seasonRankStyle(rank: SeasonRank): React.CSSProperties {
  return rankBadgeStyle(RANK_TO_KEY[rank])
}

export function getRankDef(rank: SeasonRank) {
  return SEASON_RANKS.find(r => r.rank === rank) ?? SEASON_RANKS[0]
}

/**
 * Whether a member's rank (and other status endorsements — cosmetics, custom
 * titles, Journey badges as they ship) render on PUBLIC surfaces (their profile,
 * people cards, post flair). Everyone *earns*; only Crew+ are *endorsed*
 * (ECONOMY-AND-JOURNEYS §4, ADR-141). A free member's earned rank stays visible
 * to themselves in their own Vault/dashboard, but not to others. Inert in Beta,
 * where everyone is Crew. Pass the DISPLAYED profile's role, not the viewer's.
 */
export function isEndorsed(role: CommunityRole | string | null | undefined): boolean {
  return atLeastRole((role ?? null) as CommunityRole | null, 'crew')
}

/** The rank a given season-zaps total actually earns (highest tier whose
 *  threshold is met). Use this as the source of truth for display so a stale
 *  `current_season_rank` column never shows the wrong tier. */
export function rankForZaps(zaps: number): SeasonRank {
  let earned: SeasonRank = SEASON_RANKS[0].rank
  for (const r of SEASON_RANKS) {
    if (zaps >= r.minZaps) earned = r.rank
  }
  return earned
}
