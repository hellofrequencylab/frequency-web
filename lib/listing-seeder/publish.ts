// ─────────────────────────────────────────────────────────────────────────────
// CLASSIFIEDS & HOUSING SEEDER — the PUBLISH / materialize path (Wave 2). SERVER-ONLY.
//
// Turns a REVIEWED listing_intake into a real, published listing OWNED BY the Frequency
// seed owner (seed-owner.ts) carrying an events-style CLAIM TOKEN (claim.ts). The original
// poster later follows the emailed claim link, signs in, and the transfer hands ownership
// to them.
//
//   • classifieds  → createListing on `market_listings` (lib/marketplace)
//   • housing      → createListing on `listings` (lib/listings) + upsertHousingDetail on
//                    `housing_listings` (lib/listings/housing). Dollars in the draft become
//                    CENTS on write (×100). The address is geocoded fail-soft (a miss never
//                    blocks the publish, the listing is simply not "near me"-placed yet).
//
// Fail-safe: any error flips the intake to `failed` + stamps `error`, and returns a typed
// failure. On success the intake goes `applied` with the new listing id.
//
// authz-delegated: this is a lib/ materialize helper that intentionally TRUSTS its caller to
// authorize. It is invoked ONLY by the Wave-1 review-board admin action, which is staff-gated
// before it hands us a reviewed intake id; every listing write here is further bound to the
// resolved Frequency seed owner (the row is authored as them) and the intake writes are scoped
// by intake id. The gate lives at the review-board action call site (docs MENU-CONTRACT / the
// seeder console), not here.
// ─────────────────────────────────────────────────────────────────────────────

import { createAdminClient } from '@/lib/supabase/admin'
import { createListing as createMarketListing } from '@/lib/marketplace'
import { createListing as createBaseListing } from '@/lib/listings'
import { upsertHousingDetail } from '@/lib/listings/housing'
import { nominatimGeocoder } from '@/lib/events/geocode-provider'
import { mintListingClaimToken } from './claim'
import { resolveSeedOwnerProfileId } from './seed-owner'
import type {
  ClassifiedsDraft,
  HousingDraft,
  ListingDraft,
  ListingIntakeInputs,
  ListingSeedKind,
} from './types'

export type PublishListingResult =
  | { ok: true; kind: ListingSeedKind; listingId: string; claimToken: string | null }
  | { ok: false; error: string }

/** The housing dollars→cents mapping (rent/deposit ×100, rounded). PURE + exported so the
 *  conversion is unit-tested without touching the DB. Null passes through. */
export function housingDollarsToCents(dollars: number | null): number | null {
  return dollars != null ? Math.round(dollars * 100) : null
}

/** Geocode `neighborhood, city` → a point, fail-soft. Reuses the housing/events keyless
 *  Nominatim provider (lib/events/geocode-provider). Any miss / error resolves to null so the
 *  publish still succeeds without coordinates (the listing is just not map-placed yet). */
async function geocodeSoft(
  neighborhood: string | null,
  city: string | null,
): Promise<{ lat: number; lng: number } | null> {
  const query = [neighborhood, city].map((s) => s?.trim()).filter(Boolean).join(', ')
  if (!query) return null
  try {
    const point = await nominatimGeocoder({ city: city ?? undefined, query })
    return point ? { lat: point.lat, lng: point.lng } : null
  } catch {
    return null
  }
}

/** Materialize a classifieds draft on market_listings, authored by the seed owner. */
async function publishClassifieds(
  seedOwnerId: string,
  draft: ClassifiedsDraft,
  images: string[],
): Promise<string> {
  const listing = await createMarketListing(seedOwnerId, {
    title: draft.title,
    description: draft.description,
    kind: draft.listingKind,
    category: draft.category,
    priceNote: draft.priceNote,
    neighborhood: draft.neighborhood,
    city: draft.city,
    images,
  })
  if (!listing) throw new Error('Could not create the classifieds listing.')
  return listing.id
}

/** Materialize a housing draft on listings + housing_listings, authored by the seed owner. */
async function publishHousing(
  seedOwnerId: string,
  draft: HousingDraft,
  images: string[],
): Promise<string> {
  const point = await geocodeSoft(draft.neighborhood, draft.city)
  const listing = await createBaseListing(seedOwnerId, {
    vertical: 'housing',
    title: draft.title,
    description: draft.description,
    priceNote: draft.rentDollars != null ? `$${draft.rentDollars}/mo` : null,
    neighborhood: draft.neighborhood,
    city: draft.city,
    latitude: point?.lat ?? null,
    longitude: point?.lng ?? null,
    images,
  })
  if (!listing) throw new Error('Could not create the housing listing.')

  await upsertHousingDetail(listing.id, {
    // A seeded housing listing is a place on offer; the operator refines the sub-type later.
    listingType: 'rental',
    rentCents: housingDollarsToCents(draft.rentDollars),
    depositCents: housingDollarsToCents(draft.depositDollars),
    bedrooms: draft.bedrooms,
    bathrooms: draft.bathrooms,
    availableFrom: draft.availableFrom,
    furnished: draft.furnished,
    petsOk: draft.petsOk,
    utilitiesIncluded: draft.utilitiesIncluded,
    propertyType: draft.propertyType,
    sqft: draft.sqft,
    amenities: draft.amenities,
    smokingOk: draft.smokingOk,
    cannabisOk: draft.cannabisOk,
  })
  return listing.id
}

/**
 * Publish a reviewed listing_intake: create the seed-owned listing, stamp a one-time claim token,
 * and advance the intake to `applied`. Guards: the intake must exist, be in status `review`, and
 * carry a valid draft whose kind matches the intake. On ANY failure the intake is flipped to
 * `failed` with the error recorded, and a typed failure is returned (never throws to the caller).
 */
export async function publishListingIntake(intakeId: string): Promise<PublishListingResult> {
  const admin = createAdminClient()

  const { data: row, error: loadErr } = await admin
    .from('listing_intake')
    .select('id, kind, inputs, draft, status')
    .eq('id', intakeId)
    .maybeSingle()

  if (loadErr || !row) return { ok: false, error: 'This intake could not be found.' }

  const intake = row as unknown as {
    id: string
    kind: ListingSeedKind
    inputs: ListingIntakeInputs | null
    draft: ListingDraft | Record<string, unknown> | null
    status: string
  }

  if (intake.status !== 'review') {
    return { ok: false, error: `This intake is ${intake.status}, not ready to publish.` }
  }

  const draft = intake.draft as ListingDraft | null
  if (
    !draft ||
    (draft.kind !== 'classifieds' && draft.kind !== 'housing') ||
    draft.kind !== intake.kind
  ) {
    return { ok: false, error: 'This intake has no valid draft to publish.' }
  }

  try {
    const seedOwnerId = await resolveSeedOwnerProfileId()
    if (!seedOwnerId) throw new Error('No Frequency seed owner is configured.')

    const inputs = intake.inputs ?? { pastedText: '' }
    const images = inputs.images && inputs.images.length ? inputs.images : draft.images

    const listingId =
      draft.kind === 'classifieds'
        ? await publishClassifieds(seedOwnerId, draft, images)
        : await publishHousing(seedOwnerId, draft, images)

    // Stamp the one-time claim token on the freshly-created, seed-owned, unclaimed row.
    const claimToken = await mintListingClaimToken(draft.kind, listingId)

    await admin
      .from('listing_intake')
      .update({
        status: 'applied',
        applied_listing_id: listingId,
        error: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', intakeId)

    return { ok: true, kind: draft.kind, listingId, claimToken }
  } catch (e) {
    const error = e instanceof Error ? e.message : 'The listing could not be published.'
    await admin
      .from('listing_intake')
      .update({ status: 'failed', error, updated_at: new Date().toISOString() })
      .eq('id', intakeId)
    return { ok: false, error }
  }
}
