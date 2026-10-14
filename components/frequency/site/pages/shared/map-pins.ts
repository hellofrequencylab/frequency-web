import { cityCentroid } from '@/lib/maps/city-centroids'
import type { MapPin } from '@/components/maps/types'
import type { SiteEvent, SiteSpace } from './data'

// THE WEBSITE MAP'S PINS. One pin per CITY, at that city's centroid: public events and Spaces carry a
// city and no coordinate, so a city is the only honest point (lib/maps/city-centroids.ts). Each pin is
// marked approximate, and its card names the city, how many are on, and links the soonest event (or
// the top-ranked Space) there. Items whose city is unknown stay in the list and off the map.

type Item = { city: string | null; title: string; href: string; sub: string | null }

function cityPins(items: Item[], kind: MapPin['kind'], noun: [string, string], hrefLabel: string): MapPin[] {
  const byCity = new Map<string, { at: [number, number]; items: Item[] }>()
  for (const it of items) {
    const at = cityCentroid(it.city)
    if (!at || !it.city) continue
    const key = `${at[0]},${at[1]}`
    const slot = byCity.get(key) ?? { at, items: [] }
    slot.items.push(it)
    byCity.set(key, slot)
  }
  return [...byCity.values()].map(({ at, items: here }) => {
    const first = here[0]
    const n = here.length
    return {
      id: `city:${first.city}`,
      lat: at[0],
      lng: at[1],
      kind,
      approximate: true,
      label: `${first.city}: ${n} ${n === 1 ? noun[0] : noun[1]}`,
      title: first.city,
      subtitle: `${n} ${n === 1 ? noun[0] : noun[1]}`,
      detail: first.sub ? `${first.title}, ${first.sub}` : first.title,
      href: first.href,
      hrefLabel,
    }
  })
}

export function eventCityPins(events: SiteEvent[]): MapPin[] {
  return cityPins(
    events.map((e) => ({ city: e.city, title: e.title, href: e.href, sub: e.when })),
    'event',
    ['gathering coming up', 'gatherings coming up'],
    'See the next one',
  )
}

export function spaceCityPins(spaces: SiteSpace[]): MapPin[] {
  return cityPins(
    spaces.map((s) => ({ city: s.city, title: s.name, href: s.href, sub: null })),
    'space',
    ['Space', 'Spaces'],
    'Open the Space',
  )
}
