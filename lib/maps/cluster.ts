// DENSITY HANDLING FOR THE MAP SEAM — one pure algorithm, both engines (ADR-1022).
//
// The requirement, in the owner's words: "if an area is dense, it only shows what's super
// close by". Zoom out over a city and forty overlapping pins become one bubble reading 40;
// zoom in and the bubble splits until every pin stands alone.
//
// 🔴 WHY THIS IS OURS AND NOT THE ENGINE'S. The two engines have incompatible clustering
// stories, and adopting both would have put the seam's central promise at risk:
//
//   • MapLibre clusters inside a GeoJSON *source* (`cluster: true`), which means the pins stop
//     being DOM markers and become style layers — a different popup story, a different click
//     story, a `load`-gated lifecycle, and cluster geometry produced by supercluster.
//   • Google ships no clustering at all. It is a separate library (@googlemaps/markerclusterer)
//     with its own grid algorithm, its own defaults, and its own weight against a build budget
//     already at ~5.7 GB of an 8 GB ceiling (docs/DEPLOY-SAFETY.md §1).
//
// Two implementations means two behaviours, and the one that drifts is the FALLBACK — the
// engine nobody with a Google key ever looks at. That is the silent-degrade failure
// docs/DEPLOY-SAFETY.md rule 6 names: a fail-safe with no gate that notices it fired. So the
// grouping is computed here, once, from the pins and the zoom, and each canvas only draws what
// this function returns. Parity is a property of the code, not a promise in a comment.
//
// PURE ON PURPOSE: no React, no DOM, no map library, no import of either canvas. Testable as
// arithmetic (lib/maps/cluster.test.ts), and free of weight for anything that imports it.

export type MapClusterOptions = {
  /** Pins closer together than this on SCREEN merge. Pixels, at the current zoom. */
  radiusPx?: number
  /** At or above this zoom nothing clusters, so a member can always reach an individual pin. */
  maxZoom?: number
  /** SCAN-918: pins on the SAME coordinate (a city-centre fallback: ~93 Encinitas events on one
   *  point) become one "general area" group that never splits, at any zoom and even with clustering
   *  off, because no zoom can separate them. Pins with a location of their own never move. */
  coLocated?: boolean
  /** SCAN-918: after grouping, any two badges whose discs would sit closer than this many pixels
   *  (edge to edge, sized by `clusterStepDiameterPx`) merge, so badges never overlap. */
  minSpacingPx?: number
}

export const CLUSTER_DEFAULTS = {
  /** ~2x a marker's footprint: close enough that merged pins really were overlapping. */
  radiusPx: 56,
  /** Street level. Past here "super close by" is the literal truth, so show every pin. */
  maxZoom: 15,
} as const

/** What the Frequency maps cluster with (SCAN-918): a wider radius than DAWN's, co-located pins held
 *  as one area, and a minimum gap between badges. A caller's own options still win. */
export const FREQUENCY_CLUSTER_OPTIONS = { radiusPx: 72, coLocated: true, minSpacingPx: 6 } as const

/** Diameter of the Frequency pin, for the spacing pass (lib/maps/pin-kinds.ts FREQUENCY_PIN). */
const SPACING_PIN_PX = 16

/** How far a cluster tap zooms in. Two levels quarters the area, which reliably splits a
 *  bubble without teleporting the member out of the neighbourhood they were looking at. */
export const CLUSTER_ZOOM_STEP = 2

/** Both engines refuse to zoom past this, so a cluster tap can never walk off the end. */
export const MAX_MAP_ZOOM = 20

/** Below this much zoom change the grouping cannot visibly differ, so both engines skip the
 *  rebuild. Without it a single pinch fires dozens of full marker teardowns. */
export const CLUSTER_ZOOM_EPSILON = 0.05

/** Web Mercator tile size. 512 matches MapLibre's vector tiles; the constant only has to be
 *  the SAME on both engines, since `radiusPx` is interpreted against it. */
const TILE_PX = 512

export type ClusterPoint = {
  lat: number
  lng: number
  /**
   * How many MORE things this one point already stands for, beyond itself.
   *
   * A repeating event is one gathering on many dates. lib/nearby/map-pins.ts folds the series to a
   * single pin (lib/events/series.ts), so the extra dates no longer exist as points to cluster, but
   * the member still has to be told they are there. `moreCount` is how a point carries "and there
   * is more behind me" into the grouping, and it is what turns a bubble's label from `1` into `1+`.
   *
   * Zero, null and undefined all mean "this point is exactly one thing".
   */
  moreCount?: number | null
}

/** Does this point stand for more than itself? One predicate, so the engines and the label agree. */
function hasMore(point: ClusterPoint): boolean {
  return typeof point.moreCount === 'number' && point.moreCount > 0
}

/** What a canvas draws: either one pin, or one bubble standing for several.
 *
 *  🔴 A bubble can hold a COUNT OF ONE. That is not a degenerate case to guard against, it is the
 *  repeating-event case: one event, more dates behind it, drawn as `1+`. The consequence both
 *  engines must honour is that a single-point bubble opens that point's popup instead of zooming,
 *  because there is nothing to split and a zoom would just walk the member away from the answer. */
type ClusterGroup<T extends ClusterPoint> =
  | { type: 'pin'; lat: number; lng: number; point: T }
  | {
      type: 'cluster'
      lat: number
      lng: number
      /** Distinct points inside. Never the number of DATES; a series counts once. */
      count: number
      /** At least one point inside stands for more than itself, so the label takes a `+`. */
      plus: boolean
      /** SCAN-918: every point inside shares ONE coordinate (a city-centre fallback), so no zoom can
       *  split it. Both engines open a list of what is there instead of zooming. */
      area: boolean
      points: T[]
    }

/** The coordinate key two pins must share to count as co-located. Six decimals is ~10 cm. */
function coordKey(p: ClusterPoint): string {
  return `${p.lat.toFixed(6)},${p.lng.toFixed(6)}`
}

/** Project to world pixels at `zoom`. Screen distance, not ground distance, is what decides
 *  whether two pins overlap — two pins 200 m apart collide in a city view and not in a
 *  street view, and the member only ever perceives the pixels. */
function project(lat: number, lng: number, zoom: number): [number, number] {
  const scale = TILE_PX * 2 ** zoom
  const x = ((lng + 180) / 360) * scale
  // Clamp before the log so the poles cannot produce Infinity.
  const s = Math.min(Math.max(Math.sin((lat * Math.PI) / 180), -0.9999), 0.9999)
  const y = (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * scale
  return [x, y]
}

/**
 * Group pins by screen proximity at a given zoom.
 *
 * Greedy, in input order, over a spatial hash whose cell is the cluster radius — so only the
 * nine cells around a seed are ever examined and the cost stays near-linear. Greedy beats a
 * plain grid bucket here because grid buckets split two pins that sit either side of a cell
 * boundary, which reads as a bug ("why are those two separate?") at exactly the density this
 * feature exists for.
 *
 * DETERMINISTIC: same pins, same zoom, same options ⇒ identical output, in the same order.
 * That is what lets both engines render from it and be relied on to agree.
 *
 * Every input point appears exactly once in the output, either as its own `pin` group or
 * inside exactly one `cluster`.
 */
export function clusterPoints<T extends ClusterPoint>(
  points: readonly T[],
  zoom: number,
  options: MapClusterOptions = {},
): ClusterGroup<T>[] {
  const radiusPx = options.radiusPx ?? CLUSTER_DEFAULTS.radiusPx
  const maxZoom = options.maxZoom ?? CLUSTER_DEFAULTS.maxZoom
  const z = Number.isFinite(zoom) ? zoom : 0

  if (points.length === 0) return []

  // UNITS: what the grouping moves around. One point each, unless `coLocated` asks for pins on the
  // same coordinate to travel together (SCAN-918), in input order of their first member. Without the
  // option every unit is one point, so DAWN's grouping is unchanged.
  const units: T[][] = []
  if (options.coLocated) {
    const byKey = new Map<string, T[]>()
    for (const p of points) {
      const key = coordKey(p)
      const unit = byKey.get(key)
      if (unit) unit.push(p)
      else {
        const fresh = [p]
        byKey.set(key, fresh)
        units.push(fresh)
      }
    }
  } else for (const p of points) units.push([p])

  const group = (members: T[]): ClusterGroup<T> => {
    // ONE point, on its own. A plain pin, unless it stands for more than itself, in which case it is
    // a bubble of one so the `+` has somewhere to render. This runs on the zoomed-in path too: a
    // repeating event still has its other dates at street level, so the `+` must survive the zoom.
    if (members.length === 1) {
      const p = members[0]!
      return hasMore(p)
        ? { type: 'cluster', lat: p.lat, lng: p.lng, count: 1, plus: true, area: false, points: [p] }
        : { type: 'pin', lat: p.lat, lng: p.lng, point: p }
    }
    // The bubble sits at the members' mean position, not on the seed, so it does not look
    // pinned to whichever pin happened to come first in the array.
    const lat = members.reduce((sum, p) => sum + p.lat, 0) / members.length
    const lng = members.reduce((sum, p) => sum + p.lng, 0) / members.length
    const key = coordKey(members[0]!)
    return {
      type: 'cluster',
      lat,
      lng,
      // The count is DISTINCT THINGS, and the `+` carries the rest. A bubble that added the hidden
      // dates into its number would say "12" for what a member would find is three events, which is
      // the exact overcount this whole change exists to remove.
      count: members.length,
      plus: members.some(hasMore),
      area: Boolean(options.coLocated) && members.every((p) => coordKey(p) === key),
      points: members,
    }
  }

  // Zoomed in far enough, or clustering switched off by a zero radius: one marker per unit.
  if (z >= maxZoom || radiusPx <= 0) return units.map(group)

  const xy = units.map((u) => project(u[0]!.lat, u[0]!.lng, z))
  const cellOf = (v: number) => Math.floor(v / radiusPx)

  // Spatial hash: cell key -> indices of the units in it.
  const cells = new Map<string, number[]>()
  for (let i = 0; i < units.length; i++) {
    const key = `${cellOf(xy[i]![0])}:${cellOf(xy[i]![1])}`
    const bucket = cells.get(key)
    if (bucket) bucket.push(i)
    else cells.set(key, [i])
  }

  const taken = new Array<boolean>(units.length).fill(false)
  const grouped: T[][] = []

  for (let i = 0; i < units.length; i++) {
    if (taken[i]) continue
    taken[i] = true
    const [sx, sy] = xy[i]!
    const members: T[] = [...units[i]!]

    const cx = cellOf(sx)
    const cy = cellOf(sy)
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (const j of cells.get(`${cx + dx}:${cy + dy}`) ?? []) {
          if (taken[j]) continue
          const [ox, oy] = xy[j]!
          if (Math.hypot(ox - sx, oy - sy) <= radiusPx) {
            taken[j] = true
            members.push(...units[j]!)
          }
        }
      }
    }
    grouped.push(members)
  }

  if (options.minSpacingPx != null && options.minSpacingPx >= 0) spaceOut(grouped, z, options.minSpacingPx)
  return grouped.map(group)
}

/**
 * Merge any two groups whose discs would overlap or sit closer than `gap` pixels (SCAN-918). Greedy
 * leaves bubble CENTRES a radius apart, but a big badge is wider than that, so a 99+ could still sit
 * on a 6+. Deterministic (pairs in order, first merge wins, then rescan) and cheap: it runs over
 * groups, not pins, and there are at most a few dozen on screen.
 */
function spaceOut<T extends ClusterPoint>(groups: T[][], zoom: number, gap: number): void {
  const centre = (g: T[]) =>
    project(g.reduce((s, p) => s + p.lat, 0) / g.length, g.reduce((s, p) => s + p.lng, 0) / g.length, zoom)
  const size = (g: T[]) => (g.length === 1 && !hasMore(g[0]!) ? SPACING_PIN_PX : clusterStepDiameterPx(g.length))
  let merged = true
  let guard = groups.length
  while (merged && guard-- > 0) {
    merged = false
    outer: for (let i = 0; i < groups.length; i++) {
      const [ax, ay] = centre(groups[i]!)
      for (let j = i + 1; j < groups.length; j++) {
        const [bx, by] = centre(groups[j]!)
        if (Math.hypot(ax - bx, ay - by) < (size(groups[i]!) + size(groups[j]!)) / 2 + gap) {
          groups[i]!.push(...groups[j]!)
          groups.splice(j, 1)
          merged = true
          break outer
        }
      }
    }
  }
}

/** Where a cluster tap takes the view. Shared so a tap behaves identically on both engines. */
export function zoomIntoCluster(currentZoom: number): number {
  const from = Number.isFinite(currentZoom) ? currentZoom : 0
  return Math.min(from + CLUSTER_ZOOM_STEP, MAX_MAP_ZOOM)
}

/** Whether a zoom change is worth rebuilding markers for. Both engines gate on this. */
export function shouldRecluster(previousZoom: number, nextZoom: number): boolean {
  if (!Number.isFinite(previousZoom) || !Number.isFinite(nextZoom)) return true
  return Math.abs(nextZoom - previousZoom) >= CLUSTER_ZOOM_EPSILON
}

/** The count printed in the bubble. Capped so a big number cannot outgrow the circle.
 *
 *  `plus` appends the `+` that means "and more behind this". Over 99 the cap already ends in `+`,
 *  so `99++` is never produced. `1+` is the repeating-event case and reads exactly as the owner
 *  asked for it (2026-08-13): one event at this spot, more dates behind it. */
export function clusterLabel(count: number, plus = false): string {
  if (count > 99) return '99+'
  return plus ? `${count}+` : String(count)
}

/** Bubble diameter in CSS pixels, growing with the square root of the count so area, not
 *  width, tracks how many pins are inside. Both engines size from this one curve. */
export function clusterDiameterPx(count: number): number {
  const n = Math.max(2, Math.min(count, 999))
  return Math.round(Math.min(26 + Math.sqrt(n) * 3.2, 60))
}

/** The Frequency badge's diameter (SCAN-918): three plain steps, small under 10, medium under 50,
 *  large above, so a badge's size reads at a glance instead of creeping by a pixel per pin. */
export function clusterStepDiameterPx(count: number): number {
  if (count < 10) return 32
  if (count < 50) return 40
  return 50
}

/** The bubble's accessible name and tooltip. Plain sentences, no em dashes
 *  (docs/CONTENT-VOICE.md). Shared so a screen reader hears the same thing on both engines.
 *
 *  🔴 THE SINGLE-POINT BUBBLE GETS ITS OWN SENTENCE, and it has to. "1 nearby. Zoom in to see each
 *  one." is an instruction that does nothing: there is nothing to split, and a zoom would walk the
 *  member away from the thing they just found. The bubble opens the popup instead, so the label
 *  says so. */
export function clusterAccessibleLabel(count: number, plus = false): string {
  if (count === 1) return 'One place here, on more than one date. Open it to see the dates.'
  if (plus) return `${count} nearby, some on more than one date. Zoom in to see each one.`
  return `${count} nearby. Zoom in to see each one.`
}
