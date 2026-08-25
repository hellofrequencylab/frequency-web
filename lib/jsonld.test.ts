import { describe, it, expect } from 'vitest'
import {
  breadcrumbSchema,
  eventSchema,
  organizationSchema,
  websiteSchema,
  circleListSchema,
  circleSchema,
  eventListSchema,
  eventsListingSchema,
  faqSchema,
  personSchema,
  spaceSchema,
  productSchema,
  spaceOfferingsSchema,
  parseOpeningHours,
} from './jsonld'
import { SITE_URL, SITE_NAME } from './site'
import type { PublicEvent, PublicCircle } from './discover'

// ── Helpers ───────────────────────────────────────────────────────────────────

// `time_zone` is an EventSchemaEnrichment field rather than a PublicEvent one (the public RPCs do
// not return it yet), so the helper accepts it alongside the row — see the SCAN-207 block below.
function makeEvent(
  overrides: Partial<PublicEvent> & { time_zone?: string | null } = {},
): PublicEvent & { time_zone?: string | null } {
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
    // 🔴 THIS ASSERTION USED TO READ `toBe(event.starts_at)`, AND THAT WAS THE BUG IT PINNED.
    // `events.starts_at` stores the WALL CLOCK as UTC parts, so publishing it raw tells Google the
    // local time is a UTC instant. Measured on production 2026-08-25: a 6:30pm Pacific event was
    // published as `2026-08-27T18:30:00Z`, which every consumer reads as 11:30am (SCAN-207). The
    // correct form keeps the wall clock and carries the zone's offset at that instant.
    expect(result.startDate).toBe('2026-07-01T18:00:00-07:00')
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

  // Pricing authority (meta-scan): a TICKETED event carries its price on its active tiers, so
  // events.price_cents stays null for them. Reading only that column published
  // isAccessibleForFree: true for every tier-priced event — a wrong rich result and a
  // structured-data mismatch against the page, which shows the real price.
  it('prices a tier-priced event from the tier authority, not the null price_cents column', () => {
    const result = eventSchema({ ...makeEvent({ price_cents: null }), ticket_from_cents: 2500 })
    expect(result.isAccessibleForFree).toBe(false)
    expect(result.offers).toMatchObject({ price: '25.00' })
  })

  it('treats a tiered event whose tiers are all free as free', () => {
    // The three-state contract: an explicit null means "tiered and free" and must NOT fall
    // through to price_cents. A plain `??` here would republish the stale column.
    const result = eventSchema({ ...makeEvent({ price_cents: 9900 }), ticket_from_cents: null })
    expect(result.isAccessibleForFree).toBe(true)
    expect(result.offers).toMatchObject({ price: '0.00' })
  })

  it('falls back to price_cents when no tier data is supplied', () => {
    // undefined = "caller supplied no tiers" — the untiered path stays exactly as it was.
    const result = eventSchema(makeEvent({ price_cents: 1500 }))
    expect(result.isAccessibleForFree).toBe(false)
    expect(result.offers).toMatchObject({ price: '15.00' })
  })

  // ── Currency (meta-scan 10.18) ──────────────────────────────────────────────
  // `priceCurrency` was the literal 'USD' for every event on earth, while `events.currency` has
  // been a real per-event column (text, DEFAULT 'usd') the whole time — read elsewhere by
  // lib/commerce/ticket-projection. A price published in the wrong denomination is worse than no
  // price: it is a specific, confident, wrong number in the rich result.
  it('denominates the offer in the event currency, upper-cased', () => {
    const result = eventSchema({ ...makeEvent({ price_cents: 2500 }), currency: 'eur' })
    expect(result.offers).toMatchObject({ price: '25.00', priceCurrency: 'EUR' })
  })

  it('falls back to USD on the column default, not on a hardcode', () => {
    // Absent and explicit-null both mean "the column default", which IS 'usd'. The distinction
    // from the old behaviour is that a supplied currency now wins — pinned by the case above.
    expect(eventSchema(makeEvent()).offers.priceCurrency).toBe('USD')
    expect(eventSchema({ ...makeEvent(), currency: null }).offers.priceCurrency).toBe('USD')
  })

  it('upper-cases an already-upper-case currency without mangling it', () => {
    expect(eventSchema({ ...makeEvent(), currency: 'GBP' }).offers.priceCurrency).toBe('GBP')
  })

  // ── Availability (meta-scan 10.18) ──────────────────────────────────────────
  // The only outright page-vs-schema CONTRADICTION the fan-out found: the page rendered "Sold
  // out." / the full-capacity waitlist CTA while the structured data on the same response said
  // InStock. `availability` reflected only is_cancelled and never capacity.
  it('reports SoldOut when the caller says the event is sold out', () => {
    const result = eventSchema({ ...makeEvent({ price_cents: 2500 }), is_sold_out: true })
    expect(result.offers.availability).toBe('https://schema.org/SoldOut')
  })

  it('reports InStock when the caller positively says seats remain', () => {
    const result = eventSchema({ ...makeEvent({ price_cents: 2500 }), is_sold_out: false })
    expect(result.offers.availability).toBe('https://schema.org/InStock')
  })

  it('leaves availability on the cancellation rule when capacity is unknown', () => {
    // THREE-STATE, as with ticket_from_cents: `undefined` means the caller could not determine
    // this. It must read exactly as it did before the field existed, or every caller that cannot
    // see capacity silently starts publishing "seats available" as a fact.
    expect(eventSchema(makeEvent()).offers.availability).toBe('https://schema.org/InStock')
    expect(eventSchema({ ...makeEvent(), is_cancelled: true }).offers.availability).toBe(
      'https://schema.org/SoldOut',
    )
  })

  it('keeps a cancelled event SoldOut even when seats are free', () => {
    // is_cancelled wins: a cancelled event is not buyable regardless of capacity.
    const result = eventSchema({ ...makeEvent(), is_cancelled: true, is_sold_out: false })
    expect(result.offers.availability).toBe('https://schema.org/SoldOut')
    expect(result.eventStatus).toBe('https://schema.org/EventCancelled')
  })

  it('includes endDate when ends_at is provided', () => {
    const result = eventSchema(makeEvent({ ends_at: '2026-07-01T21:00:00Z' }))
    expect(result).toHaveProperty('endDate', '2026-07-01T21:00:00-07:00')
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
    expect(loc.url).toBe(`${SITE_URL}/events/live-sit`)
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
    expect(result.url).toBe(`${SITE_URL}/events/summer-meetup`)
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

// ── circleSchema ──────────────────────────────────────────────────────────────

describe('circleSchema', () => {
  it('returns an Organization with an absolute url', () => {
    const result = circleSchema({ id: 'c1', name: 'North Circle' })
    expect(result['@type']).toBe('Organization')
    expect(result.name).toBe('North Circle')
    expect(result.url).toBe(`${SITE_URL}/discover/circles/c1`)
  })

  it('omits description + location when absent, includes them (city-level) when present', () => {
    const bare = circleSchema({ id: 'c2', name: 'Bare' })
    expect('description' in bare).toBe(false)
    expect('location' in bare).toBe(false)

    const full = circleSchema({ id: 'c3', name: 'Full', about: 'We walk Sundays.', city: 'Austin' })
    expect(full.description).toBe('We walk Sundays.')
    // City-level only — never a precise venue.
    expect(full.location).toEqual({
      '@type': 'Place',
      address: { '@type': 'PostalAddress', addressLocality: 'Austin' },
    })
  })
})

// ── eventListSchema ───────────────────────────────────────────────────────────

describe('eventListSchema', () => {
  it('returns an ItemList keyed by event slug, pointing at the CANONICAL /events page', () => {
    const events = [makeEvent({ slug: 'evt-a', title: 'A' }), makeEvent({ slug: 'evt-b', title: 'B' })]
    const result = eventListSchema(events, 'Upcoming Events')
    expect(result.numberOfItems).toBe(2)
    // /discover/events/<slug> canonicalizes to /events/<slug>; the ItemList must cite the canonical.
    expect(result.itemListElement[0].url).toBe(`${SITE_URL}/events/evt-a`)
    expect(result.itemListElement[1].name).toBe('B')
  })
})

// ── eventsListingSchema ─────────────────────────────────────────────────────────

describe('eventsListingSchema', () => {
  const rows = [
    { slug: 'evt-a', title: 'Sunrise Sit', starts_at: '2026-08-01T15:00:00Z', is_cancelled: false },
    { slug: 'evt-b', title: 'Beach Cleanup', starts_at: '2026-08-02T16:00:00Z', is_cancelled: true },
  ]

  it('returns an ItemList with numberOfItems and positioned entries', () => {
    const result = eventsListingSchema(rows, 'Upcoming events')
    expect(result['@context']).toBe('https://schema.org')
    expect(result['@type']).toBe('ItemList')
    expect(result.name).toBe('Upcoming events')
    expect(result.numberOfItems).toBe(2)
    expect(result.itemListElement[0].position).toBe(1)
    expect(result.itemListElement[1].position).toBe(2)
  })

  it('nests an Event node pointing at the canonical /events/<slug> url', () => {
    const first = eventsListingSchema(rows, 'x').itemListElement[0]
    expect(first['@type']).toBe('ListItem')
    const event = first.item as Record<string, unknown>
    expect(event['@type']).toBe('Event')
    expect(event.name).toBe('Sunrise Sit')
    expect(event.startDate).toBe('2026-08-01T15:00:00-07:00') // same rule as eventSchema — SCAN-207
    expect(event.url).toBe(`${SITE_URL}/events/evt-a`)
    // Nested Event carries no redundant @context (the parent ItemList holds it).
    expect(event).not.toHaveProperty('@context')
  })

  it('maps eventStatus from is_cancelled', () => {
    const items = eventsListingSchema(rows, 'x').itemListElement
    expect((items[0].item as Record<string, unknown>).eventStatus).toBe(
      'https://schema.org/EventScheduled',
    )
    expect((items[1].item as Record<string, unknown>).eventStatus).toBe(
      'https://schema.org/EventCancelled',
    )
  })

  it('never emits a venue location (ADR-186 privacy: name + startDate + url + status only)', () => {
    const event = eventsListingSchema(rows, 'x').itemListElement[0].item as Record<string, unknown>
    expect(event).not.toHaveProperty('location')
    expect(event).not.toHaveProperty('address')
    expect(Object.keys(event).sort()).toEqual(['@type', 'eventStatus', 'name', 'startDate', 'url'])
  })

  it('treats a missing is_cancelled as scheduled', () => {
    const result = eventsListingSchema([{ slug: 's', title: 'T', starts_at: '2026-08-01T15:00:00Z' }], 'x')
    expect((result.itemListElement[0].item as Record<string, unknown>).eventStatus).toBe(
      'https://schema.org/EventScheduled',
    )
  })

  it('handles an empty list', () => {
    const result = eventsListingSchema([], 'x')
    expect(result.numberOfItems).toBe(0)
    expect(result.itemListElement).toHaveLength(0)
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
  it('maps a business to a LocalBusiness', () => {
    const result = spaceSchema({ slug: 'river-yoga', type: 'business', name: 'River Yoga' })
    expect(result['@type']).toBe('LocalBusiness')
    expect(result.name).toBe('River Yoga')
    expect(result.url).toBe(`${SITE_URL}/spaces/river-yoga`)
  })

  it('maps a nonprofit (and any unknown / host type) to Organization', () => {
    // After the ADR-552 collapse the two public types are business -> LocalBusiness and nonprofit ->
    // Organization; the hidden `root` host and any unknown value also fall back to Organization.
    expect(spaceSchema({ slug: 's', type: 'nonprofit', name: 'N' })['@type']).toBe('Organization')
    expect(spaceSchema({ slug: 's', type: 'root', name: 'N' })['@type']).toBe('Organization')
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
    const result = spaceSchema({ slug: 'sp', type: 'business', name: 'N' })
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

describe('spaceSchema enrichment (@id + optional LocalBusiness fields)', () => {
  const base = { slug: 'acme', type: 'business', name: 'Acme Studio' }

  it('carries a stable @id equal to the url', () => {
    const r = spaceSchema(base) as Record<string, unknown>
    expect(r['@id']).toBe(r.url)
  })

  it('emits sameAs / address / geo / openingHours / priceRange only when provided, dropping empties', () => {
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

  it('stays backward-compatible for the base call and omits an all-empty address', () => {
    const r = spaceSchema(base) as Record<string, unknown>
    expect(r).not.toHaveProperty('address')
    expect(r).not.toHaveProperty('sameAs')
    expect(spaceSchema({ ...base, address: { streetAddress: '', addressLocality: null } })).not.toHaveProperty('address')
  })
})

// ── productSchema (optional price) ──────────────────────────────────────────────

describe('productSchema', () => {
  it('emits an Offer with a price when priceCents is given', () => {
    const r = productSchema({ title: 'Tote', priceCents: 2500, path: '/store/tote' }) as Record<string, unknown>
    expect(r['@type']).toBe('Product')
    expect(r.offers).toMatchObject({ '@type': 'Offer', price: '25.00', priceCurrency: 'USD' })
  })

  it('omits the Offer entirely when there is no price (never a bogus $0)', () => {
    const r = productSchema({ title: 'Consult', path: '/store/consult' }) as Record<string, unknown>
    expect(r['@type']).toBe('Product')
    expect(r).not.toHaveProperty('offers')
  })
})

// ── spaceOfferingsSchema (ItemList of Products) ─────────────────────────────────

describe('spaceOfferingsSchema', () => {
  const listName = 'River Yoga offerings'

  it('builds an ItemList of Product nodes deep-linking to the offerings anchor', () => {
    const r = spaceOfferingsSchema(
      [{ title: 'Drop-in class', price: 20, currency: 'USD', priceModel: 'fixed' }],
      { slug: 'river-yoga', sellerName: 'River Yoga', listName },
    ) as Record<string, unknown>
    expect(r['@type']).toBe('ItemList')
    expect(r.numberOfItems).toBe(1)
    const first = (r.itemListElement as Record<string, unknown>[])[0]
    expect(first['@type']).toBe('ListItem')
    expect(first.position).toBe(1)
    const product = first.item as Record<string, unknown>
    expect(product['@type']).toBe('Product')
    expect(product.name).toBe('Drop-in class')
    // Nested Product carries no redundant @context (the parent ItemList holds it).
    expect(product).not.toHaveProperty('@context')
    expect(product.url).toBe(`${SITE_URL}/spaces/river-yoga#offerings`)
    expect((product.offers as Record<string, unknown>).price).toBe('20.00')
  })

  it("emits a 'free' offering as a $0 Offer and a 'contact' / priceless offering with no Offer", () => {
    const items = spaceOfferingsSchema(
      [
        { title: 'Community class', priceModel: 'free' },
        { title: 'Private coaching', priceModel: 'contact' },
        { title: 'Workshop' },
      ],
      { slug: 's', listName },
    ).itemListElement as Record<string, unknown>[]
    const free = items[0].item as Record<string, unknown>
    expect((free.offers as Record<string, unknown>).price).toBe('0.00')
    expect(items[1].item).not.toHaveProperty('offers')
    expect(items[2].item).not.toHaveProperty('offers')
  })
})

// ── parseOpeningHours (free text → schema.org) ──────────────────────────────────

describe('parseOpeningHours', () => {
  it('parses a bare-number weekday range as business hours', () => {
    expect(parseOpeningHours('Mon-Fri 9-5')).toEqual(['Mo-Fr 09:00-17:00'])
  })

  it('parses meridiem and "to" formats', () => {
    expect(parseOpeningHours('Monday 9:00 AM - 5:00 PM')).toEqual(['Mo 09:00-17:00'])
    expect(parseOpeningHours('Sat 10am to 2pm')).toEqual(['Sa 10:00-14:00'])
  })

  it('handles day-group shorthands and multi-line input', () => {
    expect(parseOpeningHours('Weekdays 8-6\nSaturday 9-1')).toEqual(['Mo-Fr 08:00-18:00', 'Sa 09:00-13:00'])
  })

  it('drops lines it cannot parse rather than emit invalid schema', () => {
    expect(parseOpeningHours('Mon-Fri 9-5\nClosed Sundays\nBy appointment')).toEqual(['Mo-Fr 09:00-17:00'])
    expect(parseOpeningHours('')).toEqual([])
    expect(parseOpeningHours(null)).toEqual([])
  })
})

// ── SCAN-207 · the published event time ───────────────────────────────────────────────────────
// `events.starts_at` stores the WALL CLOCK as UTC parts (lib/time/zone.ts). Publishing it raw told
// every search and answer engine that the local time was a UTC instant — seven or eight hours early
// in North America. Measured on production 2026-08-25, before the fix: five upcoming public events,
// all of them wrong; e.g. `breathe-connect-expand-2026-08-27` starts 6:30pm Pacific and its Event
// node said `2026-08-27T18:30:00Z`, which reads as 11:30am.
//
// This is the SEO twin of SCAN-101, where the same convention read as an instant closed the guest
// RSVP door before lunch. Both now go through lib/time/zone; neither hand-rolls a comparison.
describe('SCAN-207 · Event startDate carries the event zone, not a bare Z', () => {
  it('publishes the wall clock with the zone offset, and it resolves to the true instant', () => {
    const r = eventSchema(makeEvent({ starts_at: '2026-08-27T18:30:00Z', time_zone: 'America/Los_Angeles' }))
    expect(r.startDate).toBe('2026-08-27T18:30:00-07:00')
    // The load-bearing assertion: parsed, it IS the moment the event happens (01:30Z the next day),
    // and NOT the moment the raw string used to claim.
    expect(new Date(r.startDate).toISOString()).toBe('2026-08-28T01:30:00.000Z')
    expect(new Date(r.startDate).toISOString()).not.toBe('2026-08-27T18:30:00.000Z')
  })

  it('reads the offset AT THE EVENT, so winter and summer differ', () => {
    // Using "today's" offset would be wrong for half the year in any DST zone.
    const summer = eventSchema(makeEvent({ starts_at: '2026-07-04T19:00:00Z', time_zone: 'America/Los_Angeles' }))
    const winter = eventSchema(makeEvent({ starts_at: '2026-12-24T19:00:00Z', time_zone: 'America/Los_Angeles' }))
    expect(summer.startDate).toBe('2026-07-04T19:00:00-07:00')
    expect(winter.startDate).toBe('2026-12-24T19:00:00-08:00')
  })

  it('honours a non-Pacific zone rather than assuming the community one', () => {
    const r = eventSchema(makeEvent({ starts_at: '2026-08-27T18:30:00Z', time_zone: 'America/New_York' }))
    expect(r.startDate).toBe('2026-08-27T18:30:00-04:00')
  })

  it('falls back to the community zone when the zone is absent or unknown', () => {
    // The /discover pages read events through public_events / public_event_by_slug, and those RPCs
    // do not return time_zone yet, so they arrive here without one. Falling back the way resolveZone
    // does is correct for every event on the platform today (production 2026-08-25: 61 of 61 are
    // America/Los_Angeles) and is the same direction the rest of the codebase fails in.
    for (const tz of [undefined, null, 'Not/AZone']) {
      const r = eventSchema(makeEvent({ starts_at: '2026-08-27T18:30:00Z', time_zone: tz as string | null }))
      expect(r.startDate, `zone=${String(tz)}`).toBe('2026-08-27T18:30:00-07:00')
    }
  })

  it('keeps the offer opening at the same moment the event starts', () => {
    // startDate and offers.validFrom are resolved once and shared, so the two cannot drift into a
    // page-vs-schema contradiction about when the event is.
    const r = eventSchema(makeEvent({ starts_at: '2026-08-27T18:30:00Z', time_zone: 'America/Los_Angeles' }))
    expect((r.offers as Record<string, unknown>).validFrom).toBe(r.startDate)
  })

  it('degrades to the raw stored value on a malformed timestamp rather than dropping the field', () => {
    // Google requires startDate. A row we cannot convert should still publish something.
    const r = eventSchema(makeEvent({ starts_at: 'not-a-date', time_zone: 'America/Los_Angeles' }))
    expect(r.startDate).toBe('not-a-date')
  })

  it('applies the same rule to the listing, which had the same defect', () => {
    const items = eventsListingSchema(
      [{ slug: 's', title: 'T', starts_at: '2026-08-27T18:30:00Z', time_zone: 'America/Los_Angeles' }],
      'x',
    ).itemListElement
    expect((items[0].item as Record<string, unknown>).startDate).toBe('2026-08-27T18:30:00-07:00')
  })
})
