// Unit tests for the PURE listing-seeder review model. Covers BOTH kinds: the field sets,
// the provenance badges pulled from the ledger, the deposit ledger-key remap, the amenity
// aggregate provenance, and the empty tally. No React / Next / Supabase.

import { describe, it, expect } from 'vitest'
import type { ProvenanceLedger } from '@/lib/importer/schema'
import type { ClassifiedsDraft, HousingDraft } from '@/lib/listing-seeder/types'
import { buildListingReviewModel, listingDraftTitle } from './review-model'

function classifiedsDraft(over: Partial<ClassifiedsDraft> = {}): ClassifiedsDraft {
  return {
    kind: 'classifieds',
    title: 'Vintage oak desk',
    description: 'Solid oak, one owner.',
    listingKind: 'offer',
    category: 'Furniture',
    priceNote: '$120 obo',
    details: [{ label: 'Condition', value: 'Like new' }],
    pickupPrecision: 'area',
    neighborhood: 'Leucadia',
    city: 'Encinitas',
    contact: 'text 555-0100',
    images: [],
    ...over,
  }
}

function housingDraft(over: Partial<HousingDraft> = {}): HousingDraft {
  return {
    kind: 'housing',
    title: 'Sunny 2BR near the beach',
    description: 'Bright corner unit.',
    propertyType: 'apartment',
    amenities: ['parking', 'in_unit_laundry'] as HousingDraft['amenities'],
    rentDollars: 2400,
    depositDollars: 2400,
    bedrooms: 2,
    bathrooms: 1,
    sqft: 900,
    availableFrom: 'Aug 1',
    furnished: false,
    petsOk: true,
    utilitiesIncluded: null,
    smokingOk: false,
    cannabisOk: null,
    neighborhood: 'Cardiff',
    city: 'Encinitas',
    contact: 'email jane@example.com',
    images: [],
    ...over,
  }
}

const fieldByPath = (m: ReturnType<typeof buildListingReviewModel>, path: string) =>
  m.sections.flatMap((s) => s.fields).find((f) => f.path === path)

describe('buildListingReviewModel — classifieds', () => {
  it('emits the classifieds field set with kind on the model', () => {
    const model = buildListingReviewModel(classifiedsDraft(), {})
    expect(model.kind).toBe('classifieds')
    expect(model.title).toBe('Vintage oak desk')
    const paths = model.sections.flatMap((s) => s.fields).map((f) => f.path)
    expect(paths).toEqual(
      expect.arrayContaining(['title', 'description', 'listingKind', 'category', 'priceNote', 'neighborhood', 'city', 'contact']),
    )
    // No housing-only fields leak in.
    expect(paths).not.toContain('rentDollars')
    expect(paths).not.toContain('amenities')
  })

  it('renders the listingKind as a select with the marketplace options', () => {
    const model = buildListingReviewModel(classifiedsDraft({ listingKind: 'free' }), {})
    const f = fieldByPath(model, 'listingKind')
    expect(f?.input).toBe('select')
    expect(f?.raw).toBe('free')
    expect(f?.options?.some((o) => o.value === 'offer')).toBe(true)
  })

  it('reads provenance badge + snippet from the ledger', () => {
    const ledger: ProvenanceLedger = {
      priceNote: [{ kind: 'fact', confidence: 0.9, snippet: '$120 obo', verifiedBy: 'auto' }],
      description: [{ kind: 'generated', confidence: 0.5 }],
    }
    const model = buildListingReviewModel(classifiedsDraft(), ledger)
    expect(fieldByPath(model, 'priceNote')?.provenanceKind).toBe('fact')
    expect(fieldByPath(model, 'priceNote')?.snippet).toBe('$120 obo')
    expect(fieldByPath(model, 'description')?.provenanceKind).toBe('generated')
    // A field with no ledger entry has a null badge.
    expect(fieldByPath(model, 'city')?.provenanceKind).toBeNull()
    expect(model.summary.facts).toBe(1)
    expect(model.summary.generated).toBe(1)
  })

  it('counts empty fields', () => {
    const model = buildListingReviewModel(classifiedsDraft({ category: null, priceNote: null }), {})
    expect(model.summary.empty).toBe(2)
    expect(fieldByPath(model, 'category')?.display).toBe('')
  })
})

describe('buildListingReviewModel — housing', () => {
  it('emits the housing field set including details + amenities', () => {
    const model = buildListingReviewModel(housingDraft(), {})
    expect(model.kind).toBe('housing')
    const paths = model.sections.flatMap((s) => s.fields).map((f) => f.path)
    expect(paths).toEqual(
      expect.arrayContaining([
        'propertyType', 'bedrooms', 'bathrooms', 'sqft', 'availableFrom',
        'furnished', 'petsOk', 'utilitiesIncluded', 'smokingOk', 'cannabisOk',
        'amenities', 'rentDollars', 'depositDollars',
      ]),
    )
    // No classifieds-only field.
    expect(paths).not.toContain('priceNote')
  })

  it('renders bool fields as Yes / No / (unset)', () => {
    const model = buildListingReviewModel(housingDraft(), {})
    expect(fieldByPath(model, 'petsOk')?.display).toBe('Yes')
    expect(fieldByPath(model, 'petsOk')?.raw).toBe(true)
    expect(fieldByPath(model, 'furnished')?.display).toBe('No')
    expect(fieldByPath(model, 'utilitiesIncluded')?.display).toBe('')
    expect(fieldByPath(model, 'utilitiesIncluded')?.raw).toBeNull()
  })

  it('renders amenities as a joined label string and an array raw value', () => {
    const model = buildListingReviewModel(housingDraft(), {})
    const f = fieldByPath(model, 'amenities')
    expect(f?.input).toBe('amenities')
    expect(Array.isArray(f?.raw)).toBe(true)
    expect((f?.raw as string[]).length).toBe(2)
    expect(f?.display.length).toBeGreaterThan(0)
  })

  it('remaps the deposit ledger key (deposit -> depositDollars field)', () => {
    const ledger: ProvenanceLedger = {
      deposit: [{ kind: 'fact', confidence: 1, snippet: 'deposit $2400', verifiedBy: 'auto' }],
      rentDollars: [{ kind: 'fact', confidence: 1, snippet: '$2400/mo' }],
    }
    const model = buildListingReviewModel(housingDraft(), ledger)
    expect(fieldByPath(model, 'depositDollars')?.provenanceKind).toBe('fact')
    expect(fieldByPath(model, 'depositDollars')?.snippet).toBe('deposit $2400')
    expect(fieldByPath(model, 'rentDollars')?.raw).toBe(2400)
  })

  it('aggregates amenity provenance across indexed ledger keys', () => {
    const ledger: ProvenanceLedger = {
      'amenities[0]': [{ kind: 'inferred', confidence: 0.6 }],
      'amenities[1]': [{ kind: 'fact', confidence: 0.9, snippet: 'in-unit laundry' }],
    }
    const model = buildListingReviewModel(housingDraft(), ledger)
    // fact wins the aggregate.
    expect(fieldByPath(model, 'amenities')?.provenanceKind).toBe('fact')
  })

  it('numbers coerce cleanly and null renders empty', () => {
    const model = buildListingReviewModel(housingDraft({ sqft: null, rentDollars: 1800 }), {})
    expect(fieldByPath(model, 'sqft')?.raw).toBeNull()
    expect(fieldByPath(model, 'sqft')?.display).toBe('')
    expect(fieldByPath(model, 'rentDollars')?.raw).toBe(1800)
    expect(fieldByPath(model, 'rentDollars')?.display).toBe('1800')
  })
})

describe('listingDraftTitle', () => {
  it('falls back to a placeholder for a blank / missing title', () => {
    expect(listingDraftTitle({ title: '' })).toBe('Untitled listing')
    expect(listingDraftTitle(null)).toBe('Untitled listing')
    expect(listingDraftTitle({ title: '  Desk  ' })).toBe('Desk')
  })
})
