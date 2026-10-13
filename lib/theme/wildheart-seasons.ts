// THE WILDHEART SEASON TABLE, as a leaf. lib/theme/wildheart.ts re-exports it, so every reader of the
// theme is unchanged. It lives apart because the sky engine (lib/theme/astrology-wheel.ts) reads the
// season names from the client islands (the sky map, the year journey), and the theme module reaches
// lib/spaces/accent, then lib/theme/validate, then zod: 382 KB on the front door's first load, which
// the shell-weight gate refused on 2026-10-13. A leaf with no imports keeps the sky engine's client
// graph at the glyphs and these four rows.
import type { MensworkSeason } from '@/lib/theme/menswork'

export type WildheartSeason = MensworkSeason

/** The four seasons, shared with Bold as fill / ink pairs: the fill for chips, tracks and shapes, the ink
 *  for season text on light grounds, the night ink for season text on Nightshade grounds, the top stop for
 *  the season gradient. Each season's name and theme line are the theme's, not a program's. */
export const WILDHEART_SEASONS: Record<WildheartSeason, { name: string; theme: string; fill: string; top: string; ink: string; inkNight: string; gradient: string }> = {
  winter: { name: 'Winter', theme: 'Rest and root', fill: '#A3AEDC', top: '#C4CBEA', ink: '#46518A', inkNight: '#B9C2EC', gradient: 'linear-gradient(160deg,var(--wh-season-winter-top) 0%,var(--wh-season-winter) 100%)' },
  spring: { name: 'Spring', theme: 'Rise', fill: '#9DBA86', top: '#C0D4AF', ink: '#4C6B37', inkNight: '#B6CFA0', gradient: 'linear-gradient(160deg,var(--wh-season-spring-top) 0%,var(--wh-season-spring) 100%)' },
  summer: { name: 'Summer', theme: 'Bloom', fill: '#D8B35E', top: '#E8CF94', ink: '#7A5A16', inkNight: '#E6C87A', gradient: 'linear-gradient(160deg,var(--wh-season-summer-top) 0%,var(--wh-season-summer) 100%)' },
  fall: { name: 'Fall', theme: 'Wild', fill: '#CC8B74', top: '#E2B4A2', ink: '#8A4630', inkNight: '#E3A68F', gradient: 'linear-gradient(160deg,var(--wh-season-fall-top) 0%,var(--wh-season-fall) 100%)' },
}

export const WILDHEART_SEASON_ORDER: readonly WildheartSeason[] = ['winter', 'spring', 'summer', 'fall']
