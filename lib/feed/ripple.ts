// The "ripple" math (Resonance Feed Phase 2, ADR-416 →
// docs/RESONANCE-FEED-ARCHITECTURE.md §4 + §5). Pure, deterministic, unit-tested:
// given a cell's density, decide (a) the member's local-activity STATE — is their
// corner alive, empty (be a founder), or do they have no location yet — and (b) the
// EFFECTIVE feed radius after the ripple expands outward when the area is sparse.
//
// No IO here; the server seam (lib/feed/density.ts) reads the cell and the profile
// and calls these.

export interface CellDensity {
  activeMembers: number
  recentPosts: number
  recentEvents: number
  recentCircles: number
  /** The rollup's composite score in [0, 1]. */
  densityScore: number
}

export type LocalActivityState = 'no-location' | 'founder' | 'active'

// The widest the ripple ever opens the radius (x the member's base), reached as the
// local cell approaches empty. A dense cell keeps the member's chosen radius (x1).
export const MAX_RIPPLE_FACTOR = 8

// Below this composite score, AND with no standing circle or upcoming event in the
// cell, the corner reads as "nobody here yet" -> the founder prompt.
export const FOUNDER_DENSITY_THRESHOLD = 0.1

/**
 * The local-activity state for a member.
 *  - hasLocation false                      -> 'no-location' (nudge them to turn it on)
 *  - empty corner (sparse + no anchors)     -> 'founder' (be the first here)
 *  - otherwise                              -> 'active' (show the closest activity)
 * A null density (no rollup row for the cell) counts as empty.
 */
export function localActivityState(hasLocation: boolean, density: CellDensity | null): LocalActivityState {
  if (!hasLocation) return 'no-location'
  if (!density) return 'founder'
  const anchored = density.recentCircles > 0 || density.recentEvents > 0
  const peopled = density.activeMembers >= 3
  if (density.densityScore < FOUNDER_DENSITY_THRESHOLD && !anchored && !peopled) return 'founder'
  return 'active'
}

/**
 * The effective feed radius after the ripple. The emptier the local cell, the wider
 * we cast so the feed is never empty; a fully-alive cell keeps the member's chosen
 * radius. Linear in (1 - densityScore): factor 1 at density 1, MAX_RIPPLE_FACTOR at
 * density 0. A null density (unknown / empty) opens to the max. Always >= base.
 */
export function rippleRadiusM(baseRadiusM: number, density: CellDensity | null): number {
  const base = Math.max(1, baseRadiusM)
  const score = density ? Math.min(1, Math.max(0, density.densityScore)) : 0
  const factor = 1 + (1 - score) * (MAX_RIPPLE_FACTOR - 1)
  return Math.round(base * factor)
}
