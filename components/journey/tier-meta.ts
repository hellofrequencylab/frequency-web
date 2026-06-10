// Shared, presentational metadata for the three intensity tiers (docs/JOURNEYS.md §5).
// Initiate ⚡ / Adept 🌊 / Master 🏔️. Tier never affects Zap or streak math — it only
// changes WHAT the member does, so this is purely display text + a glyph. Token-based
// colors only (no hex). Client + server safe (no imports, no hooks).

import type { IntensityTier } from '@/lib/journey-tiers'

export interface TierMeta {
  tier: IntensityTier
  label: string
  glyph: string
  /** One-line "what this depth means" used in tooltips / the override control. */
  blurb: string
}

export const TIER_META: Record<IntensityTier, TierMeta> = {
  initiate: { tier: 'initiate', label: 'Initiate', glyph: '⚡', blurb: 'Minimum viable — the worst-day version.' },
  adept: { tier: 'adept', label: 'Adept', glyph: '🌊', blurb: 'Standard. The default depth.' },
  master: { tier: 'master', label: 'Master', glyph: '🏔️', blurb: 'Full expression — the deepest take.' },
}

export const TIER_ORDER: readonly IntensityTier[] = ['initiate', 'adept', 'master']

/** "12 min" / "5–10 min" → a short, human estimate. Null when the tier carries none. */
export function formatMinutes(min: number | null | undefined): string | null {
  if (min == null || min <= 0) return null
  return `${min} min`
}
