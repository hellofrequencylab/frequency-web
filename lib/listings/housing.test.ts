import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ACCESSIBILITY_TAGS, AMENITIES, LAUNDRY_OPTIONS, PARKING_OPTIONS, PROPERTY_TYPES } from './types'
import {
  amenityLabel,
  fitChips,
  matchRoommateSeekers,
  propertyTypeLabel,
  resolveAddressDisplay,
  sanitizeSeekerPreferences,
  seekerPreferencesToLifestyle,
  toAccessibilityTags,
  toAddressPrecision,
  toAmenities,
  toLaundry,
  toParking,
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

// Tier B vocabularies (migration 20270111000000, ADR-867).
const DB_PARKING = ['none', 'street', 'driveway', 'garage']
const DB_LAUNDRY = ['none', 'in_unit', 'on_site', 'nearby']
const DB_ACCESSIBILITY = [
  'step_free',
  'elevator',
  'ground_floor',
  'wide_doorways',
  'roll_in_shower',
  'grab_bars',
  'accessible_parking',
]

describe('housing controlled vocabularies', () => {
  it('property types match the DB CHECK slug set', () => {
    expect(new Set(PROPERTY_TYPES.map((p) => p.slug))).toEqual(new Set(DB_PROPERTY_TYPES))
  })

  it('amenities match the DB CHECK slug set', () => {
    expect(new Set(AMENITIES.map((a) => a.slug))).toEqual(new Set(DB_AMENITIES))
  })

  it('parking, laundry, and accessibility match their DB CHECK slug sets', () => {
    expect(new Set(PARKING_OPTIONS.map((p) => p.slug))).toEqual(new Set(DB_PARKING))
    expect(new Set(LAUNDRY_OPTIONS.map((l) => l.slug))).toEqual(new Set(DB_LAUNDRY))
    expect(new Set(ACCESSIBILITY_TAGS.map((t) => t.slug))).toEqual(new Set(DB_ACCESSIBILITY))
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

describe('Tier B enum coercers (ADR-867)', () => {
  it('toParking accepts valid slugs and rejects everything else', () => {
    expect(toParking('garage')).toBe('garage')
    expect(toParking('street')).toBe('street')
    expect(toParking('valet')).toBeNull()
    expect(toParking('')).toBeNull()
    expect(toParking(null)).toBeNull()
    expect(toParking(3)).toBeNull()
  })

  it('toLaundry accepts valid slugs and rejects everything else', () => {
    expect(toLaundry('in_unit')).toBe('in_unit')
    expect(toLaundry('nearby')).toBe('nearby')
    expect(toLaundry('washboard')).toBeNull()
    expect(toLaundry(undefined)).toBeNull()
  })

  it('toAccessibilityTags whitelists, dedupes, and drops non-strings', () => {
    expect(toAccessibilityTags(['elevator', 'not_a_tag', 'elevator', 'step_free', 7, null])).toEqual([
      'elevator',
      'step_free',
    ])
    expect(toAccessibilityTags([])).toEqual([])
  })

  it('toAddressPrecision falls back to city (the most private) on anything unrecognised', () => {
    expect(toAddressPrecision('exact')).toBe('exact')
    expect(toAddressPrecision('neighborhood')).toBe('neighborhood')
    expect(toAddressPrecision('city')).toBe('city')
    expect(toAddressPrecision('gps')).toBe('city')
    expect(toAddressPrecision(null)).toBe('city')
    expect(toAddressPrecision(undefined)).toBe('city')
  })
})

describe('resolveAddressDisplay (the Tier B privacy resolver)', () => {
  const base = { city: 'Asheville', neighborhood: 'West End', addressLine: '412 Maple St' }

  it("'city' precision shows the city only, never the address", () => {
    expect(resolveAddressDisplay({ ...base, precision: 'city', signedIn: true })).toEqual({
      areaLabel: 'Asheville',
      addressLine: null,
    })
    expect(resolveAddressDisplay({ ...base, precision: 'city', signedIn: false })).toEqual({
      areaLabel: 'Asheville',
      addressLine: null,
    })
  })

  it("'neighborhood' precision adds the neighborhood, still no address", () => {
    expect(resolveAddressDisplay({ ...base, precision: 'neighborhood', signedIn: true })).toEqual({
      areaLabel: 'West End, Asheville',
      addressLine: null,
    })
  })

  it("'exact' precision reveals the address to signed-in viewers ONLY", () => {
    expect(resolveAddressDisplay({ ...base, precision: 'exact', signedIn: true })).toEqual({
      areaLabel: 'West End, Asheville',
      addressLine: '412 Maple St',
    })
    expect(resolveAddressDisplay({ ...base, precision: 'exact', signedIn: false })).toEqual({
      areaLabel: 'West End, Asheville',
      addressLine: null,
    })
  })

  it('handles missing pieces without junk separators', () => {
    expect(
      resolveAddressDisplay({ precision: 'neighborhood', city: null, neighborhood: 'West End', addressLine: null, signedIn: true }),
    ).toEqual({ areaLabel: 'West End', addressLine: null })
    expect(
      resolveAddressDisplay({ precision: 'city', city: '  ', neighborhood: 'West End', addressLine: null, signedIn: true }),
    ).toEqual({ areaLabel: null, addressLine: null })
    expect(
      resolveAddressDisplay({ precision: 'exact', city: 'Asheville', neighborhood: null, addressLine: '   ', signedIn: true }),
    ).toEqual({ areaLabel: 'Asheville', addressLine: null })
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

describe('seekerPreferencesToLifestyle', () => {
  it('round-trips stored preferences into the form prefill', () => {
    const stored = sanitizeSeekerPreferences({
      cleanliness: '4',
      social_level: 'homebody',
      schedule: 'night_owl',
      diet: 'vegan',
      pets: 'no_pets',
      smoking: 'no',
      cannabis: 'outside_only',
      arrangement: 'shared',
      gender_pref: 'women',
      age_min: '25',
      age_max: '40',
    })
    expect(seekerPreferencesToLifestyle(stored)).toEqual({
      cleanliness: '4',
      socialLevel: 'homebody',
      schedule: 'night_owl',
      diet: 'vegan',
      pets: 'no_pets',
      smoking: 'no',
      cannabis: 'outside_only',
      arrangement: 'shared',
      genderPref: 'women',
      ageMin: '25',
      ageMax: '40',
    })
  })

  it('is a fixed point: re-sanitizing the prefill reproduces the stored jsonb', () => {
    const stored = sanitizeSeekerPreferences({
      cleanliness: '2',
      schedule: 'flexible',
      pets: 'have_pets',
      arrangement: 'shared',
      gender_pref: 'same_as_me',
      age_min: '30',
    })
    const prefill = seekerPreferencesToLifestyle(stored)
    // Feed the prefill back through the save path exactly as the form submits it.
    const resaved = sanitizeSeekerPreferences({
      cleanliness: prefill.cleanliness ?? null,
      social_level: prefill.socialLevel ?? null,
      schedule: prefill.schedule ?? null,
      diet: prefill.diet ?? null,
      pets: prefill.pets ?? null,
      smoking: prefill.smoking ?? null,
      cannabis: prefill.cannabis ?? null,
      arrangement: prefill.arrangement ?? null,
      gender_pref: prefill.genderPref ?? null,
      age_min: prefill.ageMin ?? null,
      age_max: prefill.ageMax ?? null,
    })
    expect(resaved).toEqual(stored)
  })

  it('returns an empty prefill for missing or empty preferences', () => {
    expect(seekerPreferencesToLifestyle(null)).toEqual({})
    expect(seekerPreferencesToLifestyle(undefined)).toEqual({})
    expect(seekerPreferencesToLifestyle({})).toEqual({})
  })

  it('ignores unknown keys and malformed values', () => {
    expect(
      seekerPreferencesToLifestyle({
        cleanliness: 'four',
        mystery: 'x',
        age_pref: 'not-an-object',
        schedule: 42,
      }),
    ).toEqual({})
  })
})

describe('fitChips', () => {
  it('emits a chip per strong term, honoring each threshold', () => {
    expect(fitChips({ budget: 0.8, geo: 0.4, timing: 0.4, lifestyle: 0.4 })).toEqual(['Budget fits'])
    expect(fitChips({ budget: 0.4, geo: 0.8, timing: 0.4, lifestyle: 0.4 })).toEqual(['Close by'])
    expect(fitChips({ budget: 0.4, geo: 0.4, timing: 0.8, lifestyle: 0.4 })).toEqual(['Timing lines up'])
    // Lifestyle's threshold is lower (0.7) — 0.7 chips, 0.69 does not.
    expect(fitChips({ budget: 0.4, geo: 0.4, timing: 0.4, lifestyle: 0.7 })).toEqual(['Similar lifestyle'])
    expect(fitChips({ budget: 0.79, geo: 0.79, timing: 0.79, lifestyle: 0.69 })).toEqual([])
  })

  it('caps at 3 chips, strongest first', () => {
    const chips = fitChips({ budget: 0.9, geo: 1.0, timing: 0.85, lifestyle: 0.95 })
    expect(chips).toHaveLength(3)
    expect(chips).toEqual(['Close by', 'Similar lifestyle', 'Budget fits'])
  })

  it('is empty on all-unknown neutral 0.5s', () => {
    expect(fitChips({ budget: 0.5, geo: 0.5, timing: 0.5, lifestyle: 0.5 })).toEqual([])
  })

  it('names the city on the geo chip and respects distanceKnown', () => {
    expect(fitChips({ budget: 0, geo: 1, timing: 0, lifestyle: 0 }, { city: 'Asheville' })).toEqual([
      'Close to Asheville',
    ])
    expect(fitChips({ budget: 0, geo: 1, timing: 0, lifestyle: 0 }, { distanceKnown: false })).toEqual([])
  })
})

describe('matchRoommateSeekers', () => {
  const rpcRows = [
    {
      profile_id: 'p1',
      resonance: 0.72,
      city: 'Asheville',
      score: 0.81,
      budget_fit: 1,
      geo_fit: 1,
      timing_fit: 0.5,
      lifestyle_fit: 0.75,
    },
    // No readable profile row → dropped (no card, no match).
    { profile_id: 'p2', resonance: 0.4, city: null, score: 0.5 },
  ]
  const profileRows = [
    { id: 'p1', display_name: 'Rae Sun', handle: 'raesun', avatar_url: '/a/rae.jpg' },
  ]

  function fakeClient(data: unknown, profiles: unknown) {
    return {
      rpc: async () => ({ data }),
      from: () => ({ select: () => ({ in: async () => ({ data: profiles }) }) }),
    }
  }

  it('joins each match to its profile card and exposes the fit terms', async () => {
    const out = await matchRoommateSeekers(fakeClient(rpcRows, profileRows))
    expect(out).toEqual([
      {
        profileId: 'p1',
        displayName: 'Rae Sun',
        handle: 'raesun',
        avatarUrl: '/a/rae.jpg',
        resonance: 0.72,
        city: 'Asheville',
        score: 0.81,
        fits: { budget: 1, geo: 1, timing: 0.5, lifestyle: 0.75 },
      },
    ])
  })

  it('defaults missing fit columns to the neutral 0.5 (a v2 database chips nothing)', async () => {
    const out = await matchRoommateSeekers(
      fakeClient(
        [{ profile_id: 'p1', resonance: 0.2, city: null, score: 0.4 }],
        profileRows,
      ),
    )
    expect(out[0]?.fits).toEqual({ budget: 0.5, geo: 0.5, timing: 0.5, lifestyle: 0.5 })
    expect(fitChips(out[0]!.fits)).toEqual([])
  })

  it('fails safe to [] on an empty RPC result', async () => {
    expect(await matchRoommateSeekers(fakeClient(null, profileRows))).toEqual([])
    expect(await matchRoommateSeekers(fakeClient([], profileRows))).toEqual([])
  })
})

describe('migration 20270108000000 (matching v3) source shape', () => {
  const sql = readFileSync(
    resolve(process.cwd(), 'supabase/migrations/20270108000000_housing_matching_v3.sql'),
    'utf8',
  )

  it('expands BOTH match RPCs with the four fit columns', () => {
    for (const rpc of ['housing_match_candidates', 'housing_roommate_matches']) {
      const body = sql.slice(sql.indexOf(`create function public.${rpc}`))
      for (const col of ['budget_fit', 'geo_fit', 'timing_fit', 'lifestyle_fit']) {
        expect(body, `${rpc} returns ${col}`).toMatch(new RegExp(`${col}\\s+double precision`))
      }
    }
  })

  it('adds the reciprocal consent join on the listing owner', () => {
    const candidates = sql.slice(
      sql.indexOf('create function public.housing_match_candidates'),
      sql.indexOf('create function public.housing_roommate_matches'),
    )
    expect(candidates).toContain('join public.resonance_consent oc')
    expect(candidates).toContain('opted_out_as_target')
  })

  it('records that housing_rentals_near was already dropped (nothing to revoke)', () => {
    // The audit flagged the revoke, but the live catalog has no such function - an earlier
    // orphan cleanup removed it. The migration says so instead of issuing a failing REVOKE.
    expect(sql).toContain('housing_rentals_near: the audit flagged')
    expect(sql).not.toMatch(/^revoke execute on function public\.housing_rentals_near/m)
  })

  it('keeps the member-only grants on both match RPCs and indexes active seekers', () => {
    for (const rpc of ['housing_match_candidates', 'housing_roommate_matches']) {
      expect(sql).toMatch(new RegExp(`revoke execute on function public\\.${rpc}[^;]*from public, anon`))
      expect(sql).toMatch(new RegExp(`grant execute on function public\\.${rpc}[^;]*to authenticated`))
      expect(sql).toContain('security definer set search_path = public')
    }
    expect(sql).toContain(
      'create index if not exists housing_seeker_profiles_active_idx',
    )
  })
})

describe('roommate fit-term privacy migration (ADR-863)', () => {
  const sql = readFileSync(
    resolve(process.cwd(), 'supabase/migrations/20270109000000_housing_roommate_fit_privacy.sql'),
    'utf8',
  )

  it('withholds the per-target budget/geo/timing oracle from the seeker-to-seeker RPC', () => {
    // The returned columns are NULL (the score still uses the precise values); the app
    // coalesces null to a neutral 0.5 so those chips never fire on the People tab.
    for (const col of ['budget_fit', 'geo_fit', 'timing_fit']) {
      expect(sql).toMatch(new RegExp(`null::double precision as ${col}`))
    }
  })

  it('bands lifestyle_fit to three levels rather than a probeable gradient', () => {
    expect(sql).toMatch(/lifestyle_fit >= 0\.75 then 1\.0/)
    expect(sql).toMatch(/lifestyle_fit >= 0\.40 then 0\.5/)
  })

  it('only redefines the seeker RPC and keeps its member-only grant', () => {
    expect(sql).toContain('drop function if exists public.housing_roommate_matches')
    // The listing RPC may be named in the explanatory header, but it is never redefined here.
    expect(sql).not.toContain('create function public.housing_match_candidates')
    expect(sql).toMatch(/revoke execute on function public\.housing_roommate_matches[^;]*from public, anon/)
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

// ── Tier B (ADR-867) ─────────────────────────────────────────────────────────

describe('migration 20270111000000 (housing Tier B) source shape', () => {
  const sql = readFileSync(
    resolve(process.cwd(), 'supabase/migrations/20270111000000_housing_tier_b.sql'),
    'utf8',
  )

  it('adds every Tier B column', () => {
    for (const col of [
      'parking',
      'laundry',
      'bathrooms_shared',
      'move_in_costs_cents',
      'min_stay_months',
      'max_occupants',
      'accessibility',
      'address_precision',
      'address_line',
    ]) {
      expect(sql, `adds ${col}`).toMatch(new RegExp(`add column if not exists ${col}\\b`))
    }
  })

  it('CHECK-constrains the enums to the app vocabularies', () => {
    expect(sql).toContain("parking in ('none','street','driveway','garage')")
    expect(sql).toContain("laundry in ('none','in_unit','on_site','nearby')")
    expect(sql).toContain("address_precision in ('city','neighborhood','exact')")
    for (const tag of DB_ACCESSIBILITY) expect(sql, `accessibility vocab has ${tag}`).toContain(`"${tag}"`)
    expect(sql).toContain("jsonb_typeof(accessibility) = 'array'")
  })

  it('defaults address_precision to city and accessibility to an empty array', () => {
    expect(sql).toMatch(/address_precision text not null default 'city'/)
    expect(sql).toMatch(/accessibility jsonb not null default '\[\]'::jsonb/)
  })

  it('documents the address_line privacy contract on the column itself', () => {
    // The comment is the durable warning for anyone reading the schema: exact + signed-in
    // only, and never in structured data.
    expect(sql).toMatch(/comment on column public\.housing_listings\.address_line[\s\S]*NEVER emitted in JSON-LD/)
  })
})

describe('create/edit action parity (Tier B fields cannot drift)', () => {
  const read = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8')
  const createSrc = read('app/(main)/marketplace/actions.ts')
  const editSrc = read('app/(main)/housing/[id]/edit/actions.ts')
  const formSrc = read('app/(main)/housing/new/housing-form.tsx')

  /** Every form-data key a housing action source reads, however it reads it. */
  function formKeys(src: string, fn: string): Set<string> {
    const body = src.slice(src.indexOf(fn))
    const end = body.indexOf('\nexport async function', 1)
    const scoped = end > 0 ? body.slice(0, end) : body
    const keys = new Set<string>()
    for (const m of scoped.matchAll(/formData\.(?:get|getAll)\('([^']+)'\)/g)) keys.add(m[1])
    for (const m of scoped.matchAll(/checkbox\(formData, '([^']+)'\)/g)) keys.add(m[1])
    return keys
  }

  it('createHousingListingAction and updateHousingListingAction read the same field set', () => {
    expect(formKeys(createSrc, 'createHousingListingAction')).toEqual(
      formKeys(editSrc, 'updateHousingListingAction'),
    )
  })

  it('the shared form renders an input for every Tier B field both actions read', () => {
    for (const name of [
      'parking',
      'laundry',
      'bathrooms_shared',
      'move_in_costs',
      'min_stay_months',
      'max_occupants',
      'accessibility',
      'address_precision',
      'address_line',
    ]) {
      expect(formSrc, `form has name="${name}"`).toContain(`name="${name}"`)
    }
  })
})

describe('address_line never reaches structured data', () => {
  const read = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8')

  it('the SEO module never touches the street address', () => {
    const seo = read('lib/listings-shared/listing-seo.ts')
    expect(seo).not.toMatch(/address_line|addressLine/)
  })

  it('the sitemap never touches the street address', () => {
    const sitemap = read('app/sitemap.ts')
    expect(sitemap).not.toMatch(/address_line|addressLine/)
  })

  it('the shared view model computes its public place line as a signed-out viewer', () => {
    const view = read('lib/listings-shared/detail-view.ts')
    // listingDetailFromHousing must pass signedIn: false and a null addressLine into the
    // resolver, so locationLabel (meta + JSON-LD addressLocality) stays public-safe.
    expect(view).toMatch(/resolveAddressDisplay\(\{[\s\S]*?addressLine: null,[\s\S]*?signedIn: false,[\s\S]*?\}\)/)
  })
})
