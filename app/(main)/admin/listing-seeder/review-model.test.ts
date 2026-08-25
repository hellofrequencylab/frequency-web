// Unit tests for the PURE listing-seeder review model. Covers BOTH kinds: the field sets,
// the provenance badges pulled from the ledger, the deposit ledger-key remap, the amenity
// aggregate provenance, and the empty tally. No React / Next / Supabase.

import { describe, it, expect } from 'vitest'
import type { ProvenanceLedger } from '@/lib/importer/schema'
import type { ClassifiedsDraft, HousingDraft } from '@/lib/listing-seeder/types'
import {
  buildListingReviewModel,
  listingDraftTitle,
  CLASSIFIEDS_SPECS,
  HOUSING_SPECS,
  CLASSIFIEDS_DRAFT_KEYS,
  HOUSING_DRAFT_KEYS,
} from './review-model'
import { HOUSING_MANIFEST } from '@/lib/studio/entities/housing'
import { LISTING_MANIFEST } from '@/lib/studio/entities/listing'

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

// ── The JOIN between the Studio manifests and this board (ADR-1151) ────────────────────────────
//
// The field lists are DERIVED from the manifests now, so the failure this suite has to catch is no
// longer "someone edited one list and not the other" — it is the subtler one the derivation makes
// possible: a manifest field, a draft key, or a mapping table drifting so that a field silently
// STOPS being reviewable. A field that vanishes from the board does not error. It just quietly
// stops being checked by a human before it publishes, which is the whole job of this screen.
//
// So these assert the CONSEQUENCE — what an operator can actually see and edit — never the shape of
// the derivation that produced it.
describe('the manifest -> board join', () => {
  const SEEDER_ONLY = new Set(['contact', 'details'])
  // Draft keys the board deliberately does not review, each with the reason it is absent.
  const NOT_REVIEWED: Record<string, string> = {
    // Reviewed in the board's own gallery, not as a text row.
    images: 'photos have their own editor',
    // Always 'area' for a seeded listing; the operator is never offered a scraped exact address.
    pickupPrecision: 'fixed at area for every seeded listing',
  }

  it('reviews every classifieds draft key that is not explicitly exempt', () => {
    const shown = new Set(CLASSIFIEDS_SPECS.map((s) => s.path))
    for (const key of CLASSIFIEDS_DRAFT_KEYS) {
      if (NOT_REVIEWED[key]) continue
      expect(shown, `classifieds draft key "${key}" is not reviewable on the board`).toContain(key)
    }
  })

  it('reviews every housing draft key that is not explicitly exempt', () => {
    const shown = new Set(HOUSING_SPECS.map((s) => s.path))
    for (const key of HOUSING_DRAFT_KEYS) {
      if (NOT_REVIEWED[key]) continue
      expect(shown, `housing draft key "${key}" is not reviewable on the board`).toContain(key)
    }
  })

  it('shows no field the draft cannot carry (an always-empty row reads as a gap in the paste)', () => {
    for (const s of CLASSIFIEDS_SPECS) expect(CLASSIFIEDS_DRAFT_KEYS).toContain(s.path)
    for (const s of HOUSING_SPECS) expect(HOUSING_DRAFT_KEYS).toContain(s.path)
  })

  it('sources every non-seeder field from a manifest field (nothing is hand-declared any more)', () => {
    const manifestPaths = (m: typeof HOUSING_MANIFEST, alias: Record<string, string> = {}) =>
      new Set(m.fields.map((f) => alias[f.path] ?? f.path))
    const listing = manifestPaths(LISTING_MANIFEST, { kind: 'listingKind' })
    const housing = manifestPaths(HOUSING_MANIFEST)
    for (const s of CLASSIFIEDS_SPECS) {
      if (SEEDER_ONLY.has(s.path)) continue
      expect(listing, `"${s.path}" is on the board but in no manifest`).toContain(s.path)
    }
    for (const s of HOUSING_SPECS) {
      if (SEEDER_ONLY.has(s.path)) continue
      expect(housing, `"${s.path}" is on the board but in no manifest`).toContain(s.path)
    }
  })

  it('gives every select a non-empty option set (an empty dropdown can never be set)', () => {
    for (const s of [...CLASSIFIEDS_SPECS, ...HOUSING_SPECS]) {
      if (s.input !== 'select' && s.input !== 'amenities') continue
      expect(s.options?.length, `"${s.path}" renders a picker with no choices`).toBeGreaterThan(0)
    }
  })

  it('keeps the deposit ledger remap, which the coercer depends on', () => {
    expect(HOUSING_SPECS.find((s) => s.path === 'depositDollars')?.ledgerKey).toBe('deposit')
  })

  // The exact field SET both boards shipped with before the derivation landed. Pinned so the
  // refactor is provably behaviour-preserving: same paths, same sections, same editors. Order
  // within a section now follows the manifest, which is the one intended difference.
  it('derives exactly the field set the board shipped with', () => {
    const sig = (xs: readonly { path: string; section: string; input: string }[]) =>
      xs.map((s) => `${s.path}|${s.section}|${s.input}`).sort()

    expect(sig(CLASSIFIEDS_SPECS)).toEqual(
      [
        'title|basics|text', 'description|basics|textarea', 'listingKind|basics|select',
        'category|basics|text', 'details|details|details', 'priceNote|price|text',
        'neighborhood|location|text', 'city|location|text', 'contact|contact|text',
      ].sort(),
    )

    expect(sig(HOUSING_SPECS)).toEqual(
      [
        'title|basics|text', 'description|basics|textarea', 'propertyType|basics|select',
        'bedrooms|details|number', 'bathrooms|details|number', 'sqft|details|number',
        'availableFrom|details|text', 'furnished|details|bool', 'petsOk|details|bool',
        'utilitiesIncluded|details|bool', 'smokingOk|details|bool', 'cannabisOk|details|bool',
        'amenities|details|amenities', 'rentDollars|price|number', 'depositDollars|price|number',
        'neighborhood|location|text', 'city|location|text', 'contact|contact|text',
      ].sort(),
    )
  })
})
