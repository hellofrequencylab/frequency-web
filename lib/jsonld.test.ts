import { describe, it, expect } from 'vitest'
import {
  breadcrumbSchema,
  eventSchema,
  organizationSchema,
  websiteSchema,
  circleListSchema,
  eventListSchema,
  faqSchema,
  personSchema,
  spaceSchema,
} from './jsonld'
import { SITE_URL, SITE_NAME } from './site'
import type { PublicEvent, PublicCircle } from './discover'

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeEvent(overrides: Partial<PublicEvent> = {}): PublicEvent {
  return {
    id: 'evt-1',
    slug: 'test-event',
    title: 'Test Event',
    description: 'A test event',
    starts_at: '2026-07-01T18:00:00Z',
    ends_at: '2026-07-01T21:00:00Z',
    city: 'San Diego',
    circle_id: 'circle-1',
    circle_name: 'North County Circle',
    price_cents: null,
    ...overrides,
  }
}

function makeCircle(overrides: Partial<PublicCircle> = {}): PublicCircle {
  return {
    id: 'circle-1',
    slug: 'north-county',
    name: 'North County Circle',
    about: 'A local circle',
    type: 'interest',
    member_count: 42,
    status: 'active',
    city: 'San Diego',
    channel_name: null,
    channel_slug: null,
    ...overrides,
  }
}

// ── breadcrumbSchema ──────────────────────────────────────────────────────────

describe('breadcrumbSchema', () => {
  it('returns a BreadcrumbList with correct @context and @type', () => {
    const result = breadcrumbSchema([{ name: 'Home', path: '/' }])
    expect(result['@context']).toBe('https://schema.org')
    expect(result['@type']).toBe('BreadcrumbList')
  })

  it('assigns 1-based positions', () => {
    const result = breadcrumbSchema([
      { name: 'Home', path: '/' },
      { name: 'Discover', path: '/discover' },
      { name: 'Events', path: '/discover/events' },
    ])
    expect(result.itemListElement).toHaveLength(3)
    expect(result.itemListElement[0].position).toBe(1)
    expect(result.itemListElement[1].position).toBe(2)
    expect(result.itemListElement[2].position).toBe(3)
  })

  it('each item has ListItem type, name, and absolute item URL', () => {
    const result = breadcrumbSchema([{ name: 'Discover', path: '/discover' }])
    const item = result.itemListElement[0]
    expect(item['@type']).toBe('ListItem')
    expect(item.name).toBe('Discover')
    expect(item.item).toBe(`${SITE_URL}/discover`)
  })

  it('handles a path that already starts with /', () => {
    const result = breadcrumbSchema([{ name: 'X', path: '/foo/bar' }])
    expect(result.itemListElement[0].item).toBe(`${SITE_URL}/foo/bar`)
  })

  it('handles an empty list', () => {
    const result = breadcrumbSchema([])
    expect(result.itemListElement).toHaveLength(0)
  })
})

// ── eventSchema ───────────────────────────────────────────────────────────────

describe('eventSchema', () => {
  it('returns an Event with correct @context and @type', () => {
    const result = eventSchema(makeEvent())
    expect(result['@context']).toBe('https://schema.org')
    expect(result['@type']).toBe('Event')
  })

  it('maps required fields from the event', () => {
    const event = makeEvent()
    const result = eventSchema(event)
    expect(result.name).toBe(event.title)
    expect(result.startDate).toBe(event.starts_at)
    expect(result.eventStatus).toBe('https://schema.org/EventScheduled')
    expect(result.eventAttendanceMode).toBe('https://schema.org/OfflineEventAttendanceMode')
    expect(result.isAccessibleForFree).toBe(true)
  })

  it('marks a free event free with a $0 offer', () => {
    const result = eventSchema(makeEvent({ price_cents: null }))
    expect(result.isAccessibleForFree).toBe(true)
    expect(result.offers).toMatchObject({ '@type': 'Offer', price: '0.00', priceCurrency: 'USD' })
  })

  it('maps a ticketed event to a priced offer and not-free', () => {
    const result = eventSchema(makeEvent({ price_cents: 2500 }))
    expect(result.isAccessibleForFree).toBe(false)
    expect(result.offers).toMatchObject({ '@type': 'Offer', price: '25.00', priceCurrency: 'USD' })
  })

  it('includes endDate when ends_at is provided', () => {
    const result = eventSchema(makeEvent({ ends_at: '2026-07-01T21:00:00Z' }))
    expect(result).toHaveProperty('endDate', '2026-07-01T21:00:00Z')
  })

  it('omits endDate when ends_at is null', () => {
    const result = eventSchema(makeEvent({ ends_at: null }))
    expect(result).not.toHaveProperty('endDate')
  })

  it('uses city-level location when city is provided', () => {
    const result = eventSchema(makeEvent({ city: 'Oceanside' }))
    const loc = result.location as Record<string, unknown>
    expect(loc['@type']).toBe('Place')
    expect(loc.name).toBe('Oceanside')
    expect(loc.address).toMatchObject({
      '@type': 'PostalAddress',
      addressLocality: 'Oceanside',
    })
  })

  it('uses generic location placeholder when city is null (privacy contract)', () => {
    const result = eventSchema(makeEvent({ city: null }))
    const loc = result.location as Record<string, unknown>
    expect(loc['@type']).toBe('Place')
    // Must NOT expose precise location; name is a generic placeholder
    expect(loc.name).toMatch(/member/i)
    expect(loc).not.toHaveProperty('address')
  })

  it('defaults to a scheduled, offline (in-person) event with no enrichment', () => {
    const result = eventSchema(makeEvent())
    expect(result.eventStatus).toBe('https://schema.org/EventScheduled')
    expect(result.eventAttendanceMode).toBe('https://schema.org/OfflineEventAttendanceMode')
  })

  it('maps an online event to a VirtualLocation + OnlineEventAttendanceMode', () => {
    const result = eventSchema({ ...makeEvent({ slug: 'live-sit' }), attendance_mode: 'online' })
    expect(result.eventAttendanceMode).toBe('https://schema.org/OnlineEventAttendanceMode')
    const loc = result.location as Record<string, unknown>
    expect(loc['@type']).toBe('VirtualLocation')
    // The VirtualLocation url is the PUBLIC event page, never the members-only join link.
    expect(loc.url).toBe(`${SITE_URL}/discover/events/live-sit`)
  })

  it('maps a hybrid event to both a Place and a VirtualLocation + MixedEventAttendanceMode', () => {
    const result = eventSchema({
      ...makeEvent({ city: 'Encinitas' }),
      attendance_mode: 'hybrid',
    })
    expect(result.eventAttendanceMode).toBe('https://schema.org/MixedEventAttendanceMode')
    const locs = result.location as Array<Record<string, unknown>>
    expect(Array.isArray(locs)).toBe(true)
    expect(locs.map((l) => l['@type'])).toEqual(['Place', 'VirtualLocation'])
  })

  it('marks a cancelled event EventCancelled with a SoldOut offer', () => {
    const result = eventSchema({ ...makeEvent(), is_cancelled: true })
    expect(result.eventStatus).toBe('https://schema.org/EventCancelled')
    expect(result.offers).toMatchObject({ availability: 'https://schema.org/SoldOut' })
  })

  it('adds city-level region and country to the address when provided (no street/venue)', () => {
    const result = eventSchema({
      ...makeEvent({ city: 'San Marcos' }),
      region: 'CA',
      country: 'US',
    })
    const address = (result.location as Record<string, unknown>).address as Record<string, unknown>
    expect(address).toMatchObject({
      addressLocality: 'San Marcos',
      addressRegion: 'CA',
      addressCountry: 'US',
    })
    // Privacy contract: never a precise street address.
    expect(address).not.toHaveProperty('streetAddress')
  })

  it('generates the canonical event URL from slug', () => {
    const result = eventSchema(makeEvent({ slug: 'summer-meetup' }))
    expect(result.url).toBe(`${SITE_URL}/discover/events/summer-meetup`)
  })

  it('includes organizer when circle_name is provided', () => {
    const result = eventSchema(makeEvent({ circle_name: 'Surf Club' }))
    expect(result).toHaveProperty('organizer')
    expect((result as Record<string, unknown>).organizer).toMatchObject({
      '@type': 'Organization',
      name: 'Surf Club',
    })
  })

  it('omits organizer when circle_name is null', () => {
    const result = eventSchema(makeEvent({ circle_name: null }))
    expect(result).not.toHaveProperty('organizer')
  })

  it('includes description when provided', () => {
    const result = eventSchema(makeEvent({ description: 'Fun times' }))
    expect(result).toHaveProperty('description', 'Fun times')
  })

  it('omits description when null', () => {
    const result = eventSchema(makeEvent({ description: null }))
    expect(result).not.toHaveProperty('description')
  })
})

// ── organizationSchema / websiteSchema ────────────────────────────────────────

describe('organizationSchema', () => {
  it('returns schema.org Organization with site name and URL', () => {
    const result = organizationSchema()
    expect(result['@context']).toBe('https://schema.org')
    expect(result['@type']).toBe('Organization')
    expect(result.name).toBe(SITE_NAME)
    expect(result.url).toBe(SITE_URL)
  })

  it('includes a logo URL and contact email', () => {
    const result = organizationSchema()
    expect(result.logo).toContain('/icons/icon-192.png')
    expect(result.email).toMatch(/@/)
  })

  it('omits sameAs and foundingLocation when no options are passed (backward compatible)', () => {
    const result = organizationSchema()
    expect(result).not.toHaveProperty('sameAs')
    expect(result).not.toHaveProperty('foundingLocation')
  })

  it('emits sameAs only for the non-empty profiles provided', () => {
    const result = organizationSchema({ sameAs: ['https://instagram.com/frequency', ''] })
    expect(result.sameAs).toEqual(['https://instagram.com/frequency'])
  })

  it('omits sameAs when the provided list is empty after filtering', () => {
    const result = organizationSchema({ sameAs: ['', ''] })
    expect(result).not.toHaveProperty('sameAs')
  })

  it('emits a city-level foundingLocation Place (no street address)', () => {
    const result = organizationSchema({ foundingLocation: 'North County San Diego' })
    expect(result.foundingLocation).toEqual({
      '@type': 'Place',
      name: 'North County San Diego',
      address: { '@type': 'PostalAddress', addressLocality: 'North County San Diego' },
    })
    // Privacy contract: the founding location is never a precise street address.
    const place = result.foundingLocation as { address: Record<string, unknown> }
    expect(place.address).not.toHaveProperty('streetAddress')
  })

  it('omits foundingLocation when it is null', () => {
    const result = organizationSchema({ foundingLocation: null })
    expect(result).not.toHaveProperty('foundingLocation')
  })
})

describe('websiteSchema', () => {
  it('returns schema.org WebSite with site name and URL', () => {
    const result = websiteSchema()
    expect(result['@context']).toBe('https://schema.org')
    expect(result['@type']).toBe('WebSite')
    expect(result.name).toBe(SITE_NAME)
    expect(result.url).toBe(SITE_URL)
  })
})

// ── circleListSchema ──────────────────────────────────────────────────────────

describe('circleListSchema', () => {
  it('returns an ItemList with numberOfItems and positioned entries', () => {
    const circles = [makeCircle({ id: 'c1', slug: 'north', name: 'North' }), makeCircle({ id: 'c2', slug: 'south', name: 'South' })]
    const result = circleListSchema(circles, 'All Circles')
    expect(result['@type']).toBe('ItemList')
    expect(result.numberOfItems).toBe(2)
    expect(result.itemListElement[0].position).toBe(1)
    expect(result.itemListElement[1].position).toBe(2)
    expect(result.itemListElement[0].url).toBe(`${SITE_URL}/discover/circles/c1`)
    expect(result.itemListElement[0].name).toBe('North')
  })
})

// ── eventListSchema ───────────────────────────────────────────────────────────

describe('eventListSchema', () => {
  it('returns an ItemList keyed by event slug', () => {
    const events = [makeEvent({ slug: 'evt-a', title: 'A' }), makeEvent({ slug: 'evt-b', title: 'B' })]
    const result = eventListSchema(events, 'Upcoming Events')
    expect(result.numberOfItems).toBe(2)
    expect(result.itemListElement[0].url).toBe(`${SITE_URL}/discover/events/evt-a`)
    expect(result.itemListElement[1].name).toBe('B')
  })
})

// ── personSchema ──────────────────────────────────────────────────────────────

describe('personSchema', () => {
  it('returns a Person with name and absolute url', () => {
    const result = personSchema({ name: 'Ada Lovelace', path: '/discover/events/organizer/ada' })
    expect(result['@context']).toBe('https://schema.org')
    expect(result['@type']).toBe('Person')
    expect(result.name).toBe('Ada Lovelace')
    expect(result.url).toBe(`${SITE_URL}/discover/events/organizer/ada`)
  })

  it('includes image when an avatar is provided', () => {
    const result = personSchema({ name: 'Ada', path: '/x', image: 'https://cdn/a.png' })
    expect(result).toHaveProperty('image', 'https://cdn/a.png')
  })

  it('omits image when avatar is null', () => {
    const result = personSchema({ name: 'Ada', path: '/x', image: null })
    expect(result).not.toHaveProperty('image')
  })
})

// ── spaceSchema ───────────────────────────────────────────────────────────────

describe('spaceSchema', () => {
  it('maps a practitioner to a Person', () => {
    const result = spaceSchema({ slug: 'river-yoga', type: 'practitioner', name: 'River Yoga' })
    expect(result['@type']).toBe('Person')
    expect(result.name).toBe('River Yoga')
    expect(result.url).toBe(`${SITE_URL}/spaces/river-yoga`)
  })

  it('maps business / event_space / coaching to LocalBusiness', () => {
    for (const type of ['business', 'event_space', 'coaching']) {
      const result = spaceSchema({ slug: 's', type, name: 'N' })
      expect(result['@type']).toBe('LocalBusiness')
    }
  })

  it('maps an organization (and any unknown type) to Organization', () => {
    expect(spaceSchema({ slug: 's', type: 'organization', name: 'N' })['@type']).toBe('Organization')
    expect(spaceSchema({ slug: 's', type: 'mystery', name: 'N' })['@type']).toBe('Organization')
  })

  it('leads image with the operator logo, then the per-space OG card, then the site image', () => {
    const result = spaceSchema({ slug: 'sp', type: 'business', name: 'N', logoUrl: 'https://cdn/l.png' })
    expect(result.image).toEqual([
      'https://cdn/l.png',
      `${SITE_URL}/spaces/sp/opengraph-image`,
      `${SITE_URL}/opengraph-image`,
    ])
  })

  it('falls back to the OG card + site image when no logo, and includes tagline as description', () => {
    const result = spaceSchema({ slug: 'sp', type: 'business', name: 'N', tagline: 'Move well, locally.' })
    expect(result.image).toEqual([`${SITE_URL}/spaces/sp/opengraph-image`, `${SITE_URL}/opengraph-image`])
    expect(result).toHaveProperty('description', 'Move well, locally.')
  })

  it('omits description when there is no tagline', () => {
    const result = spaceSchema({ slug: 'sp', type: 'practitioner', name: 'N' })
    expect(result).not.toHaveProperty('description')
  })
})

// ── faqSchema ─────────────────────────────────────────────────────────────────

describe('faqSchema', () => {
  it('returns a FAQPage with Question + Answer pairs', () => {
    const result = faqSchema([{ q: 'What is Frequency?', a: 'A community platform.' }])
    expect(result['@type']).toBe('FAQPage')
    expect(result.mainEntity).toHaveLength(1)
    const q = result.mainEntity[0]
    expect(q['@type']).toBe('Question')
    expect(q.name).toBe('What is Frequency?')
    expect(q.acceptedAnswer).toMatchObject({ '@type': 'Answer', text: 'A community platform.' })
  })
})

describe('spaceSchema (enriched, P1:1)', () => {
  const base = { slug: 'acme', type: 'business', name: 'Acme Studio' }

  it('base call is backward-compatible: carries @id, no optional nodes', () => {
    const r = spaceSchema(base) as Record<string, unknown>
    expect(r['@type']).toBe('LocalBusiness')
    expect(r['@id']).toBe(r.url)
    expect(r.name).toBe('Acme Studio')
    expect(r).not.toHaveProperty('address')
    expect(r).not.toHaveProperty('aggregateRating')
    expect(r).not.toHaveProperty('sameAs')
  })

  it('maps role to the right @type', () => {
    expect((spaceSchema({ ...base, type: 'practitioner' }) as { '@type': string })['@type']).toBe('Person')
    expect((spaceSchema({ ...base, type: 'organization' }) as { '@type': string })['@type']).toBe('Organization')
    expect((spaceSchema({ ...base, type: 'event_space' }) as { '@type': string })['@type']).toBe('LocalBusiness')
  })

  it('emits sameAs / address / geo / openingHours only when provided, dropping empties', () => {
    const r = spaceSchema({
      ...base,
      sameAs: ['https://instagram.com/acme', '', null],
      address: { addressLocality: 'Austin', addressRegion: 'TX', streetAddress: '' },
      geo: { latitude: 30.26, longitude: -97.74 },
      openingHours: ['Mo-Fr 09:00-17:00', ' '],
      priceRange: '$$',
    }) as Record<string, unknown>
    expect(r.sameAs).toEqual(['https://instagram.com/acme'])
    expect(r.address).toMatchObject({ '@type': 'PostalAddress', addressLocality: 'Austin', addressRegion: 'TX' })
    expect(r.address).not.toHaveProperty('streetAddress')
    expect(r.geo).toMatchObject({ '@type': 'GeoCoordinates', latitude: 30.26 })
    expect(r.openingHours).toEqual(['Mo-Fr 09:00-17:00'])
    expect(r.priceRange).toBe('$$')
  })

  it('emits aggregateRating only when reviewCount > 0 (never a zero/null rating)', () => {
    expect(
      (spaceSchema({ ...base, aggregateRating: { ratingValue: 4.8, reviewCount: 12 } }) as Record<string, unknown>)
        .aggregateRating,
    ).toMatchObject({ '@type': 'AggregateRating', ratingValue: 4.8, reviewCount: 12 })
    expect(spaceSchema({ ...base, aggregateRating: { ratingValue: 0, reviewCount: 0 } })).not.toHaveProperty(
      'aggregateRating',
    )
  })

  it('omits an all-empty address', () => {
    expect(spaceSchema({ ...base, address: { streetAddress: '', addressLocality: null } })).not.toHaveProperty(
      'address',
    )
  })
})
