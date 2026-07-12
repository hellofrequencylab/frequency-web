import { describe, it, expect } from 'vitest'

// The listing coercer mirrors the importer's grounding gate: a field the model labeled 'fact' whose
// snippet is NOT in the paste is downgraded to 'inferred' (no laundering a guess into a fact). It also
// coerces the controlled vocabularies (listing kind, property type, amenities) + parses numbers/bools.

import {
  coerceListingExtraction,
  coerceDetails,
  clampListingKind,
  parseDollars,
  parseCount,
  parseInteger,
  parseBool,
} from './coerce'
import type { ClassifiedsExtraction, HousingExtraction } from './types'

const PASTE_CLS =
  'Selling a barely used road bike, $250. Great condition. In Bernal Heights, SF. Text Sam at 555-0142.'

const PASTE_HOUSING =
  'Sunny 2 bedroom apartment in the Mission, $2800/mo. 1 bath, 850 sqft. In-unit laundry and parking. ' +
  'Cats ok, no smoking. Available March 1. Email lease@example.com.'

describe('clampListingKind', () => {
  it('accepts the four valid kinds (case-insensitive)', () => {
    expect(clampListingKind('offer')).toBe('offer')
    expect(clampListingKind('FREE')).toBe('free')
    expect(clampListingKind('lend')).toBe('lend')
    expect(clampListingKind('request')).toBe('request')
  })
  it('defaults an unknown / missing kind to offer', () => {
    expect(clampListingKind('sale')).toBe('offer')
    expect(clampListingKind(undefined)).toBe('offer')
    expect(clampListingKind('')).toBe('offer')
  })
})

describe('numeric + boolean parsers', () => {
  it('parseDollars pulls a major-unit number out of price copy', () => {
    expect(parseDollars('$2,800/mo')).toBe(2800)
    expect(parseDollars('from 250')).toBe(250)
    expect(parseDollars(undefined)).toBeNull()
    expect(parseDollars('call for price')).toBeNull()
  })
  it('parseCount handles fractional baths; parseInteger rounds', () => {
    expect(parseCount('1.5 bath')).toBe(1.5)
    expect(parseCount('2')).toBe(2)
    expect(parseInteger('850 sqft')).toBe(850)
    expect(parseCount('none')).toBeNull()
  })
  it('parseBool reads yes/no with negatives winning', () => {
    expect(parseBool('yes')).toBe(true)
    expect(parseBool('cats ok')).toBe(true)
    expect(parseBool('no smoking')).toBe(false)
    expect(parseBool('unfurnished')).toBe(false)
    expect(parseBool('maybe')).toBeNull()
    expect(parseBool(undefined)).toBeNull()
  })
})

describe('coerceListingExtraction — classifieds', () => {
  const raw: ClassifiedsExtraction = {
    kind: 'classifieds',
    title: { value: 'Road bike', kind: 'inferred', confidence: 0.8 },
    description: { value: 'Barely used road bike in great condition.', kind: 'generated' },
    listingKind: { value: 'offer', kind: 'inferred' },
    priceNote: { value: '$250', snippet: '$250', kind: 'fact', confidence: 0.95 },
    contact: { value: '555-0142', snippet: 'Sam at 555-0142', kind: 'fact', confidence: 0.9 },
    city: { value: 'SF', snippet: 'SF', kind: 'fact' },
  }

  it('coerces the draft shape + keeps a grounded price/contact as fact', () => {
    const { draft, ledger } = coerceListingExtraction(raw, 'classifieds', PASTE_CLS)
    expect(draft.kind).toBe('classifieds')
    if (draft.kind !== 'classifieds') throw new Error('kind')
    expect(draft.title).toBe('Road bike')
    expect(draft.listingKind).toBe('offer')
    expect(draft.priceNote).toBe('$250')
    expect(draft.contact).toBe('555-0142')
    expect(draft.images).toEqual([])
    expect(ledger['priceNote'][0].kind).toBe('fact')
    expect(ledger['contact'][0].kind).toBe('fact')
  })

  it('coerces item-detail chips and defaults pickup precision to area', () => {
    const withDetails: ClassifiedsExtraction = {
      ...raw,
      details: [
        { label: 'Condition', value: 'Like new' },
        { label: ' Brand ', value: ' West Elm ' },
        { label: 'Missing value', value: '' }, // dropped
        { value: 'no label' }, // dropped
      ],
    }
    const { draft } = coerceListingExtraction(withDetails, 'classifieds', PASTE_CLS)
    if (draft.kind !== 'classifieds') throw new Error('kind')
    expect(draft.details).toEqual([
      { label: 'Condition', value: 'Like new' },
      { label: 'Brand', value: 'West Elm' },
    ])
    expect(draft.pickupPrecision).toBe('area')
  })

  it('DOWNGRADES an un-cited price fact to inferred (grounding gate)', () => {
    const bad: ClassifiedsExtraction = {
      kind: 'classifieds',
      title: { value: 'Road bike', kind: 'generated' },
      priceNote: { value: '$900', snippet: '$900', kind: 'fact', confidence: 0.95 },
    }
    const { ledger } = coerceListingExtraction(bad, 'classifieds', PASTE_CLS)
    expect(ledger['priceNote'][0].kind).toBe('inferred')
    expect(ledger['priceNote'][0].confidence).toBeLessThanOrEqual(0.4)
  })
})

describe('coerceDetails', () => {
  it('trims, drops rows missing a label or value, and caps the count', () => {
    expect(coerceDetails(undefined)).toEqual([])
    expect(
      coerceDetails([
        { label: ' Color ', value: ' Walnut ' },
        { label: 'Empty', value: '  ' },
        { label: '', value: 'no label' },
      ]),
    ).toEqual([{ label: 'Color', value: 'Walnut' }])
    const many = Array.from({ length: 30 }, (_, i) => ({ label: `L${i}`, value: `V${i}` }))
    expect(coerceDetails(many)).toHaveLength(20)
  })
})

describe('coerceListingExtraction — housing', () => {
  const raw: HousingExtraction = {
    kind: 'housing',
    title: { value: 'Sunny 2 bedroom in the Mission', kind: 'inferred' },
    propertyType: { value: 'apartment', kind: 'fact', snippet: 'apartment' },
    amenities: [
      { value: 'in_unit_laundry', kind: 'fact', snippet: 'In-unit laundry' },
      { value: 'parking', kind: 'fact', snippet: 'parking' },
      { value: 'moon_roof', kind: 'generated' }, // not in the controlled vocab -> dropped
    ],
    rentDollars: { value: '2800', snippet: '$2800/mo', kind: 'fact', confidence: 0.95 },
    bedrooms: { value: '2', snippet: '2 bedroom', kind: 'fact' },
    bathrooms: { value: '1', snippet: '1 bath', kind: 'fact' },
    sqft: { value: '850', snippet: '850 sqft', kind: 'fact' },
    petsOk: { value: 'cats ok', snippet: 'Cats ok', kind: 'fact' },
    smokingOk: { value: 'no smoking', snippet: 'no smoking', kind: 'fact' },
    availableFrom: { value: 'March 1', snippet: 'Available March 1', kind: 'fact' },
    contact: { value: 'lease@example.com', snippet: 'lease@example.com', kind: 'fact' },
  }

  it('coerces the housing draft: property type, amenity vocab, numbers, bools', () => {
    const { draft } = coerceListingExtraction(raw, 'housing', PASTE_HOUSING)
    if (draft.kind !== 'housing') throw new Error('kind')
    expect(draft.propertyType).toBe('apartment')
    expect(draft.amenities).toEqual(['in_unit_laundry', 'parking']) // moon_roof dropped by toAmenities
    expect(draft.rentDollars).toBe(2800)
    expect(draft.bedrooms).toBe(2)
    expect(draft.bathrooms).toBe(1)
    expect(draft.sqft).toBe(850)
    expect(draft.petsOk).toBe(true)
    expect(draft.smokingOk).toBe(false)
    expect(draft.availableFrom).toBe('March 1')
    expect(draft.contact).toBe('lease@example.com')
    expect(draft.images).toEqual([])
  })

  it('rejects a hallucinated property type (not in vocab) to null', () => {
    const bad: HousingExtraction = {
      kind: 'housing',
      title: { value: 'Place', kind: 'generated' },
      propertyType: { value: 'castle', kind: 'generated' },
    }
    const { draft } = coerceListingExtraction(bad, 'housing', PASTE_HOUSING)
    if (draft.kind !== 'housing') throw new Error('kind')
    expect(draft.propertyType).toBeNull()
  })
})
