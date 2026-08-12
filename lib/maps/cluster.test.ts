import { describe, it, expect } from 'vitest'
import {
  CLUSTER_DEFAULTS,
  CLUSTER_ZOOM_EPSILON,
  CLUSTER_ZOOM_STEP,
  MAX_MAP_ZOOM,
  clusterAccessibleLabel,
  clusterDiameterPx,
  clusterLabel,
  clusterPoints,
  shouldRecluster,
  zoomIntoCluster,
  type ClusterPoint,
} from './cluster'

// The clustering behaviour BOTH engines render, asserted once (ADR-1022).
//
// This is the whole reason the algorithm is ours instead of each engine's: MapLibre clusters
// inside a GeoJSON source with supercluster, Google needs a separate library, and neither is
// observable from the other's tests. Grouping computed here is grouping that cannot drift —
// so these assertions are simultaneously the Google contract and the MapLibre contract, and
// components/maps/map-capabilities.test.ts proves both canvases actually call it.

/** A block of Manhattan. At zoom 12 these are a handful of pixels apart. */
const CLOSE: ClusterPoint[] = [
  { lat: 40.7128, lng: -74.006 },
  { lat: 40.7131, lng: -74.0062 },
  { lat: 40.7126, lng: -74.0058 },
]

/** Three different cities. Nothing merges these at a city zoom. */
const FAR: ClusterPoint[] = [
  { lat: 40.7128, lng: -74.006 }, // New York
  { lat: 41.8781, lng: -87.6298 }, // Chicago
  { lat: 34.0522, lng: -118.2437 }, // Los Angeles
]

describe('clusterPoints groups by what overlaps on screen', () => {
  it('merges pins that sit on top of each other', () => {
    const groups = clusterPoints(CLOSE, 12)
    expect(groups).toHaveLength(1)
    expect(groups[0]!.type).toBe('cluster')
    expect(groups[0]!.type === 'cluster' && groups[0]!.count).toBe(3)
  })

  it('leaves pins that are nowhere near each other alone', () => {
    const groups = clusterPoints(FAR, 12)
    expect(groups).toHaveLength(3)
    expect(groups.every((g) => g.type === 'pin')).toBe(true)
  })

  it('splits a cluster as the member zooms in, which is the whole feature', () => {
    // "If an area is dense, it only shows what's super close by." Same pins, more zoom, and
    // the bubble becomes the three pins it stood for.
    const wide = clusterPoints(CLOSE, 12)
    const close = clusterPoints(CLOSE, 17)
    expect(wide).toHaveLength(1)
    expect(close).toHaveLength(3)
    expect(close.every((g) => g.type === 'pin')).toBe(true)
  })

  it('stops clustering entirely at maxZoom, so every pin is always reachable', () => {
    // A pin that can never be separated from its neighbours is a pin nobody can open.
    const atMax = clusterPoints(CLOSE, CLUSTER_DEFAULTS.maxZoom)
    expect(atMax).toHaveLength(3)
    const justBelow = clusterPoints(CLOSE, CLUSTER_DEFAULTS.maxZoom - 0.01)
    expect(justBelow.length).toBeLessThan(3)
  })

  it('honours a caller radius', () => {
    // A zero radius is the explicit "never merge" that a picker or a single-venue map wants.
    expect(clusterPoints(CLOSE, 12, { radiusPx: 0 })).toHaveLength(3)
    // At a continental zoom the three cities are ~150-500px apart: separate at the default
    // radius, one bubble at a generous one.
    expect(clusterPoints(FAR, 3)).toHaveLength(3)
    expect(clusterPoints(FAR, 3, { radiusPx: 600 })).toHaveLength(1)
  })

  it('loses nothing: every pin appears exactly once', () => {
    const mixed = [...CLOSE, ...FAR]
    const groups = clusterPoints(mixed, 12)
    const seen = groups.flatMap((g) => (g.type === 'cluster' ? g.points : [g.point]))
    expect(seen).toHaveLength(mixed.length)
    expect(new Set(seen).size).toBe(mixed.length)
  })

  it('puts the bubble at the members mean position, not on whichever pin came first', () => {
    const groups = clusterPoints(CLOSE, 12)
    const g = groups[0]!
    expect(g.type).toBe('cluster')
    if (g.type !== 'cluster') return
    expect(g.lat).toBeCloseTo((40.7128 + 40.7131 + 40.7126) / 3, 6)
    expect(g.lng).toBeCloseTo((-74.006 + -74.0062 + -74.0058) / 3, 6)
  })

  it('is deterministic, which is what lets two engines rely on it', () => {
    const a = JSON.stringify(clusterPoints([...CLOSE, ...FAR], 11))
    const b = JSON.stringify(clusterPoints([...CLOSE, ...FAR], 11))
    expect(a).toBe(b)
  })

  it('survives empty input and a nonsense zoom instead of throwing at the member', () => {
    expect(clusterPoints([], 12)).toEqual([])
    expect(clusterPoints(CLOSE, Number.NaN)).toHaveLength(1)
  })

  it('keeps the caller payload on the point, so a click can find its pin', () => {
    const pins = CLOSE.map((p, i) => ({ ...p, id: `pin-${i}` }))
    const [group] = clusterPoints(pins, 12)
    expect(group!.type === 'cluster' && group!.points.map((p) => p.id)).toEqual([
      'pin-0',
      'pin-1',
      'pin-2',
    ])
  })
})

describe('the shared cluster interactions', () => {
  it('a cluster tap zooms in by a fixed step, capped', () => {
    expect(zoomIntoCluster(10)).toBe(10 + CLUSTER_ZOOM_STEP)
    expect(zoomIntoCluster(MAX_MAP_ZOOM)).toBe(MAX_MAP_ZOOM)
    expect(zoomIntoCluster(Number.NaN)).toBe(CLUSTER_ZOOM_STEP)
  })

  it('a tap always zooms past maxZoom eventually, so a bubble can always be opened', () => {
    let z = 3
    for (let i = 0; i < 20 && z < CLUSTER_DEFAULTS.maxZoom; i++) z = zoomIntoCluster(z)
    expect(z).toBeGreaterThanOrEqual(CLUSTER_DEFAULTS.maxZoom)
  })

  it('re-groups only when the zoom really moved', () => {
    // Without this guard one pinch fires dozens of full marker teardowns on both engines.
    expect(shouldRecluster(12, 12)).toBe(false)
    expect(shouldRecluster(12, 12 + CLUSTER_ZOOM_EPSILON / 2)).toBe(false)
    expect(shouldRecluster(12, 12 + CLUSTER_ZOOM_EPSILON)).toBe(true)
    expect(shouldRecluster(12, 11)).toBe(true)
    expect(shouldRecluster(Number.NaN, 12)).toBe(true)
  })
})

describe('the bubble reads the same on both engines', () => {
  it('prints the count, capped so it cannot outgrow the circle', () => {
    expect(clusterLabel(2)).toBe('2')
    expect(clusterLabel(99)).toBe('99')
    expect(clusterLabel(100)).toBe('99+')
  })

  it('grows with the count, and stops growing', () => {
    expect(clusterDiameterPx(3)).toBeLessThan(clusterDiameterPx(40))
    expect(clusterDiameterPx(5000)).toBeLessThanOrEqual(60)
    expect(clusterDiameterPx(2)).toBeGreaterThanOrEqual(26)
  })

  it('names itself in plain words, with no em dash (docs/CONTENT-VOICE.md)', () => {
    const label = clusterAccessibleLabel(12)
    expect(label).toContain('12')
    expect(label).not.toContain('—')
    expect(label).not.toMatch(/[A-Z]{2,}/)
  })
})
