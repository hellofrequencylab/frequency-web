// Housing-specific reads/writes + the matching entry points. The matching RPCs are
// SECURITY DEFINER and consent-gated server-side; callers pass no coordinates back
// to the client beyond a coarse band. Used by the Housing surfaces (PR-followup).

import { createAdminClient } from '@/lib/supabase/admin'
import { rowToListing } from './index'
import type { HousingDetail, HousingListing, HousingType, RoommateMatch } from './types'

function db() {
  return createAdminClient()
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
  preferences?: Record<string, unknown>
}

export async function upsertHousingDetail(listingId: string, input: HousingDetailInput): Promise<void> {
  await db()
    .from('housing_listings')
    .upsert({
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
      preferences: input.preferences ?? {},
    })
}

export async function getHousingDetail(listingId: string): Promise<HousingDetail | null> {
  const { data } = await db().from('housing_listings').select('*').eq('listing_id', listingId).maybeSingle()
  return data ? rowToHousingDetail(data as Record<string, unknown>) : null
}

/** Active housing listings joined with their detail. Fail-safe to []. */
export async function listHousingListings(opts: { limit?: number } = {}): Promise<HousingListing[]> {
  const { data } = await db()
    .from('listings')
    .select(
      'id, vertical, owner_profile_id, entity_id, title, description, status, images, price_note, category, neighborhood, city, latitude, longitude, circle_id, is_demo, created_at, updated_at, housing_listings(*)',
    )
    .eq('vertical', 'housing')
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(Math.min(Math.max(opts.limit ?? 40, 1), 100))
  const rows = (data ?? []) as Record<string, unknown>[]
  return rows
    .map((r) => {
      const detail = Array.isArray(r.housing_listings) ? r.housing_listings[0] : r.housing_listings
      if (!detail) return null
      return { ...rowToListing(r), housing: rowToHousingDetail(detail as Record<string, unknown>) }
    })
    .filter((x): x is HousingListing => x != null)
}

export interface RentalNearOpts {
  lat: number
  lng: number
  maxRentCents?: number | null
  limit?: number
}

export async function listRentalsNear(opts: RentalNearOpts): Promise<
  { listingId: string; title: string; rentCents: number | null; roomType: string | null; city: string | null; distanceBand: string }[]
> {
  const { data } = await db().rpc('housing_rentals_near', {
    _lat: opts.lat,
    _lng: opts.lng,
    _max_rent_cents: opts.maxRentCents ?? null,
    _limit: opts.limit ?? 40,
  })
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    listingId: r.listing_id as string,
    title: r.title as string,
    rentCents: (r.rent_cents as number) ?? null,
    roomType: (r.room_type as string) ?? null,
    city: (r.city as string) ?? null,
    distanceBand: r.distance_band as string,
  }))
}

/** Roommate compatibility for the caller, via housing_match_candidates (consent-gated).
 *  Pass an authenticated supabase client (carries the JWT) so the RPC resolves
 *  auth.uid() to the caller — resonance is private to them by construction. */
export async function matchRoommates(
  authedClient: { rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown }> },
  limit = 10,
): Promise<RoommateMatch[]> {
  const { data } = await authedClient.rpc('housing_match_candidates', { _limit: limit })
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    listingId: r.listing_id as string,
    ownerId: r.owner_id as string,
    resonance: (r.resonance as number) ?? 0,
    rentCents: (r.rent_cents as number) ?? null,
    city: (r.city as string) ?? null,
    score: (r.score as number) ?? 0,
  }))
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
