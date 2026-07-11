import { describe, expect, it } from 'vitest'
import { AMENITIES, PROPERTY_TYPES } from './types'
import {
  amenityLabel,
  propertyTypeLabel,
  sanitizeSeekerPreferences,
  toAmenities,
  toPropertyType,
} from './housing'

// The controlled vocabularies must stay in lockstep with the DB CHECKs in
// migration 20261129000000 (housing_listings_amenities_vocab + the property_type
// CHECK). If a slug is added/removed here without the migration, a write would be
// rejected by Postgres — this guards the app half of that contract.

const DB_PROPERTY_TYPES = ['house', 'apartment', 'studio', 'condo', 'townhouse', 'room', 'other']
const DB_AMENITIES = [
  'in_unit_laundry',
  'laundry_shared',
  'ac',
  'heat',
  'dishwasher',
  'parking',
  'garage',
  'outdoor_space',
  'internet',
  'storage',
  'pool',
  'gym',
  'ev_charging',
  'wheelchair_accessible',
]

describe('housing controlled vocabularies', () => {
  it('property types match the DB CHECK slug set', () => {
    expect(new Set(PROPERTY_TYPES.map((p) => p.slug))).toEqual(new Set(DB_PROPERTY_TYPES))
  })

  it('amenities match the DB CHECK slug set', () => {
    expect(new Set(AMENITIES.map((a) => a.slug))).toEqual(new Set(DB_AMENITIES))
  })
})

describe('toPropertyType', () => {
  it('accepts a valid slug', () => {
    expect(toPropertyType('apartment')).toBe('apartment')
  })
  it('rejects an unknown or non-string value', () => {
    expect(toPropertyType('mansion')).toBeNull()
    expect(toPropertyType(null)).toBeNull()
    expect(toPropertyType(42)).toBeNull()
  })
})

describe('toAmenities', () => {
  it('keeps only recognised slugs', () => {
    expect(toAmenities(['ac', 'not_real', 'parking'])).toEqual(['ac', 'parking'])
  })
  it('dedupes repeats', () => {
    expect(toAmenities(['pool', 'pool', 'gym'])).toEqual(['pool', 'gym'])
  })
  it('returns an empty array for no input', () => {
    expect(toAmenities([])).toEqual([])
  })
})

describe('sanitizeSeekerPreferences', () => {
  it('keeps recognised lifestyle values and drops unknowns', () => {
    const out = sanitizeSeekerPreferences({
      cleanliness: '4',
      social_level: 'homebody',
      schedule: 'night_owl',
      diet: 'vegan',
      pets: 'no_pets',
      smoking: 'no',
      cannabis: 'outside_only',
      arrangement: 'shared',
    })
    expect(out).toMatchObject({
      cleanliness: 4,
      social_level: 'homebody',
      schedule: 'night_owl',
      diet: 'vegan',
      pets: 'no_pets',
      smoking: 'no',
      cannabis: 'outside_only',
      arrangement: 'shared',
    })
  })

  it('rejects out-of-range cleanliness and unknown enum values', () => {
    const out = sanitizeSeekerPreferences({ cleanliness: '9', social_level: 'party_animal', diet: 'carnivore' })
    expect(out.cleanliness).toBeUndefined()
    expect(out.social_level).toBeUndefined()
    expect(out.diet).toBeUndefined()
  })

  it('keeps gender_pref only for shared-living intents (Fair Housing)', () => {
    const shared = sanitizeSeekerPreferences({ arrangement: 'shared', gender_pref: 'women' })
    expect(shared.gender_pref).toBe('women')

    const priv = sanitizeSeekerPreferences({ arrangement: 'private', gender_pref: 'women' })
    expect(priv.gender_pref).toBeUndefined()
    expect(priv.arrangement).toBe('private')
  })

  it('defaults arrangement to shared and normalises a soft age range', () => {
    const out = sanitizeSeekerPreferences({ age_min: '40', age_max: '25' })
    expect(out.arrangement).toBe('shared')
    // min/max are ordered regardless of which field held the larger number.
    expect(out.age_pref).toEqual({ min: 25, max: 40 })
  })

  it('drops an invalid gender_pref value even when shared', () => {
    const out = sanitizeSeekerPreferences({ arrangement: 'shared', gender_pref: 'tall_people' })
    expect(out.gender_pref).toBeUndefined()
  })
})

describe('labels', () => {
  it('resolves a property type label', () => {
    expect(propertyTypeLabel('studio')).toBe('Studio')
    expect(propertyTypeLabel(null)).toBeNull()
  })
  it('falls back to the slug for an unknown amenity', () => {
    expect(amenityLabel('ac')).toBe('Air conditioning')
    expect(amenityLabel('mystery')).toBe('mystery')
  })
})
