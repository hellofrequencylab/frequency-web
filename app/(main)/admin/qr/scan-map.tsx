'use client'

import { MapCanvas } from '@/components/maps/map-canvas'
import type { ScanLocation } from '@/lib/qr/analytics'

/** Counts are already aggregated to coarse IP locations, never precise visitor coordinates. */
export default function ScanMap({
  locations,
  className = 'h-full w-full overflow-hidden rounded-card border border-border',
}: {
  locations: ScanLocation[]
  className?: string
}) {
  return (
    <MapCanvas
      center={[-98.5, 39.8]}
      zoom={3}
      pins={locations.map((location) => ({
        id: `scan-${location.key}`,
        lat: location.lat,
        lng: location.lng,
        count: location.scans,
        title: location.city,
        subtitle: `${location.scans} ${location.scans === 1 ? 'scan' : 'scans'}`,
        label: `${location.city}: ${location.scans} scans`,
      }))}
      fit={{ padding: 60, maxZoom: 10, singleZoom: 10 }}
      className={className}
    />
  )
}
