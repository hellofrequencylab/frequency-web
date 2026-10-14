import { describe, it, expect, vi } from 'vitest'
import { eventSchema, publishableVenue } from './jsonld'
import type { PublicEvent } from './discover'

vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => { throw new Error('not in unit tests') } }))

// ADR-1743 (owner-ruled 2026-10-14): an Event's JSON-LD publishes the exact venue (name, street,
// postal code, geo) ONLY when the host left the address visible. A hidden-address event keeps the
// city-level Place it always had. Missing parts are omitted, never emitted as empty strings.

const base: PublicEvent = {
  id: 'evt-1',
  slug: 'craft-night',
  title: 'Craft Night',
  description: 'Bring a project.',
  starts_at: '2026-11-01T18:30:00Z',
  ends_at: null,
  city: 'Vista',
  circle_id: null,
  circle_name: null,
  price_cents: null,
}

const VENUE = { name: 'Royal Temple', street: '3598 Royal Rd', postal_code: '92084', lat: 33.2, lng: -117.24 }

type Place = { name: string; address?: Record<string, unknown>; geo?: Record<string, unknown> }
const place = (e: ReturnType<typeof eventSchema>) => e.location as unknown as Place

describe('Event venue (ADR-1743)', () => {
  it('a visible-address event publishes venue name, street, postal code and geo', () => {
    const p = place(eventSchema({ ...base, region: 'CA', country: 'US', hide_address: false, venue: VENUE }))
    expect(p.name).toBe('Royal Temple')
    expect(p.address).toEqual({
      '@type': 'PostalAddress',
      streetAddress: '3598 Royal Rd',
      addressLocality: 'Vista',
      addressRegion: 'CA',
      postalCode: '92084',
      addressCountry: 'US',
    })
    expect(p.geo).toEqual({ '@type': 'GeoCoordinates', latitude: 33.2, longitude: -117.24 })
  })

  it('a hidden-address event emits no venue name, street, postal code or geo', () => {
    const p = place(eventSchema({ ...base, region: 'CA', hide_address: true, venue: VENUE }))
    expect(p.name).toBe('Vista')
    expect(p.address).toEqual({ '@type': 'PostalAddress', addressLocality: 'Vista', addressRegion: 'CA' })
    expect(p).not.toHaveProperty('geo')
    expect(JSON.stringify(p)).not.toMatch(/Royal|3598|92084|33\.2/)
  })

  it('an unread flag (undefined or null) is treated as hidden', () => {
    for (const hide_address of [undefined, null]) {
      const p = place(eventSchema({ ...base, hide_address, venue: VENUE }))
      expect(p).not.toHaveProperty('geo')
      expect(p.address).not.toHaveProperty('streetAddress')
      expect(p.name).toBe('Vista')
    }
  })

  it('missing or blank parts are omitted, never emitted as empty strings', () => {
    const p = place(
      eventSchema({ ...base, hide_address: false, venue: { name: '  ', street: '', postal_code: null, lat: 33.2, lng: null } }),
    )
    expect(p.name).toBe('Vista')
    expect(p.address).toEqual({ '@type': 'PostalAddress', addressLocality: 'Vista' })
    expect(p).not.toHaveProperty('geo')
    expect(JSON.stringify(p)).not.toContain('""')
  })

  it('without the venue the Place is exactly the city-level one it always was', () => {
    expect(eventSchema({ ...base, hide_address: false, venue: null }).location).toEqual(eventSchema(base).location)
  })

  it('an online event publishes a VirtualLocation and no venue', () => {
    const loc = eventSchema({ ...base, attendance_mode: 'online', hide_address: false, venue: VENUE }).location
    expect(JSON.stringify(loc)).not.toMatch(/Royal|GeoCoordinates/)
  })

  it('publishableVenue rejects an out-of-range point and keeps the address parts', () => {
    expect(publishableVenue(false, { street: '1 Main St', lat: 120, lng: 10 })).toEqual({
      name: null,
      street: '1 Main St',
      postal: null,
      geo: null,
    })
    expect(publishableVenue(true, VENUE)).toBeNull()
    expect(publishableVenue(false, {})).toBeNull()
  })
})

describe('venueFromRow (lib/events/public-venue.ts)', () => {
  it('drops every venue column for a hidden-address row, and for a null flag', async () => {
    const { venueFromRow } = await import('./events/public-venue')
    const row = { venue_name: 'Royal Temple', street: '3598 Royal Rd', postal_code: '92084', geog: { coordinates: [-117.24, 33.2] } }
    expect(venueFromRow({ ...row, hide_address: true })).toEqual({ hide_address: true, venue: null })
    expect(venueFromRow({ ...row, hide_address: null })).toEqual({ hide_address: null, venue: null })
    expect(venueFromRow(null)).toEqual({ hide_address: null, venue: null })
  })

  it('decodes the stored map point for a visible-address row', async () => {
    const { venueFromRow } = await import('./events/public-venue')
    expect(
      venueFromRow({ hide_address: false, venue_name: 'Royal Temple', street: '3598 Royal Rd', postal_code: '92084', geog: { coordinates: [-117.24, 33.2] } }),
    ).toEqual({
      hide_address: false,
      venue: { name: 'Royal Temple', street: '3598 Royal Rd', postal_code: '92084', lat: 33.2, lng: -117.24 },
    })
  })
})
