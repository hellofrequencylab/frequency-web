// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import GoogleCanvas from './google-canvas'

const state = vi.hoisted(() => ({ markers: [] as Record<string, unknown>[], frames: [] as unknown[][] }))
vi.mock('./use-near-viewport', () => ({ useNearViewport: () => true }))
vi.mock('@/lib/maps/basemap-look', () => ({
  readBasemapPalette: () => null, isDesignMap: () => true,
  googleMapStyles: () => [], watchColorMode: () => () => {},
}))
vi.mock('@/lib/maps/provider', () => ({ googleMapsMapId: () => null }))
vi.mock('@/lib/maps/google-loader', () => ({
  onGoogleMapsAuthFailure: () => () => {},
  loadGoogleMaps: async () => ({
    Map: class {
      getZoom() { return 8 }
      setZoom() {}
      setCenter() {}
      panTo() {}
      setOptions() {}
      addListener() { return { remove() {} } }
      fitBounds(bounds: { points: unknown[] }) { state.frames.push(bounds.points) }
    },
    Marker: class {
      constructor(options: Record<string, unknown>) { state.markers.push(options) }
      setMap() {}
      addListener() { return { remove() {} } }
    },
    InfoWindow: class { close() {} },
    LatLngBounds: class { points: unknown[] = []; extend(point: unknown) { this.points.push(point); return this } },
    Size: class { constructor(public width: number, public height: number) {} },
    Point: class { constructor(public x: number, public y: number) {} },
    SymbolPath: { CIRCLE: 0 }, ControlPosition: { RIGHT_BOTTOM: 9 },
  }),
}))
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
afterEach(() => { state.markers.length = 0; state.frames.length = 0 })

describe('Google rendering preserves aggregate and framing semantics', () => {
  it('draws city totals as count badges and opens the city instead of a fake series cluster', async () => {
    const host = document.createElement('div')
    const root = createRoot(host)
    await act(async () => root.render(<GoogleCanvas center={[-117, 33]} zoom={8} pins={[
      { id: 'city', lat: 33, lng: -117, count: 12, label: 'Coast: 12 circles' },
    ]} />))
    expect(state.markers).toHaveLength(1)
    expect(state.markers[0]?.label).toMatchObject({ text: '12', color: '#FFFFFF' })
    expect(state.markers[0]?.title).toBe('Coast: 12 circles')
    expect(state.markers[0]?.icon).toHaveProperty('url')
    await act(async () => root.unmount())
  })

  it('fits the requested nearest subset while keeping remote pins and standalone starter circles', async () => {
    const host = document.createElement('div')
    const root = createRoot(host)
    await act(async () => root.render(<GoogleCanvas center={[-117, 33]} zoom={8} pins={[
      { id: 'one', lat: 33, lng: -117 }, { id: 'far', lat: 50, lng: -120 },
      { id: 'starter', lat: 33, lng: -117, kind: 'starter', unclustered: true },
    ]} cluster={{ radiusPx: 50 }} fit={{ points: [{ lat: 33, lng: -117 }, { lat: 33.01, lng: -117 }], maxZoom: 11 }} />))
    // One frame before and after reclustering; neither includes the remote city.
    expect(state.frames[0]).toEqual([{ lat: 33, lng: -117 }, { lat: 33.01, lng: -117 }])
    expect(state.markers.some((marker) => (marker.position as { lat: number }).lat === 50)).toBe(true)
    expect(state.markers.filter((marker) => (marker.position as { lat: number }).lat === 33).length).toBeGreaterThanOrEqual(2)
    await act(async () => root.unmount())
  })
})
