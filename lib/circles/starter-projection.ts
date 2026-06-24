// Starter Circles — per-viewer virtual projection.
//
// The 12 Starter Circle templates are surfaced on the circles directory + map as
// VIRTUAL entries scattered within ~10 miles of each viewer, so a member anywhere
// sees startable Circles near them. These are NOT rows in `circles`: they are
// computed at render time from `circle_templates`, never persisted (you can't
// store a per-viewer position on a shared row), and gated by the
// `circle_templates_enabled` master flag. Placement is STABLE per viewer (seeded),
// so the markers don't teleport on every refresh. Clicking one opens a
// circle-style preview at /circles/starter/<slug> with the Remix ("Claim this
// circle") action — they are clearly badged as Starters to start, not faked as
// real circles with members.

import type { PillarSlug } from '@/lib/pillars'
import type { CircleTemplate } from './templates'

/** A projected virtual Starter Circle for one viewer. The page maps this onto its
 *  own card/marker shapes; nothing here is stored. */
export interface StarterProjection {
  /** Stable synthetic id (not a real circle id) — `starter-<slug>`. */
  id: string
  templateId: string
  /** Template slug; the card/marker links to /circles/starter/<slug>. */
  slug: string
  name: string
  /** The skeptic-proof hook (card copy). */
  card: string
  oneLiner: string
  primaryPillar: PillarSlug
  lat: number
  lng: number
}

const DEFAULT_RADIUS_MILES = 10
const MILES_PER_DEG_LAT = 69.0

// ── Deterministic seeded RNG (mulberry32) ────────────────────────────
// Stable placement: same viewer + template => same spot across refreshes.
function hashSeed(s: string): number {
  let h = 2166136261 >>> 0
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return function next(): number {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** A point uniformly distributed inside the disk of `maxMiles` around (lat,lng).
 *  `u`,`v` are two seeded randoms in [0,1). r = R*sqrt(u) gives uniform area. */
function offsetWithinRadius(
  lat: number,
  lng: number,
  maxMiles: number,
  u: number,
  v: number,
): { lat: number; lng: number } {
  const r = maxMiles * Math.sqrt(u)
  const theta = 2 * Math.PI * v
  const dLat = (r * Math.cos(theta)) / MILES_PER_DEG_LAT
  const cosLat = Math.cos((lat * Math.PI) / 180) || 1e-6
  const dLng = (r * Math.sin(theta)) / (MILES_PER_DEG_LAT * cosLat)
  return { lat: lat + dLat, lng: lng + dLng }
}

export interface ProjectInput {
  templates: CircleTemplate[]
  /** The viewer's location to scatter around. */
  viewer: { lat: number; lng: number }
  /** Stable per-viewer seed (e.g. profile id, else a rounded-location string),
   *  so positions persist for a viewer but differ between viewers. */
  seedKey: string
  radiusMiles?: number
}

/** Project the active templates as virtual circles scattered near the viewer.
 *  Deterministic given the same (seedKey, viewer rounding, templates). */
export function projectStarterCircles(input: ProjectInput): StarterProjection[] {
  const radius = input.radiusMiles ?? DEFAULT_RADIUS_MILES
  // Round the viewer location into the seed so tiny GPS jitter doesn't reshuffle
  // placements, while different cities still differ.
  const locKey = `${input.viewer.lat.toFixed(2)},${input.viewer.lng.toFixed(2)}`
  return input.templates.map((t) => {
    const rand = mulberry32(hashSeed(`${input.seedKey}|${locKey}|${t.id}`))
    const { lat, lng } = offsetWithinRadius(input.viewer.lat, input.viewer.lng, radius, rand(), rand())
    return {
      id: `starter-${t.slug}`,
      templateId: t.id,
      slug: t.slug,
      name: t.name,
      card: t.card,
      oneLiner: t.oneLiner,
      primaryPillar: t.primaryPillar,
      lat,
      lng,
    }
  })
}
