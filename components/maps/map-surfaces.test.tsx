import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { MapCanvasProps } from './types'
import DiscoverMap from '@/components/discover/discover-map'
import CircleMap from '@/components/circles/circle-map'
import ScanMap from '@/app/(main)/admin/qr/scan-map'

const captures = vi.hoisted(() => [] as MapCanvasProps[])
vi.mock('./map-canvas', () => ({ MapCanvas: (props: MapCanvasProps) => { captures.push(props); return null } }))

function plot(element: React.ReactNode) {
  captures.length = 0
  renderToStaticMarkup(element)
  expect(captures).toHaveLength(1)
  return captures[0]!
}

describe('legacy map surfaces use the provider seam without losing their information', () => {
  it('discovery preserves coarse centroids, actual city counts and encoded navigation', () => {
    const map = plot(<DiscoverMap cities={[{ city: 'Ocean & Coast', lat: 33, lng: -117, circles: 12, events: 20 }]} />)
    expect(map.pins?.[0]).toMatchObject({ lat: 33, lng: -117, count: 12, href: '/discover/circles?city=Ocean%20%26%20Coast' })
    expect(map.pins?.[0]?.moreCount).toBeUndefined()
    expect(map.fit).toMatchObject({ maxZoom: 11 })
  })

  it('analytics preserves scan totals rather than counting cities as individual scans', () => {
    const map = plot(<ScanMap locations={[{ key: 'test', country: null, city: 'Test town', lat: 33, lng: -117, scans: 160 }]} />)
    expect(map.pins?.[0]).toMatchObject({ count: 160, subtitle: '160 scans', label: 'Test town: 160 scans' })
    expect(map.fit).toMatchObject({ maxZoom: 10, singleZoom: 10 })
  })

  it('circles retain all navigation pins but frame only the viewer and nearest five', () => {
    const circles = Array.from({ length: 8 }, (_, index) => ({
      id: String(index), name: `Circle ${index}`, slug: `circle-${index}`, latitude: 33 + index / 100,
      longitude: -117, neighborhood: 'Coast',
    }))
    const map = plot(<CircleMap circles={circles} center={[-117, 33]} starters={[{ slug: 'new/circle', name: 'New Circle', lat: 34, lng: -117 }]} />)
    expect(map.pins).toHaveLength(9)
    expect(map.fit?.points).toHaveLength(6)
    expect(map.fit?.points?.some((point) => point.lat === 34)).toBe(false)
    expect(map.pins?.[8]).toMatchObject({ kind: 'starter', unclustered: true, href: '/circles/starter/new%2Fcircle' })
    expect(map.cluster).toMatchObject({ radiusPx: 50, maxZoom: 12 })
  })
})
