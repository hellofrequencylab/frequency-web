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
}

export const CLUSTER_DEFAULTS = {
  /** ~2x a marker's footprint: close enough that merged pins really were overlapping. */
  radiusPx: 56,
  /** Street level. Past here "super close by" is the literal truth, so show every pin. */
  maxZoom: 15,
} as const

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

export type ClusterPoint = { lat: number; lng: number }

/** What a canvas draws: either one pin, or one bubble standing for several. */
export type ClusterGroup<T extends ClusterPoint> =
  | { type: 'pin'; lat: number; lng: number; point: T }
  | { type: 'cluster'; lat: number; lng: number; count: number; points: T[] }

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

  const alone = (p: T): ClusterGroup<T> => ({ type: 'pin', lat: p.lat, lng: p.lng, point: p })
  if (points.length === 0) return []
  // Zoomed in far enough, or clustering switched off by a zero radius: one marker per pin.
  if (z >= maxZoom || radiusPx <= 0) return points.map(alone)

  const xy = points.map((p) => project(p.lat, p.lng, z))
  const cellOf = (v: number) => Math.floor(v / radiusPx)

  // Spatial hash: cell key -> indices of the points in it.
  const cells = new Map<string, number[]>()
  for (let i = 0; i < points.length; i++) {
    const key = `${cellOf(xy[i]![0])}:${cellOf(xy[i]![1])}`
    const bucket = cells.get(key)
    if (bucket) bucket.push(i)
    else cells.set(key, [i])
  }

  const taken = new Array<boolean>(points.length).fill(false)
  const out: ClusterGroup<T>[] = []

  for (let i = 0; i < points.length; i++) {
    if (taken[i]) continue
    taken[i] = true
    const [sx, sy] = xy[i]!
    const members: number[] = [i]

    const cx = cellOf(sx)
    const cy = cellOf(sy)
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (const j of cells.get(`${cx + dx}:${cy + dy}`) ?? []) {
          if (taken[j]) continue
          const [ox, oy] = xy[j]!
          if (Math.hypot(ox - sx, oy - sy) <= radiusPx) {
            taken[j] = true
            members.push(j)
          }
        }
      }
    }

    if (members.length === 1) {
      out.push(alone(points[i]!))
      continue
    }
    // The bubble sits at the members' mean position, not on the seed, so it does not look
    // pinned to whichever pin happened to come first in the array.
    const memberPoints = members.map((m) => points[m]!)
    const lat = memberPoints.reduce((sum, p) => sum + p.lat, 0) / memberPoints.length
    const lng = memberPoints.reduce((sum, p) => sum + p.lng, 0) / memberPoints.length
    out.push({ type: 'cluster', lat, lng, count: memberPoints.length, points: memberPoints })
  }

  return out
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

/** The count printed in the bubble. Capped so a big number cannot outgrow the circle. */
export function clusterLabel(count: number): string {
  return count > 99 ? '99+' : String(count)
}

/** Bubble diameter in CSS pixels, growing with the square root of the count so area, not
 *  width, tracks how many pins are inside. Both engines size from this one curve. */
export function clusterDiameterPx(count: number): number {
  const n = Math.max(2, Math.min(count, 999))
  return Math.round(Math.min(26 + Math.sqrt(n) * 3.2, 60))
}

/** The bubble's accessible name and tooltip. Plain sentences, no em dashes
 *  (docs/CONTENT-VOICE.md). Shared so a screen reader hears the same thing on both engines. */
export function clusterAccessibleLabel(count: number): string {
  return `${count} nearby. Zoom in to see each one.`
}
