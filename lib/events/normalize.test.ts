import { describe, it, expect } from 'vitest'
import { coerceEventExtraction, coerceEventDetails, clampImageBox, coerceCorners, coerceQuality, coerceDomain, coerceIsoDate } from './normalize'

// The poster and text-assist reply is untrusted. These readers go through a schema (PROG-E8C): a valid reply comes
// out as the stored shape, and a malformed one falls to each field's safe reading without throwing. No model is
// called: every test hands the reader the object a model would have returned.

const EMPTY_EVENT = {
  title: '',
  description: '',
  startsAt: '',
  endsAt: '',
  location: '',
  isFree: false,
  priceCents: null,
  organizerName: '',
  organizerContact: '',
  domain: null,
  tags: [],
  cover: { found: false, box: null, imageIndex: 0 },
  corners: null,
  quality: { legible: true, glare: false, skew: false, note: null },
  details: {},
}

describe('coerceEventExtraction', () => {
  it('reads a valid reply into the stored shape', () => {
    const e = coerceEventExtraction({
      title: '  Sound Bath ',
      description: 'A calm evening.',
      startsAt: '2027-03-01T19:00:00Z',
      endsAt: '2027-03-01T21:00:00Z',
      location: 'The Loft, Austin',
      priceCents: '1500',
      organizerName: 'Mara',
      organizerContact: '@mara',
      domain: ' Body ',
      tags: ['#Sound', 'sound', ' deep  rest '],
      cover: { found: true, box: { x: 0.1, y: '0.2', w: 0.5, h: 0.4 }, imageIndex: 1.7 },
      corners: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }],
      quality: { legible: false, glare: true, note: ' Hold it flat ' },
      details: { lineup: [{ name: 'DJ A', role: 'DJ', confidence: 'High' }], features: ['Food'] },
    })
    expect(e).toEqual({
      title: 'Sound Bath',
      description: 'A calm evening.',
      startsAt: '2027-03-01T19:00:00.000Z',
      endsAt: '2027-03-01T21:00:00.000Z',
      location: 'The Loft, Austin',
      isFree: false,
      priceCents: 1500,
      organizerName: 'Mara',
      organizerContact: '@mara',
      domain: 'body',
      tags: ['sound', 'deep rest'],
      cover: { found: true, box: { x: 0.1, y: 0.2, w: 0.5, h: 0.4 }, imageIndex: 1 },
      corners: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }],
      quality: { legible: false, glare: true, skew: false, note: 'Hold it flat' },
      details: { lineup: [{ name: 'DJ A', role: 'dj', confidence: 'high' }], features: ['Food'] },
    })
  })

  it('reads a reply that is not an object as an empty event, without throwing', () => {
    for (const junk of [undefined, null, 'nope', 42, true, []]) expect(coerceEventExtraction(junk)).toEqual(EMPTY_EVENT)
  })

  it('lets each wrong-typed field fall to its own safe reading and keeps the rest', () => {
    const e = coerceEventExtraction({
      title: 'Open Mic',
      description: 7,
      startsAt: 'not a date',
      endsAt: 12,
      location: ['x'],
      isFree: 'yes',
      priceCents: -5,
      organizerName: {},
      domain: 'sports',
      tags: 'music',
      cover: 'top',
      corners: [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }],
      quality: 9,
      details: 'lots',
    })
    expect(e).toEqual({ ...EMPTY_EVENT, title: 'Open Mic' })
  })

  it('reads the older snake_case keys, and free wins over a price', () => {
    const e = coerceEventExtraction({ starts_at: '2027-05-01', ends_at: '2027-04-01', organizer_name: 'Sam', organizer_contact: 'sam@x.test', free: true, priceCents: 900 })
    expect(e.startsAt).toBe('2027-05-01T00:00:00.000Z')
    expect(e.endsAt).toBe('') // an end before the start is dropped
    expect(e.organizerName).toBe('Sam')
    expect(e.organizerContact).toBe('sam@x.test')
    expect(e.isFree).toBe(true)
    expect(e.priceCents).toBeNull()
  })
})

describe('coerceEventDetails', () => {
  it('keeps valid rows, whitelists enums, makes links safe and leaves out empty keys', () => {
    expect(
      coerceEventDetails({
        lineup: [{ name: 'DJ A', role: 'DJ', note: 'late', imageBox: { x: 0, y: 0, w: 0.5, h: 0.5 } }, { role: 'band' }],
        schedule: [{ title: 'Doors', time: '7pm' }],
        tickets: [{ label: 'GA', priceCents: '1500' }, { label: 'VIP', priceCents: -1 }],
        links: [{ url: 'example.com/t', kind: 'Tickets' }, { url: 'javascript:alert(1)', label: 'bad' }],
        sponsors: ['Acme', 5, ' '],
        imageRegions: [{ box: { x: 0, y: 0, w: 0.4, h: 0.4 }, kind: 'nope' }, { box: { x: 0, y: 0, w: 0, h: 0 } }],
        other: [{ label: 'Age', value: '21+' }, { label: 'no value' }],
        confidence: 'LOW',
      }),
    ).toEqual({
      lineup: [{ name: 'DJ A', role: 'dj', note: 'late', imageBox: { x: 0, y: 0, w: 0.5, h: 0.5 } }],
      schedule: [{ title: 'Doors', time: '7pm' }],
      tickets: [{ label: 'GA', priceCents: 1500 }, { label: 'VIP' }],
      links: [{ label: 'https://example.com/t', url: 'https://example.com/t', kind: 'tickets' }],
      sponsors: ['Acme'],
      imageRegions: [{ box: { x: 0, y: 0, w: 0.4, h: 0.4 }, kind: 'photo' }],
      other: [{ label: 'Age', value: '21+' }],
      confidence: 'low',
    })
  })

  it('returns {} for a malformed harvest and drops rows that are not objects', () => {
    for (const junk of [undefined, null, 'x', 3, []]) expect(coerceEventDetails(junk)).toEqual({})
    expect(coerceEventDetails({ lineup: 'DJ A', schedule: [null, 'Doors', 4], features: {}, tickets: [[]], links: 7, confidence: 3 })).toEqual({})
  })

  it('caps every list', () => {
    const many = Array.from({ length: 40 }, (_, i) => ({ name: `Act ${i}`, title: `Slot ${i}`, label: `Tier ${i}`, value: 'v', url: `a${i}.test` }))
    const d = coerceEventDetails({ lineup: many, schedule: many, tickets: many, links: many, other: many, features: many.map((m) => m.name), sponsors: many.map((m) => m.name) })
    expect([d.lineup?.length, d.schedule?.length, d.tickets?.length, d.links?.length, d.other?.length, d.features?.length, d.sponsors?.length]).toEqual([24, 24, 8, 10, 16, 16, 16])
  })
})

describe('the small readers', () => {
  it('clampImageBox clamps into the unit square, accepts numeric strings and rejects the rest', () => {
    expect(clampImageBox({ x: -0.2, y: 0.5, w: 2, h: '0.9' })).toEqual({ x: 0, y: 0.5, w: 1, h: 0.5 })
    expect(clampImageBox({ x: 0, y: 0, w: 0.005, h: 0.5 })).toBeNull()
    expect(clampImageBox({ x: 0, y: 0, w: 'wide', h: 0.5 })).toBeNull()
    expect(clampImageBox(null)).toBeNull()
  })

  it('coerceCorners keeps a quad only when all four points are within 0..1', () => {
    const quad = [{ x: 0, y: 0 }, { x: '1', y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }]
    expect(coerceCorners(quad)).toEqual([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }])
    expect(coerceCorners(quad.slice(0, 3))).toBeNull()
    expect(coerceCorners([...quad.slice(0, 3), { x: 1.2, y: 1 }])).toBeNull()
    expect(coerceCorners([...quad.slice(0, 3), null])).toBeNull()
    expect(coerceCorners('corners')).toBeNull()
  })

  it('coerceQuality, coerceDomain and coerceIsoDate fall to their defaults on junk', () => {
    expect(coerceQuality({ legible: false, skew: true, note: 'tilt it' })).toEqual({ legible: false, glare: false, skew: true, note: 'tilt it' })
    expect(coerceQuality('blurry')).toEqual({ legible: true, glare: false, skew: false, note: null })
    expect(coerceDomain(' Spirit ')).toBe('spirit')
    expect(coerceDomain(4)).toBeNull()
    expect(coerceIsoDate('2027-03-01')).toBe('2027-03-01T00:00:00.000Z')
    expect(coerceIsoDate('1900-01-01')).toBe('')
    expect(coerceIsoDate(20270301)).toBe('')
  })
})
