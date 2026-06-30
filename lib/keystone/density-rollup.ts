// Keystone density rollup — the COLD-START SOLVER's read model (Growth OS Engine 8,
// GE8-1, docs/GROWTH-OS-BUILD-PLAN.md §5 E8). Pure, deterministic, unit-tested.
//
// The per-geocell `resonance_density_cells` rows (the fuzzed ~1.1km activity rollup,
// ADR-416) answer "how alive is THIS cell?" for the adaptive-radius feed. The keystone
// asks two BIGGER questions, and this module answers both from the SAME cells, with no
// new storage:
//
//   1. Is a LOCALITY warm enough to seed?  -> `seedReadiness(cells)` rolls the cells
//      that make up one locality into a single 'empty' | 'seeding' | 'warm' | 'live'
//      signal, so the founder-bootstrap prompt (GE8-4) knows whether a would-be host is
//      landing in an empty room (seed it) or a place that already has a pulse.
//
//   2. Where IS the density, by city?  -> `rollupByCity(cells)` clusters the fuzzed
//      cells into city-sized buckets and ranks them, for the admin density-by-city read
//      (the Keystone density dashboard's input).
//
// PRIVACY (cardinal rule, inherited from the cells): every input is keyed to the FUZZED
// geocell, counts only, never a raw coordinate and never an identity. A city bucket is a
// COARSENED fuzzed cell (rounded to ~11km), so it is even less precise than the cell it
// came from; it can never be reversed into "who is home." k-anonymity: a bucket below
// MIN_CITY_MEMBERS is still ranked (operators need to see thin localities to seed them)
// but carries `belowAnonymityFloor`, so a surface can withhold a precise head count.
//
// No IO here; the server seam (lib/keystone/store.ts) reads the cells and calls these.

/** One fuzzed-geocell activity row, the shape `resonance_density_cells` stores. */
export interface DensityCell {
  geocellLat: number
  geocellLng: number
  activeMembers: number
  recentPosts: number
  recentEvents: number
  recentCircles: number
  /** The rollup's composite score in [0, 1] for this single cell. */
  densityScore: number
}

// ── Seed readiness (the per-locality "warm enough to seed?" signal) ──────────────

export type SeedReadiness = 'empty' | 'seeding' | 'warm' | 'live'

/**
 * A locality's seed signal, rolled up from every cell that makes it up.
 *  - 'empty'   — nothing here yet. The clearest founder opportunity: seed the first thing.
 *  - 'seeding' — a spark (a few people, or one post) but no standing anchor. Still wants a
 *                founder to plant the first circle/event.
 *  - 'warm'    — an anchor exists (a circle or an upcoming event) but it is not yet busy.
 *                A founder still helps; nobody lands in an empty room.
 *  - 'live'    — a real pulse (multiple anchors / enough people). No founder prompt needed.
 */
export interface SeedSignal {
  readiness: SeedReadiness
  activeMembers: number
  anchors: number // standing circles + upcoming events
  recentPosts: number
  /** The locality's blended density in [0, 1] (the max over its cells, the alive-est corner). */
  peakDensity: number
  cells: number
}

// An anchor (a standing circle or an upcoming event) is the difference between "warm"
// and merely "seeding": one real, joinable thing means nobody lands in an empty room.
// Below this many members AND no anchor, a locality is still a founder opportunity.
export const WARM_MIN_MEMBERS = 3

// A locality reads 'live' (needs no founder prompt) once it has multiple anchors OR a
// healthy crowd. Tuned to match the feed's "this corner is alive" bar (ripple.ts).
export const LIVE_MIN_ANCHORS = 2
export const LIVE_MIN_MEMBERS = 8

/**
 * Roll a locality's cells into one seed signal. Empty input (no cells rolled up for the
 * locality) is the strongest 'empty' — the canonical cold start.
 */
export function seedReadiness(cells: readonly DensityCell[]): SeedSignal {
  const activeMembers = sum(cells, (c) => c.activeMembers)
  const anchors = sum(cells, (c) => c.recentCircles + c.recentEvents)
  const recentPosts = sum(cells, (c) => c.recentPosts)
  const peakDensity = cells.reduce((m, c) => Math.max(m, clamp01(c.densityScore)), 0)

  let readiness: SeedReadiness
  if (anchors >= LIVE_MIN_ANCHORS || activeMembers >= LIVE_MIN_MEMBERS) {
    readiness = 'live'
  } else if (anchors >= 1) {
    // One anchor but not yet busy: warm, still worth a founder's help.
    readiness = 'warm'
  } else if (activeMembers >= WARM_MIN_MEMBERS || recentPosts > 0) {
    // A spark of people/chatter but no standing anchor to join: seed the first one.
    readiness = 'seeding'
  } else {
    readiness = 'empty'
  }

  return { readiness, activeMembers, anchors, recentPosts, peakDensity, cells: cells.length }
}

/** True when a locality wants a founder-bootstrap prompt (it has no real pulse yet). */
export function wantsFounder(signal: SeedSignal): boolean {
  return signal.readiness !== 'live'
}

// ── Density by city (the admin read) ─────────────────────────────────────────────

// How coarse a "city" bucket is. The fuzzed cells are ~1.1km (2 decimal places); we
// coarsen to ~11km (1 decimal place) so a city's worth of cells group together. Still a
// FUZZED, count-only bucket — coarser than the cell, never a raw coordinate.
export const CITY_GRID_DECIMALS = 1

// Below this many active members, a city bucket renders without a precise head count
// (k-anonymity): operators still see the locality exists (so they can seed it), but the
// exact thin number is withheld at the surface via `belowAnonymityFloor`.
export const MIN_CITY_MEMBERS = 5

export interface CityDensity {
  /** A stable key for the city bucket (the coarsened lat,lng). */
  key: string
  /** The bucket centroid (coarsened fuzzed cell) — for a label / map pin, never precise. */
  centerLat: number
  centerLng: number
  activeMembers: number
  recentPosts: number
  recentEvents: number
  recentCircles: number
  anchors: number
  /** The city's seed readiness (the same signal, rolled over its cells). */
  readiness: SeedReadiness
  /** The alive-est cell's density in this city, in [0, 1]. */
  peakDensity: number
  cells: number
  /** True when activeMembers is below MIN_CITY_MEMBERS — withhold a precise count. */
  belowAnonymityFloor: boolean
}

/** Coarsen a fuzzed geocell to its city bucket key (rounded to CITY_GRID_DECIMALS). */
export function cityKey(geocellLat: number, geocellLng: number): string {
  return `${roundTo(geocellLat, CITY_GRID_DECIMALS)},${roundTo(geocellLng, CITY_GRID_DECIMALS)}`
}

/**
 * Cluster the fuzzed cells into city-sized buckets and rank them. Sorted busiest-first
 * by peak density, then by member count — the order an operator scans to decide where to
 * seed next vs. where a city is already self-sustaining. Empty input -> [].
 */
export function rollupByCity(cells: readonly DensityCell[]): CityDensity[] {
  const buckets = new Map<string, DensityCell[]>()
  for (const c of cells) {
    const key = cityKey(c.geocellLat, c.geocellLng)
    const bucket = buckets.get(key)
    if (bucket) bucket.push(c)
    else buckets.set(key, [c])
  }

  const cities: CityDensity[] = []
  for (const [key, bucketCells] of buckets) {
    const signal = seedReadiness(bucketCells)
    const [latStr, lngStr] = key.split(',')
    cities.push({
      key,
      centerLat: Number(latStr),
      centerLng: Number(lngStr),
      activeMembers: signal.activeMembers,
      recentPosts: signal.recentPosts,
      recentEvents: sum(bucketCells, (c) => c.recentEvents),
      recentCircles: sum(bucketCells, (c) => c.recentCircles),
      anchors: signal.anchors,
      readiness: signal.readiness,
      peakDensity: signal.peakDensity,
      cells: bucketCells.length,
      belowAnonymityFloor: signal.activeMembers < MIN_CITY_MEMBERS,
    })
  }

  return cities.sort((a, b) => b.peakDensity - a.peakDensity || b.activeMembers - a.activeMembers)
}

export interface KeystoneDensitySummary {
  cities: number
  /** Cities with a real pulse (readiness 'live'). */
  liveCities: number
  /** Cities that still want a founder (anything not 'live'). */
  seedableCities: number
  /** Cities that are genuinely empty (no people, no anchors). */
  emptyCities: number
  totalActiveMembers: number
  totalAnchors: number
}

/** The headline numbers for the admin density read, from the ranked city list. */
export function summarizeDensity(cities: readonly CityDensity[]): KeystoneDensitySummary {
  return {
    cities: cities.length,
    liveCities: cities.filter((c) => c.readiness === 'live').length,
    seedableCities: cities.filter((c) => c.readiness !== 'live').length,
    emptyCities: cities.filter((c) => c.readiness === 'empty').length,
    totalActiveMembers: sum(cities, (c) => c.activeMembers),
    totalAnchors: sum(cities, (c) => c.anchors),
  }
}

// ── small pure helpers ───────────────────────────────────────────────────────────

function sum<T>(xs: readonly T[], f: (x: T) => number): number {
  let total = 0
  for (const x of xs) total += f(x)
  return total
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n))
}

function roundTo(n: number, decimals: number): number {
  const f = 10 ** decimals
  return Math.round(n * f) / f
}
