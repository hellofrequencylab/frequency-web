'use client'

import { MapCanvas } from '@/components/maps/map-canvas'

export type MapCity = {
  city: string
  circles: number
  events: number
  lat: number
  lng: number
}

/** Public discovery receives city centroids only, never private circle or venue coordinates. */
export default function DiscoverMap({
  cities,
  center = null,
  className = 'h-full w-full overflow-hidden rounded-card border border-border',
}: {
  cities: MapCity[]
  center?: [number, number] | null
  className?: string
}) {
  return (
    <MapCanvas
      center={center ?? [-117.28, 33.1]}
      zoom={center ? 9 : 8}
      pins={cities.map((city) => ({
        id: city.city,
        lat: city.lat,
        lng: city.lng,
        count: city.circles,
        title: city.city,
        subtitle: `${city.circles} ${city.circles === 1 ? 'circle' : 'circles'}`,
        label: `${city.city}: ${city.circles} circles, ${city.events} events`,
        href: `/discover/circles?city=${encodeURIComponent(city.city)}`,
        hrefLabel: 'Explore circles',
      }))}
      fit={center ? null : { padding: 60, maxZoom: 11, singleZoom: 11 }}
      recenterTo={center}
      className={className}
    />
  )
}
