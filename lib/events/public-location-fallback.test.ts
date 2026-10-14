import { describe, it, expect } from 'vitest'
import { publicPageWhere } from './visible-location'
import { eventSchema } from '@/lib/jsonld'
import { venueFromRow } from './public-venue'

// SCAN-867. On production 147 public events kept their whole visible address in the free-text
// events.location line and nothing in the venue parts, so the public page said "Location shared
// with members" and the Event JSON-LD published a nameless Place. With the address visible, that
// line is the venue; with it hidden, nothing changes.

const line = 'Municipal, 1722 S Coast Hwy, Oceanside, CA 92054'

describe('the free-text location line on a public event', () => {
  it('is the where-line, with directions, when the host left the address visible', () => {
    const w = publicPageWhere({ hide_address: false, venue: { name: null, street: null }, city: null, location: line })
    expect(w).toEqual({
      line,
      mapsHref: 'https://maps.google.com/?q=Municipal%2C%201722%20S%20Coast%20Hwy%2C%20Oceanside%2C%20CA%2092054',
      exact: true,
    })
  })

  it('never shows for a hidden or unread address flag', () => {
    for (const hide_address of [true, null, undefined]) {
      expect(publicPageWhere({ hide_address, venue: null, city: 'Oceanside', location: line })).toEqual({
        line: 'Oceanside',
        mapsHref: null,
        exact: false,
      })
    }
  })

  it('is dropped by the venue read for a hidden row, and carried for a visible one', () => {
    const row = { venue_name: null, street: null, postal_code: null, geog: null, location: line }
    expect(venueFromRow({ ...row, hide_address: true })).toEqual({ hide_address: true, venue: null })
    expect(venueFromRow({ ...row, hide_address: false }).venue?.location).toBe(line)
  })

  it('gives the Event schema a named Place with an address, and only when visible', () => {
    const base = {
      id: 'e',
      slug: 'meet',
      title: 'Meet',
      description: null,
      starts_at: '2099-01-01T18:00:00Z',
      ends_at: null,
      city: 'Oceanside',
      circle_id: null,
      circle_name: null,
      price_cents: null,
    }
    const visible = eventSchema({ ...base, hide_address: false, venue: { location: line } }).location as Record<string, unknown>
    expect(visible.name).toBe(line)
    expect(visible.address).toEqual({ '@type': 'PostalAddress', streetAddress: line, addressLocality: 'Oceanside' })
    const hidden = JSON.stringify(eventSchema({ ...base, hide_address: true, venue: { location: line } }).location)
    expect(hidden).not.toContain('Coast Hwy')
  })
})
