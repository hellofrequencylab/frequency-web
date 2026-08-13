import { describe, it, expect } from 'vitest'
import {
  exactLocationLine,
  approximateLocationLine,
  locationCopy,
  moreDatesLine,
  memberCountLine,
  EVENT_APPROX_BADGE,
  SPACE_APPROX_BADGE,
} from './pin-copy'

// The rules that decide what a pin says about WHERE it is. Two of these tests are privacy tests
// wearing copy-test clothes, and they are the reason the module exists:
//
//   • an approximate line must never contain the street
//   • an approximate line must never contain the VENUE NAME either
//
// The second is the one that is easy to lose in a refactor, because a venue name looks like a label
// rather than a location. It is not: "Royal Temple" is one building in Vista.

describe('exact precision lists the address', () => {
  it('leads with the venue and follows with the street', () => {
    expect(exactLocationLine({ venueName: 'Encinitas Viewpoint Park', street: '56 East D Street', city: 'Encinitas' }))
      .toBe('Encinitas Viewpoint Park, 56 East D Street, Encinitas')
  })

  it('works with only a street', () => {
    expect(exactLocationLine({ street: '56 East D Street', city: 'Encinitas' })).toBe('56 East D Street, Encinitas')
  })

  it('works with only a venue', () => {
    expect(exactLocationLine({ venueName: 'The Barn' })).toBe('The Barn')
  })

  it('falls back to the city when that is all there is', () => {
    expect(exactLocationLine({ city: 'Vista' })).toBe('Vista')
  })

  it('does not repeat a city already spelled inside the street line', () => {
    // "3598 Royal Road, Vista, Vista" is what the naive join produces, and it reads as a bug.
    expect(exactLocationLine({ street: '3598 Royal Road, Vista', city: 'Vista' })).toBe('3598 Royal Road, Vista')
  })

  it('is null when the row carries no location at all', () => {
    expect(exactLocationLine({})).toBeNull()
    expect(exactLocationLine({ venueName: '   ', street: '', city: null })).toBeNull()
  })
})

describe('approximate precision lists the city and stops', () => {
  it('adds a short region, because "Vista, CA" is more useful than "Vista"', () => {
    expect(approximateLocationLine({ city: 'Vista', region: 'CA' })).toBe('Vista, CA')
  })

  it('drops a long region rather than reading a form field aloud', () => {
    expect(approximateLocationLine({ city: 'Vista', region: 'United States of America' })).toBe('Vista')
  })

  it('does not print the city twice when the region repeats it', () => {
    expect(approximateLocationLine({ city: 'Singapore', region: 'Singapore' })).toBe('Singapore')
  })

  it('falls back to the region when there is no city', () => {
    expect(approximateLocationLine({ region: 'CA' })).toBe('CA')
  })

  it('is null when the row has neither', () => {
    expect(approximateLocationLine({})).toBeNull()
  })
})

describe('🔴 the coarsened line never carries a precise location', () => {
  const PRECISE = {
    venueName: 'Royal Temple',
    street: '3598 Royal Road',
    city: 'Vista',
    region: 'CA',
  }

  it('drops the street', () => {
    const { line } = locationCopy({ city: PRECISE.city, region: PRECISE.region }, { approximate: true, kind: 'event' })
    expect(line ?? '').not.toContain('Royal Road')
    expect(line ?? '').not.toContain('3598')
  })

  it('drops the venue name, which is an address in disguise', () => {
    const { line } = locationCopy({ city: PRECISE.city, region: PRECISE.region }, { approximate: true, kind: 'space' })
    expect(line ?? '').not.toContain('Royal Temple')
  })

  it('🔴 refuses to print a street even when a caller hands it one', () => {
    // The loader is supposed to withhold these fields, and it does. This asserts the SECOND line of
    // defence: if a future caller passes the full address by mistake, the approximate path still
    // publishes only the city. One mistake should not be enough.
    const { line } = locationCopy(PRECISE, { approximate: true, kind: 'event' })
    expect(line).toBe('Vista, CA')
    expect(line).not.toContain('Royal Road')
    expect(line).not.toContain('Royal Temple')
  })
})

describe('the pill names what the member can do about it', () => {
  it('an event points at the way to get the address', () => {
    expect(locationCopy({ city: 'Vista' }, { approximate: true, kind: 'event' }).badge).toBe(EVENT_APPROX_BADGE)
    expect(EVENT_APPROX_BADGE).toContain('RSVP')
  })

  it('a space stops at the honest half, because there is nothing to RSVP to', () => {
    expect(locationCopy({ city: 'Vista' }, { approximate: true, kind: 'space' }).badge).toBe(SPACE_APPROX_BADGE)
    expect(SPACE_APPROX_BADGE).not.toContain('RSVP')
  })

  it('an exact pin wears no pill at all', () => {
    expect(locationCopy({ street: '1 Main St', city: 'Vista' }, { approximate: false, kind: 'event' }).badge).toBeNull()
    expect(locationCopy({ street: '1 Main St', city: 'Vista' }, { approximate: false, kind: 'space' }).badge).toBeNull()
  })

  it('uses no em dashes (docs/CONTENT-VOICE.md §10)', () => {
    expect(EVENT_APPROX_BADGE).not.toContain('—')
    expect(SPACE_APPROX_BADGE).not.toContain('—')
  })
})

describe('the counting lines', () => {
  it('spells the singular date', () => {
    expect(moreDatesLine(1)).toBe('and 1 more date')
  })

  it('pluralises the rest', () => {
    expect(moreDatesLine(8)).toBe('and 8 more dates')
  })

  it('says nothing for a one-off', () => {
    expect(moreDatesLine(0)).toBeNull()
    expect(moreDatesLine(-3)).toBeNull()
    expect(moreDatesLine(Number.NaN)).toBeNull()
  })

  it('spells the singular member', () => {
    expect(memberCountLine(1)).toBe('1 member')
    expect(memberCountLine(12)).toBe('12 members')
    expect(memberCountLine(0)).toBe('0 members')
  })
})
