// Intensity tiers (ADR-198; docs/JOURNEYS.md §5). The selected version of a practice —
// Initiate / Adept / Master — resolves most-specific-first. Pure + framework-independent, so
// it's the natural unit-test target (journey-tiers.test.ts). Tier never affects Zap or
// streak math; it only chooses which practice content the member sees and does.

export type IntensityTier = 'initiate' | 'adept' | 'master'

export const INTENSITY_TIERS: readonly IntensityTier[] = ['initiate', 'adept', 'master'] as const

/** The default when nothing else is set — the standard form. */
export const DEFAULT_TIER: IntensityTier = 'adept'

/**
 * Resolve the tier a member sees for a step, most-specific-first:
 *   member override → circle default → item default → 'adept'.
 * Any level may be null/undefined (not set); the first set value wins.
 */
export function resolveTier(
  memberOverride: IntensityTier | null | undefined,
  circleDefault: IntensityTier | null | undefined,
  itemDefault: IntensityTier | null | undefined,
): IntensityTier {
  return memberOverride ?? circleDefault ?? itemDefault ?? DEFAULT_TIER
}

/** Type guard for untrusted input (form values, JSON from page_config, etc.). */
export function isIntensityTier(value: unknown): value is IntensityTier {
  return value === 'initiate' || value === 'adept' || value === 'master'
}
