// Housing-specific reads/writes + the matching entry points. The matching RPCs are
// SECURITY DEFINER and consent-gated server-side; callers pass no coordinates back
// to the client beyond a coarse band. Used by the Housing surfaces (PR-followup).

import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveSeedOwnerProfileId } from '@/lib/listing-seeder/seed-owner'
import { rowToListing } from './index'
import { AMENITIES, PROPERTY_TYPES } from './types'
import type {
  AmenitySlug,
  HousingDetail,
  HousingType,
  Listing,
  PropertyType,
  RoommateMatch,
} from './types'

function db(): SupabaseClient {
  return createAdminClient()
}

// ── Controlled-vocabulary helpers (the slug arrays live in ./types, client-safe) ──

const PROPERTY_TYPE_SET = new Set<string>(PROPERTY_TYPES.map((p) => p.slug))
const AMENITY_SET = new Set<string>(AMENITIES.map((a) => a.slug))

/** Coerce an untrusted string to a valid PropertyType, or null. */
export function toPropertyType(v: unknown): PropertyType | null {
  return typeof v === 'string' && PROPERTY_TYPE_SET.has(v) ? (v as PropertyType) : null
}

/** Keep only recognised amenity slugs (deduped), so a tampered form can't
 *  smuggle a value past the DB CHECK. */
export function toAmenities(values: readonly string[]): AmenitySlug[] {
  const seen = new Set<AmenitySlug>()
  for (const v of values) if (AMENITY_SET.has(v)) seen.add(v as AmenitySlug)
  return [...seen]
}

export function propertyTypeLabel(slug: string | null): string | null {
  return PROPERTY_TYPES.find((p) => p.slug === slug)?.label ?? null
}

export function amenityLabel(slug: string): string {
  return AMENITIES.find((a) => a.slug === slug)?.label ?? slug
}

function rowToHousingDetail(r: Record<string, unknown>): HousingDetail {
  return {
    listingId: r.listing_id as string,
    listingType: r.listing_type as HousingType,
    rentCents: (r.rent_cents as number) ?? null,
    depositCents: (r.deposit_cents as number) ?? null,
    bedrooms: (r.bedrooms as number) ?? null,
    bathrooms: (r.bathrooms as number) ?? null,
    roomType: (r.room_type as HousingDetail['roomType']) ?? null,
    leaseMonths: (r.lease_months as number) ?? null,
    availableFrom: (r.available_from as string) ?? null,
    furnished: (r.furnished as boolean) ?? null,
    petsOk: (r.pets_ok as boolean) ?? null,
    utilitiesIncluded: (r.utilities_included as boolean) ?? null,
    householdSize: (r.household_size as number) ?? null,
    propertyType: toPropertyType(r.property_type),
    sqft: (r.sqft as number) ?? null,
    amenities: toAmenities((r.amenities as string[] | null) ?? []),
    smokingOk: (r.smoking_ok as boolean) ?? null,
    cannabisOk: (r.cannabis_ok as boolean) ?? null,
    details: (r.details as Record<string, unknown>) ?? {},
    preferences: (r.preferences as Record<string, unknown>) ?? {},
  }
}

export interface HousingDetailInput {
  listingType: HousingType
  rentCents?: number | null
  depositCents?: number | null
  bedrooms?: number | null
  bathrooms?: number | null
  roomType?: HousingDetail['roomType']
  leaseMonths?: number | null
  availableFrom?: string | null
  furnished?: boolean | null
  petsOk?: boolean | null
  utilitiesIncluded?: boolean | null
  householdSize?: number | null
  propertyType?: PropertyType | null
  sqft?: number | null
  amenities?: AmenitySlug[]
  smokingOk?: boolean | null
  cannabisOk?: boolean | null
  details?: Record<string, unknown>
  preferences?: Record<string, unknown>
}

export async function upsertHousingDetail(listingId: string, input: HousingDetailInput): Promise<void> {
  // Cast to a loose row: the new Phase-2 columns are intentionally absent from the
  // generated types (ADR-246 — database.types.ts is never regenerated here).
  const row: Record<string, unknown> = {
    listing_id: listingId,
    listing_type: input.listingType,
    rent_cents: input.rentCents ?? null,
    deposit_cents: input.depositCents ?? null,
    bedrooms: input.bedrooms ?? null,
    bathrooms: input.bathrooms ?? null,
    room_type: input.roomType ?? null,
    lease_months: input.leaseMonths ?? null,
    available_from: input.availableFrom ?? null,
    furnished: input.furnished ?? null,
    pets_ok: input.petsOk ?? null,
    utilities_included: input.utilitiesIncluded ?? null,
    household_size: input.householdSize ?? null,
    property_type: input.propertyType ?? null,
    sqft: input.sqft ?? null,
    amenities: input.amenities ?? [],
    smoking_ok: input.smokingOk ?? null,
    cannabis_ok: input.cannabisOk ?? null,
    details: input.details ?? {},
    preferences: input.preferences ?? {},
  }
  await db().from('housing_listings').upsert(row)
}

export async function getHousingDetail(listingId: string): Promise<HousingDetail | null> {
  const { data } = await db().from('housing_listings').select('*').eq('listing_id', listingId).maybeSingle()
  return data ? rowToHousingDetail(data as Record<string, unknown>) : null
}

// ── Match fits: the raw per-term values the v3 RPCs expose ──────────────────
// (migration 20270108000000). Astrology and resonance are deliberately NOT here:
// astrology is opt-in-sensitive and resonance is opaque; neither is ever a chip.

export interface MatchFits {
  budget: number
  geo: number
  timing: number
  lifestyle: number
}

/** Read the four fit columns off an RPC row; a missing/invalid value falls back
 *  to the neutral 0.5 (below every chip threshold), so a v2 database degrades
 *  to "no chips", never a wrong claim. */
function rowFits(r: Record<string, unknown>): MatchFits {
  const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0.5)
  return {
    budget: num(r.budget_fit),
    geo: num(r.geo_fit),
    timing: num(r.timing_fit),
    lifestyle: num(r.lifestyle_fit),
  }
}

/** Up to three plain-English compatibility chips from the strongest fit terms.
 *  PURE. Thresholds are deliberately high so a chip is a claim we can stand
 *  behind; the neutral 0.5 (unknown data) never earns one. Astrology and
 *  resonance never chip — the overall percentage carries those. */
export function fitChips(
  fits: MatchFits,
  opts: { city?: string | null; distanceKnown?: boolean } = {},
): string[] {
  const candidates = [
    { label: 'Budget fits', value: fits.budget, min: 0.8, show: true },
    {
      label: opts.city ? `Close to ${opts.city}` : 'Close by',
      value: fits.geo,
      min: 0.8,
      show: opts.distanceKnown !== false,
    },
    { label: 'Timing lines up', value: fits.timing, min: 0.8, show: true },
    { label: 'Similar lifestyle', value: fits.lifestyle, min: 0.7, show: true },
  ]
  return candidates
    .filter((c) => c.show && c.value >= c.min)
    .sort((a, b) => b.value - a.value)
    .slice(0, 3)
    .map((c) => c.label)
}

/** A roommate-listing match with the per-term fits alongside the blended score. */
export interface RoommateListingMatch extends RoommateMatch {
  fits: MatchFits
}

/** Roommate compatibility for the caller, via housing_match_candidates (consent-gated).
 *  Pass an authenticated supabase client (carries the JWT) so the RPC resolves
 *  auth.uid() to the caller — resonance is private to them by construction. */
export async function matchRoommates(
  authedClient: { rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown }> },
  limit = 10,
): Promise<RoommateListingMatch[]> {
  const { data } = await authedClient.rpc('housing_match_candidates', { _limit: limit })
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    listingId: r.listing_id as string,
    ownerId: r.owner_id as string,
    resonance: (r.resonance as number) ?? 0,
    rentCents: (r.rent_cents as number) ?? null,
    city: (r.city as string) ?? null,
    score: (r.score as number) ?? 0,
    fits: rowFits(r),
  }))
}

/** A roommate<->roommate match: another active seeker ranked against the caller,
 *  enriched with their public profile card. Symmetric (reciprocal resonance).
 *  Coarse city/score band only — never coordinates. */
export interface RoommateSeekerMatch {
  profileId: string
  displayName: string
  handle: string
  avatarUrl: string | null
  resonance: number
  city: string | null
  score: number
  fits: MatchFits
}

/** The loose client shape the seeker matcher needs: the consent-gated RPC plus a
 *  batch profile read (both on the CALLER's client, so RLS applies to the read). */
interface SeekerMatchClient {
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown }>
  from: (table: string) => {
    select: (columns: string) => {
      in: (column: string, values: string[]) => Promise<{ data: unknown }>
    }
  }
}

/** Rank OTHER active seekers against the caller (roommate<->roommate), via the consent-gated
 *  housing_roommate_matches RPC, then join each match to its public profile card (display
 *  name, handle, avatar) in ONE batch read on the same authed client. Rows whose profile
 *  can't be read (blocked, deleted) are dropped — no card, no match. Fail-safe []. */
export async function matchRoommateSeekers(
  authedClient: SeekerMatchClient,
  limit = 12,
): Promise<RoommateSeekerMatch[]> {
  const { data } = await authedClient.rpc('housing_roommate_matches', { _limit: limit })
  const rows = (data ?? []) as Record<string, unknown>[]
  const ids = rows.map((r) => r.profile_id).filter((v): v is string => typeof v === 'string')
  if (ids.length === 0) return []

  const { data: profileData } = await authedClient
    .from('profiles')
    .select('id, display_name, handle, avatar_url')
    .in('id', ids)
  const profiles = new Map(
    ((profileData ?? []) as Record<string, unknown>[]).map((p) => [p.id as string, p]),
  )

  const out: RoommateSeekerMatch[] = []
  for (const r of rows) {
    const p = profiles.get(r.profile_id as string)
    const handle = p?.handle
    if (!p || typeof handle !== 'string' || !handle) continue
    out.push({
      profileId: r.profile_id as string,
      displayName: typeof p.display_name === 'string' && p.display_name ? p.display_name : handle,
      handle,
      avatarUrl: (p.avatar_url as string) ?? null,
      resonance: (r.resonance as number) ?? 0,
      city: (r.city as string) ?? null,
      score: (r.score as number) ?? 0,
      fits: rowFits(r),
    })
  }
  return out
}

export interface HousingFacets {
  propertyType?: PropertyType | null
  /** Dollars-per-month bounds (inclusive), applied to rent_cents. */
  minPriceCents?: number | null
  maxPriceCents?: number | null
  /** Every slug must be present on the listing (AND semantics). */
  amenities?: AmenitySlug[]
  limit?: number
}

/** Active housing listings narrowed by the Phase-2 facets (property type, price
 *  band, required amenities). Returns the shared Listing base, newest first. The
 *  housing extension is joined `!inner` so only rows with a housing row match, and
 *  the facet predicates are applied on the embedded table. Fail-safe to []. */
export async function listHousingListings(facets: HousingFacets = {}): Promise<Listing[]> {
  const limit = Math.min(Math.max(facets.limit ?? 40, 1), 100)
  let query = db()
    .from('listings')
    .select(
      'id, vertical, owner_profile_id, entity_id, title, description, status, images, price_note, category, neighborhood, city, latitude, longitude, circle_id, is_demo, claim_token, claimed_at, created_at, updated_at, housing:housing_listings!inner(property_type, rent_cents, amenities)',
    )
    .eq('vertical', 'housing')
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (facets.propertyType) query = query.eq('housing.property_type', facets.propertyType)
  if (facets.minPriceCents != null) query = query.gte('housing.rent_cents', facets.minPriceCents)
  if (facets.maxPriceCents != null) query = query.lte('housing.rent_cents', facets.maxPriceCents)
  const wanted = toAmenities(facets.amenities ?? [])
  if (wanted.length) query = query.contains('housing.amenities', wanted)

  // Resolve the seed owner once per query (process-memoized) so each row can carry seededUnclaimed.
  const [{ data }, seedOwnerId] = await Promise.all([query, resolveSeedOwnerProfileId()])
  return ((data ?? []) as Record<string, unknown>[]).map((r) => rowToListing(r, seedOwnerId))
}

// ── Seeker lifestyle preferences (Phase 3) ───────────────────────────────────
// Controlled vocab for the lifestyle block on the seeker form. The values feed the
// LIFESTYLE term of the roommate match blend (migration 20261133000000). Kept here
// (server-safe) and validated on write so a tampered form can never smuggle a value
// the match reads. Gender preference is gated to shared-living intents (the US Fair
// Housing shared-housing exemption permits sex/gender only when sharing a home); age
// is a SOFT ranking hint, never a public "must be X" advertisement.

const SEEKER_ENUMS = {
  social_level: new Set(['homebody', 'balanced', 'social']),
  schedule: new Set(['early_bird', 'night_owl', 'flexible']),
  diet: new Set(['omnivore', 'vegetarian', 'vegan', 'halal', 'kosher']),
  pets: new Set(['have_pets', 'ok_with_pets', 'no_pets']),
  smoking: new Set(['yes', 'outside_only', 'no']),
  cannabis: new Set(['yes', 'outside_only', 'no']),
  gender_pref: new Set(['women', 'men', 'nonbinary', 'same_as_me']),
} as const

/** Raw (untrusted) lifestyle inputs, as strings off the form. */
export interface SeekerPreferenceInput {
  cleanliness?: string | null
  social_level?: string | null
  schedule?: string | null
  diet?: string | null
  pets?: string | null
  smoking?: string | null
  cannabis?: string | null
  arrangement?: string | null
  gender_pref?: string | null
  age_min?: string | null
  age_max?: string | null
}

function intInRange(v: string | null | undefined, lo: number, hi: number): number | null {
  if (v == null || v === '') return null
  const n = Number(v)
  if (!Number.isFinite(n)) return null
  const r = Math.round(n)
  return r >= lo && r <= hi ? r : null
}

/** Clean the seeker lifestyle block into the lean `preferences` jsonb the match RPC reads.
 *  PURE (no IO) so it is unit-testable and reusable. Only recognised values survive; unknown
 *  keys/values are dropped. gender_pref is retained ONLY for shared-living arrangements. */
export function sanitizeSeekerPreferences(input: SeekerPreferenceInput): Record<string, unknown> {
  const out: Record<string, unknown> = {}

  const cleanliness = intInRange(input.cleanliness, 1, 5)
  if (cleanliness != null) out.cleanliness = cleanliness

  for (const key of ['social_level', 'schedule', 'diet', 'pets', 'smoking', 'cannabis'] as const) {
    const v = input[key]
    if (typeof v === 'string' && SEEKER_ENUMS[key].has(v)) out[key] = v
  }

  const arrangement = input.arrangement === 'private' ? 'private' : 'shared'
  out.arrangement = arrangement

  // Fair-Housing gate: sex/gender preference is only lawful (and only stored) when the member
  // is sharing a living space. Silently dropped for a private-place search.
  if (arrangement === 'shared' && typeof input.gender_pref === 'string' && SEEKER_ENUMS.gender_pref.has(input.gender_pref)) {
    out.gender_pref = input.gender_pref
  }

  // Age is a SOFT hint only. Stored under age_pref for ranking, never surfaced as a requirement.
  const ageMin = intInRange(input.age_min, 18, 120)
  const ageMax = intInRange(input.age_max, 18, 120)
  if (ageMin != null || ageMax != null) {
    const lo = ageMin ?? 18
    const hi = ageMax ?? 120
    out.age_pref = { min: Math.min(lo, hi), max: Math.max(lo, hi) }
  }

  return out
}

/** The lifestyle block as the seeker FORM expects it (camelCase, all strings).
 *  Mirrors LifestylePrefs in the roommates seeker form; kept structural here so
 *  the server module never imports a client file. */
export interface SeekerLifestylePrefill {
  cleanliness?: string
  socialLevel?: string
  schedule?: string
  diet?: string
  pets?: string
  smoking?: string
  cannabis?: string
  arrangement?: string
  genderPref?: string
  ageMin?: string
  ageMax?: string
}

/** Map the stored preferences jsonb (sanitizeSeekerPreferences output, snake_case)
 *  back into the form's prefill shape, so re-saving the form never wipes a saved
 *  lifestyle block. PURE; inverse of sanitizeSeekerPreferences over its own output.
 *  Unknown keys are ignored; missing keys stay absent (the form supplies defaults). */
export function seekerPreferencesToLifestyle(
  prefs: Record<string, unknown> | null | undefined,
): SeekerLifestylePrefill {
  const out: SeekerLifestylePrefill = {}
  if (!prefs) return out

  if (typeof prefs.cleanliness === 'number' && Number.isFinite(prefs.cleanliness)) {
    out.cleanliness = String(prefs.cleanliness)
  }

  const str = (k: string): string | undefined =>
    typeof prefs[k] === 'string' && prefs[k] !== '' ? (prefs[k] as string) : undefined

  const socialLevel = str('social_level')
  if (socialLevel) out.socialLevel = socialLevel
  for (const k of ['schedule', 'diet', 'pets', 'smoking', 'cannabis', 'arrangement'] as const) {
    const v = str(k)
    if (v) out[k] = v
  }
  const genderPref = str('gender_pref')
  if (genderPref) out.genderPref = genderPref

  const age = prefs.age_pref
  if (age && typeof age === 'object') {
    const { min, max } = age as { min?: unknown; max?: unknown }
    if (typeof min === 'number' && Number.isFinite(min)) out.ageMin = String(min)
    if (typeof max === 'number' && Number.isFinite(max)) out.ageMax = String(max)
  }
  return out
}

export interface SeekerProfile {
  active: boolean
  budgetMinCents: number | null
  budgetMaxCents: number | null
  moveInFrom: string | null
  searchCity: string | null
  searchLat: number | null
  searchLng: number | null
  searchRadiusM: number
  /** The lifestyle block (cleanliness/schedule/…), for prefilling the form. */
  preferences: Record<string, unknown>
}

/** The caller's seeker profile (to prefill the roommate-match form), or null. */
export async function getSeekerProfile(profileId: string): Promise<SeekerProfile | null> {
  const { data } = await db()
    .from('housing_seeker_profiles')
    .select('active, budget_min_cents, budget_max_cents, move_in_from, search_city, search_lat, search_lng, search_radius_m, preferences')
    .eq('profile_id', profileId)
    .maybeSingle()
  if (!data) return null
  const r = data as Record<string, unknown>
  return {
    active: !!r.active,
    budgetMinCents: (r.budget_min_cents as number) ?? null,
    budgetMaxCents: (r.budget_max_cents as number) ?? null,
    moveInFrom: (r.move_in_from as string) ?? null,
    searchCity: (r.search_city as string) ?? null,
    searchLat: (r.search_lat as number) ?? null,
    searchLng: (r.search_lng as number) ?? null,
    searchRadiusM: (r.search_radius_m as number) ?? 25000,
    preferences: (r.preferences as Record<string, unknown>) ?? {},
  }
}

export async function upsertSeekerProfile(
  profileId: string,
  input: {
    active?: boolean
    budgetMinCents?: number | null
    budgetMaxCents?: number | null
    moveInFrom?: string | null
    searchCity?: string | null
    searchLat?: number | null
    searchLng?: number | null
    searchRadiusM?: number
    preferences?: Record<string, unknown>
  },
): Promise<void> {
  await db()
    .from('housing_seeker_profiles')
    .upsert({
      profile_id: profileId,
      active: input.active ?? true,
      budget_min_cents: input.budgetMinCents ?? null,
      budget_max_cents: input.budgetMaxCents ?? null,
      move_in_from: input.moveInFrom ?? null,
      search_city: input.searchCity ?? null,
      search_lat: input.searchLat ?? null,
      search_lng: input.searchLng ?? null,
      search_radius_m: input.searchRadiusM ?? 25000,
      preferences: input.preferences ?? {},
    })
}
