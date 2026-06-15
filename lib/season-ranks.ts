// Canonical season ranks — The Quest game system.
//
// Naming is locked (canon: docs/NAMING.md). Do not rename without updating the
// season_rank_enum migration.
//
// Completion-based model (ADR-Quest): rank = how many Journeys a member finishes
// this season. 0→ghost, 1→initiate, 2→adept, 3+→master.
//
// Colors come from the Dawn rank spectrum (defined in app/globals.css :root).
// Per the implementation spec Section 6, season ladders apex on `gold` (the
// brand light = highest-energy state). The volunteer ladder (in
// components/layout/app-shell.tsx) apexes on `plum` instead, so the human
// ladder stays visually distinct from the play ladders.

import { isPaid, type EntitlementTier } from '@/lib/core/entitlement'

export { journeysFinishedThisSeason } from '@/lib/quest/completion-read'

export type RankKey =
  | 'stone' | 'clay' | 'gold' | 'olive' | 'jade'
  | 'teal'  | 'slate' | 'indigo' | 'plum'  | 'rose'

export const SEASON_RANKS = [
  { rank: 'ghost',    label: 'Ghost',    minJourneys: 0, order: 1, rankKey: 'stone' as RankKey, color: 'bg-rank-stone', text: 'text-rank-stone' },
  { rank: 'initiate', label: 'Initiate', minJourneys: 1, order: 2, rankKey: 'jade'  as RankKey, color: 'bg-rank-jade',  text: 'text-rank-jade'  },
  { rank: 'adept',    label: 'Adept',    minJourneys: 2, order: 3, rankKey: 'teal'  as RankKey, color: 'bg-rank-teal',  text: 'text-rank-teal'  },
  { rank: 'master',   label: 'Master',   minJourneys: 3, order: 4, rankKey: 'gold'  as RankKey, color: 'bg-rank-gold',  text: 'text-rank-gold'  },
] as const

export type SeasonRank = typeof SEASON_RANKS[number]['rank']

export const RANK_LABELS: Record<SeasonRank, string> = {
  ghost:    'Ghost',
  initiate: 'Initiate',
  adept:    'Adept',
  master:   'Master',
}

export const RANK_TO_KEY: Record<SeasonRank, RankKey> = {
  ghost:    'stone',
  initiate: 'jade',
  adept:    'teal',
  master:   'gold',
}

// Ascending rank order — MUST match the season_rank_enum declaration order in the
// DB (ghost < initiate < adept < master). The lifetime-rank machinery relies on
// this ordering via GREATEST()/max() on the enum; this mirror lets app code
// compare ranks without a round-trip.
export const RANK_ORDER: readonly SeasonRank[] = [
  'ghost', 'initiate', 'adept', 'master',
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

/** The rank a given journey-completions count actually earns.
 *  0 → ghost, 1 → initiate, 2 → adept, 3+ → master. */
export function rankForCompletion(journeysFinished: number): SeasonRank {
  if (journeysFinished >= 3) return 'master'
  if (journeysFinished >= 2) return 'adept'
  if (journeysFinished >= 1) return 'initiate'
  return 'ghost'
}

export type RankDef = typeof SEASON_RANKS[number]

/** Progress toward the next rank from a journeys-finished count — the one
 *  calculation every "climbing to the next tier" bar reads from. `pct` is
 *  clamped 0–100; at the apex `next` is null and `pct` is 100. */
export function rankProgress(journeysFinished: number): {
  rank: SeasonRank
  def: RankDef
  next: RankDef | null
  pct: number
  zapsToNext: number
} {
  const rank = rankForCompletion(journeysFinished)
  const idx = SEASON_RANKS.findIndex((r) => r.rank === rank)
  const def = SEASON_RANKS[idx < 0 ? 0 : idx]
  const next = SEASON_RANKS[(idx < 0 ? 0 : idx) + 1] ?? null
  const pct = next && next.minJourneys > def.minJourneys
    ? Math.min(100, Math.max(0, Math.round(((journeysFinished - def.minJourneys) / (next.minJourneys - def.minJourneys)) * 100)))
    : 100
  return { rank, def, next, pct, zapsToNext: next ? Math.max(0, next.minJourneys - journeysFinished) : 0 }
}
