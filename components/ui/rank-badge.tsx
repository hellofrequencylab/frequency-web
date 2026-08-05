import type { HTMLAttributes, ReactNode } from 'react'
import { cn } from '@/lib/utils'
import {
  RANK_LABELS,
  RANK_ORDER,
  RANK_TO_KEY,
  SEASON_RANKS,
  getRankDef,
  rankBadgeStyle,
  type RankKey,
  type SeasonRank,
} from '@/lib/season-ranks'

// RankBadge (DAWN core/RankBadge) — the season-rank pill for The Quest, and the
// same chip for any spectrum colour (Pillar dots, Space accents, volunteer roles).
//
// WHAT THIS IS *NOT*: a second implementation. `app/globals.css` already owns the
// `.rank-badge` primitive (surface wash, `--rank-deep` label in light, `--rank-bright`
// in dark, the 8px `.rank-dot`), driven by three inline CSS vars. This component DRIVES
// that primitive — it resolves rank → spectrum key → the three vars via the one existing
// mapping in `lib/season-ranks.ts` (`RANK_TO_KEY` + `rankBadgeStyle`) and renders the
// documented anatomy. Nothing here re-derives a colour, a wash, or a dark-mode rule; a
// Tailwind reimplementation would be exactly the duplicate this pass exists to retire.
//
// WHY IT EARNS ITS KEEP: twenty call sites hand-rolled
// `<span className="rank-badge text-2xs …" style={seasonRankStyle(r)}>{label}</span>`,
// and they had already drifted — the size class was one of four different roles, the
// weight one of three, and NOT ONE of them rendered the `.rank-dot` the CSS primitive
// documents as half its anatomy. One component, one anatomy, one place to fix.
// Swept 2026-08-05: every one now composes this file (see SIZE below for what that
// sweep proved about the size roles).
//
// Presentational + server-friendly (no hooks, no client boundary).
//
//   <RankBadge rank="ghost" />                       // Ghost, stone, with its dot
//   <RankBadge rank="adept" showStep />              // Adept  2/3
//   <RankBadge rank="master" size="lg">Master · season 1</RankBadge>
//   <RankBadge rank="plum" dot={false}>Steward</RankBadge>   // spectrum colour, no dot

/** A season rank (the Quest ladder) or any spectrum colour key (Pillar dots, Space
 *  accents, the volunteer ladder). The two unions are disjoint, so one prop is honest. */
export type RankBadgeRank = SeasonRank | RankKey

/** `sm` = the chrome chip (rail, flair, app shell) · `md` = the default in-app chip ·
 *  `lg` = a card or hero chip.
 *
 *  ⚠️ READ THE CASCADE NOTE ON `SIZE` BELOW: today the size role paints NOTHING. */
export type RankBadgeSize = 'sm' | 'md' | 'lg'

// Size is the ONE thing the size prop sets, because `.rank-badge` hard-codes 12px and the
// twenty existing call sites each override it with a different role. Weight is left to the
// CSS primitive (500) — with one exception: at 10px, 500 reads thin against the tinted wash,
// so `sm` compensates. That is a legibility fix, not a second opinion about the primitive.
//
// ⚠️ CASCADE, MEASURED 2026-08-05 — THE SIZE ROLE DOES NOT PAINT TODAY, AND NEVER DID.
// The paragraph above says the role "overrides" the primitive's 12px. It does not. Compiling
// `app/globals.css` the way scripts/check-phantom-classes.mjs does shows Tailwind emits every
// `text-*` / `font-*` utility inside `@layer utilities`, while `.rank-badge` is UNLAYERED
// (globals.css §rank spectrum). In the CSS cascade layer order is resolved BEFORE specificity,
// and unlayered normal declarations outrank every layer — so `.rank-badge`'s `font-size: 12px`
// and `font-weight: 500` beat `text-3xs`, `text-2xs`, `text-meta`, `text-body-sm` and
// `font-bold` alike, no matter the emit order within the layer. All twenty hand-rolled chips
// were therefore already rendering at 12px/500 in four different declared sizes, which is why
// the sweep onto this component was visually inert on size — a fact worth having, because it
// means the DRIFT WAS NEVER VISIBLE and could not have been caught by looking.
//
// The map is kept, faithful and unchanged, for two reasons: it records which role each site
// INTENDED, and the moment `.rank-badge`'s `font-size`/`font-weight` move into `@layer
// components` (or the size lands as an inline var) all three roles start painting with no call
// site to revisit. Only `!important` reaches through today — `app/(main)/people/[handle]`
// deliberately uses `!text-3xs !px-1.5 !py-0` on its header chip, and that one is real.
const SIZE: Record<RankBadgeSize, string> = {
  sm: 'text-3xs font-bold',
  md: 'text-2xs',
  lg: 'text-meta',
}

// The apex rank's journey requirement IS the denominator of the completion read. Derived,
// never typed as a literal "3", so adding a fifth rank cannot leave a stale "/3" behind.
const SEASON_JOURNEYS = SEASON_RANKS[SEASON_RANKS.length - 1].minJourneys

function isSeasonRank(value: RankBadgeRank): value is SeasonRank {
  return (RANK_ORDER as readonly string[]).includes(value)
}

// The runnable membership test for the spectrum. Typed as `Record<RankKey, true>` on
// purpose: it cannot drift from the `RankKey` union, because dropping a key or adding one
// the union does not have fails `tsc`. Colour VALUES still live only in globals.css.
const SPECTRUM: Record<RankKey, true> = {
  stone: true, clay: true, gold: true, olive: true, jade: true,
  teal: true, slate: true, indigo: true, plum: true, rose: true,
}

function isRankKey(value: RankBadgeRank): value is RankKey {
  return Object.prototype.hasOwnProperty.call(SPECTRUM, value)
}

export type RankBadgeProps = Omit<HTMLAttributes<HTMLSpanElement>, 'children' | 'color'> & {
  /** A season rank (`ghost` · `initiate` · `adept` · `master`) or a spectrum colour key
   *  (`stone` · `clay` · `gold` · `olive` · `jade` · `teal` · `slate` · `indigo` · `plum` · `rose`).
   *  Season ranks map through `RANK_TO_KEY`, so the ladder's colours stay in ONE place. */
  rank?: RankBadgeRank
  /** Override the label. Defaults to the canonical rank name (`RANK_LABELS`) or the
   *  capitalised colour key. */
  children?: ReactNode
  /** Append the honest completion read ("2/3"). Season ranks only — a spectrum colour has
   *  no ladder position. Use it on the Quest home, not in a feed row (DAWN RankBadge). */
  showStep?: boolean
  /** The `.rank-dot` the CSS primitive documents. On by default; turn it off where the
   *  chip sits inside a dense row that already carries a colour cue. */
  dot?: boolean
  size?: RankBadgeSize
}

export function RankBadge({
  rank = 'ghost',
  children,
  showStep = false,
  dot = true,
  size = 'md',
  className,
  ...props
}: RankBadgeProps) {
  const season = isSeasonRank(rank)
  // Season ranks resolve through the single canonical mapping; a spectrum key is already
  // one. DAWN's reference falls back to `gold` on an unknown value — we fall back to
  // `stone` instead, deliberately: rank values arrive from a DB enum, and a value the
  // mapping does not know yet must never render as a HIGHER rank than the member earned.
  const key: RankKey = season ? RANK_TO_KEY[rank] : isRankKey(rank) ? rank : 'stone'

  const label =
    children ?? (season ? RANK_LABELS[rank] : String(rank).charAt(0).toUpperCase() + String(rank).slice(1))

  return (
    <span
      className={cn('rank-badge leading-tight', SIZE[size], className)}
      style={rankBadgeStyle(key)}
      {...props}
    >
      {dot && <span className="rank-dot" aria-hidden />}
      {label}
      {showStep && season && (
        // The counter law (DAWN §"Counters and streaks"): a number a member reads is mono +
        // tabular so the digits do not jitter as the rank climbs. A zero here (Ghost, 0/3) is
        // MUTED — the chip's own rank colour at 70% — never red. Ghost is a status, not a fault.
        <span className="font-mono tabular-nums opacity-70">
          {getRankDef(rank).minJourneys}/{SEASON_JOURNEYS}
        </span>
      )}
    </span>
  )
}
