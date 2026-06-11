// Canonical season ranks — The Quest game system.
//
// Naming is locked (canon: docs/NAMING.md). Do not rename without updating the
// season_rank_enum migration.
//
// Colors come from the Dawn rank spectrum (defined in app/globals.css :root).
// Per the implementation spec Section 6, season ladders apex on `gold` (the
// brand light = highest-energy state). The volunteer ladder (in
// components/layout/app-shell.tsx) apexes on `plum` instead, so the human
// ladder stays visually distinct from the play ladders.

import { isPaid, type EntitlementTier } from '@/lib/core/entitlement'

export type RankKey =
  | 'stone' | 'clay' | 'gold' | 'olive' | 'jade'
  | 'teal'  | 'slate' | 'indigo' | 'plum'  | 'rose'

export const SEASON_RANKS = [
  { rank: 'ghost',     label: 'Ghost',     minZaps: 0,    order: 1, rankKey: 'stone'  as RankKey, color: 'bg-rank-stone',  text: 'text-rank-stone'  },
  { rank: 'echo',      label: 'Echo',      minZaps: 100,  order: 2, rankKey: 'jade'   as RankKey, color: 'bg-rank-jade',   text: 'text-rank-jade'   },
  { rank: 'signal',    label: 'Signal',    minZaps: 300,  order: 3, rankKey: 'teal'   as RankKey, color: 'bg-rank-teal',   text: 'text-rank-teal'   },
  { rank: 'beacon',    label: 'Beacon',    minZaps: 750,  order: 4, rankKey: 'olive'  as RankKey, color: 'bg-rank-olive',  text: 'text-rank-olive'  },
  { rank: 'conduit',   label: 'Conduit',   minZaps: 1500, order: 5, rankKey: 'indigo' as RankKey, color: 'bg-rank-indigo', text: 'text-rank-indigo' },
  { rank: 'luminary',  label: 'Luminary',  minZaps: 3000, order: 6, rankKey: 'gold'   as RankKey, color: 'bg-rank-gold',   text: 'text-rank-gold'   },
] as const

export type SeasonRank = typeof SEASON_RANKS[number]['rank']

export const RANK_LABELS: Record<SeasonRank, string> = {
  ghost:     'Ghost',
  echo:      'Echo',
  signal:    'Signal',
  beacon:    'Beacon',
  conduit:   'Conduit',
  luminary:  'Luminary',
}

export const RANK_TO_KEY: Record<SeasonRank, RankKey> = {
  ghost:     'stone',
  echo:      'jade',
  signal:    'teal',
  beacon:    'olive',
  conduit:   'indigo',
  luminary:  'gold',
}

// Ascending rank order — MUST match the season_rank_enum declaration order in the
// DB (ghost < echo < signal < beacon < conduit < luminary). The lifetime-rank
// machinery (migration 20260608060000) relies on this ordering via GREATEST()/max()
// on the enum; this mirror lets app code compare ranks without a round-trip.
export const RANK_ORDER: readonly SeasonRank[] = [
  'ghost', 'echo', 'signal', 'beacon', 'conduit', 'luminary',
] as const

/** Numeric position of a rank (0 = ghost). Unknown → 0. */
export function rankIndex(rank: SeasonRank | string | null | undefined): number {
  const i = RANK_ORDER.indexOf((rank ?? 'ghost') as SeasonRank)
  return i < 0 ? 0 : i
}

/** The higher of two ranks — the same "monotonic peak" the lifetime_rank column holds. */
export function higherRank(a: SeasonRank | null | undefined, b: SeasonRank | null | undefined): SeasonRank {
  return rankIndex(a) >= rankIndex(b) ? ((a ?? 'ghost') as SeasonRank) : ((b ?? 'ghost') as SeasonRank)
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
 * people cards, post flair). Everyone *earns*; only the PAID tier (Crew or
 * Supporter) is *endorsed* (ECONOMY-AND-JOURNEYS §4, ADR-141). A free member's
 * earned rank stays visible to themselves in their own Vault/dashboard, but not
 * to others. Inert in Beta, where every member is comped the Crew tier.
 *
 * PB.1i: endorsement keys off `profiles.membership_tier` (the entitlement axis),
 * NOT the community role — the legacy `community_role='crew'` value is retired
 * (migration 20260612060000). Pass the DISPLAYED profile's tier, not the viewer's.
 */
export function isEndorsed(tier: EntitlementTier | string | null | undefined): boolean {
  return isPaid((tier ?? null) as EntitlementTier | null)
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

export type RankDef = typeof SEASON_RANKS[number]

/** Progress toward the next rank from a season-zaps total — the one calculation
 *  every "climbing to the next tier" bar reads from (the rail Quest panel, the
 *  profile rank bar). `pct` is clamped 0–100; at the apex `next` is null and `pct`
 *  is 100. */
export function rankProgress(zaps: number): {
  rank: SeasonRank
  def: RankDef
  next: RankDef | null
  pct: number
  zapsToNext: number
} {
  const rank = rankForZaps(zaps)
  const idx = SEASON_RANKS.findIndex((r) => r.rank === rank)
  const def = SEASON_RANKS[idx < 0 ? 0 : idx]
  const next = SEASON_RANKS[(idx < 0 ? 0 : idx) + 1] ?? null
  const pct = next && next.minZaps > def.minZaps
    ? Math.min(100, Math.max(0, Math.round(((zaps - def.minZaps) / (next.minZaps - def.minZaps)) * 100)))
    : 100
  return { rank, def, next, pct, zapsToNext: next ? Math.max(0, next.minZaps - zaps) : 0 }
}
