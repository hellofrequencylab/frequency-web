import { describe, expect, it } from 'vitest'
import { eventCityPins, spaceCityPins } from './map-pins'
import type { SiteEvent, SiteSpace } from './data'

const ev = (id: string, city: string | null): SiteEvent => ({
  id,
  href: `/events/${id}`,
  title: `Event ${id}`,
  when: 'Thu 6:30pm',
  where: city,
  city,
  icon: 'event',
  tag: 'Free',
})

describe('website map pins', () => {
  it('folds events to one approximate pin per known city, linking the soonest', () => {
    const pins = eventCityPins([ev('a', 'Encinitas'), ev('b', 'encinitas'), ev('c', 'Carlsbad'), ev('d', 'Atlantis'), ev('e', null)])
    expect(pins).toHaveLength(2)
    const enc = pins.find((p) => p.title === 'Encinitas')!
    expect(enc).toMatchObject({ approximate: true, kind: 'event', subtitle: '2 gatherings coming up', href: '/events/a' })
    expect(enc.lat).toBeCloseTo(33.037)
  })

  it('pins Spaces by city', () => {
    const s: SiteSpace = { id: '1', href: '/spaces/x', name: 'X', where: 'Vista · Studio', city: 'Vista', tag: 'Studio', rank: 1 }
    expect(spaceCityPins([s])).toMatchObject([{ kind: 'space', subtitle: '1 Space', href: '/spaces/x' }])
  })
})
