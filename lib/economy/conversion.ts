// Zap → Gem rollover rates (the code mirror of the DB authority).
//
// At season end, a member's Zaps roll into Gems via a rank-based ladder: the higher
// the season rank, the more favourable the divisor (fewer Zaps per Gem). These values
// are expressed in DIVISOR form — Gems earned = floor(zaps / ZAP_TO_GEM_RATES[rank]).
//
// The authoritative copy lives in the DB (reset_season); this const is the client-side
// mirror so rollover/preview UI never inlines a rate. See docs/NAMING.md §Economy.
//
// PROVISIONAL: pending economy tuning. Expected to change. Do not build logic that
// assumes parity between Zaps and Gems.

import type { SeasonRank } from '@/lib/season-ranks'

export const ZAP_TO_GEM_RATES: Record<SeasonRank, number> = {
  ghost: 5,
  echo: 5,
  signal: 4,
  beacon: 3,
  conduit: 2,
  luminary: 1.5,
}
