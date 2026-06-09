import { describe, it, expect } from 'vitest'
import {
  breadcrumbSchema,
  eventSchema,
  organizationSchema,
  websiteSchema,
  circleListSchema,
  eventListSchema,
  faqSchema,
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
    expect(result.location['@type']).toBe('Place')
    expect(result.location.name).toBe('Oceanside')
    expect((result.location as Record<string, unknown>).address).toMatchObject({
      '@type': 'PostalAddress',
      addressLocality: 'Oceanside',
    })
  })

  it('uses generic location placeholder when city is null (privacy contract)', () => {
    const result = eventSchema(makeEvent({ city: null }))
    expect(result.location['@type']).toBe('Place')
    // Must NOT expose precise location; name is a generic placeholder
    expect(result.location.name).toMatch(/member/i)
    expect(result.location).not.toHaveProperty('address')
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
