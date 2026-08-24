// Canonical season ranks — The Quest game system.
//
// Naming is locked (canon: docs/NAMING.md). Do not rename without updating the
// season_rank_enum migration.
//
// Completion-based model (ADR-Quest): rank = how many Journeys a member finishes
// this season. 0→ghost, 1→initiate, 2→adept, 3+→master.
//
// Colors come from the Dawn rank spectrum (defined in app/globals.css :root).
// Spectrum mapping locked by the DAWN round of 2026-08-03: stone / clay / gold /
// jade — earth to gold to jade, with `gold` (the brand light) at Adept and the
// ladder apexing on `jade`. The volunteer ladder (in
// components/layout/app-shell.tsx) apexes on `plum` instead, so the human
// ladder stays visually distinct from the play ladders.

import { isPaid, type EntitlementTier } from '@/lib/core/entitlement'

// NO RE-EXPORT OF journeysFinishedThisSeason HERE, AND THAT IS THE FIX (LIVE-037).
// This module is pure rank VOCABULARY — labels, order, progress math, badge styles — and about
// twenty client components import it, including lib/community-roles.tsx, which
// components/layout/app-shell.tsx pulls onto every route under app/(main). One convenience
// re-export of the season-completion READ dragged lib/quest/completion-read -> the service-role
// admin client into all of it. The read lives in @/lib/quest/completion-read; server callers
// import it from there. This file must stay dependency-free, so it takes NO `server-only`
// directive — adding one here would break every client component listed above.

export type RankKey =
  | 'stone' | 'clay' | 'gold' | 'olive' | 'jade'
  | 'teal'  | 'slate' | 'indigo' | 'plum'  | 'rose'

export const SEASON_RANKS = [
  // `color` is the rank's CORE — a dot, a pip, a bar, a crest fill. `solid` is the DEEP step,
  // and it is the one to use when the fill has to CARRY TEXT.
  // Measured 2026-08-05: white on a core runs 2.46:1 (gold) to 4.30:1 (slate) — every rank under
  // AA, and gold under even the 3:1 non-text bar; the same hues at `-deep` carry the light ink at
  // 4.92:1 to 8.19:1. The three grounds are now IN the contrast contract (RANK_PAIRS in
  // scripts/check-contrast.mjs), so a palette edit that lightens a core or a deep step fails CI:
  //   · CORE  may carry a dark GLYPH (`text-on-primary`, 4.31–7.54, held to 1.4.11's 3:1) and
  //           must never carry a label — slate 4.31 and plum 4.46 both miss 4.5.
  //   · DEEP  is the text-bearing ground (`text-on-ink`, 4.5 and clear).
  // Reach for `solid` the moment a LABEL sits on the fill; keep the core for glyphs and dots.
  { rank: 'ghost',    label: 'Ghost',    minJourneys: 0, order: 1, rankKey: 'stone' as RankKey, color: 'bg-rank-stone', solid: 'bg-rank-stone-deep', text: 'text-rank-stone' },
  { rank: 'initiate', label: 'Initiate', minJourneys: 1, order: 2, rankKey: 'clay'  as RankKey, color: 'bg-rank-clay', solid: 'bg-rank-clay-deep',  text: 'text-rank-clay'  },
  { rank: 'adept',    label: 'Adept',    minJourneys: 2, order: 3, rankKey: 'gold'  as RankKey, color: 'bg-rank-gold', solid: 'bg-rank-gold-deep',  text: 'text-rank-gold'  },
  { rank: 'master',   label: 'Master',   minJourneys: 3, order: 4, rankKey: 'jade'  as RankKey, color: 'bg-rank-jade', solid: 'bg-rank-jade-deep',  text: 'text-rank-jade'  },
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
  initiate: 'clay',
  adept:    'gold',
  master:   'jade',
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
 * only) is *endorsed* (ECONOMY-AND-JOURNEYS §4, ADR-141). A free member's
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
