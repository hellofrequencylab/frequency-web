// Data layer for the connect-only listings base (General + Housing). Mirrors the
// existing lib/marketplace.ts style: flat reads/writes via the admin client behind
// app-code authz; RLS governs direct reads. Per-vertical attributes in ./housing.ts.

import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { ENTITY_ID } from '@/lib/finance/record'
import { resolveSeedOwnerProfileId } from '@/lib/listing-seeder/seed-owner'
import type { Listing, ListingStatus, ListingVertical } from './types'

function db(): SupabaseClient {
  return createAdminClient()
}

const LISTING_COLS =
  'id, vertical, owner_profile_id, entity_id, title, description, status, images, price_note, category, neighborhood, city, latitude, longitude, circle_id, is_demo, claim_token, claimed_at, created_at, updated_at'

/** Whether a row is a seeded, still-unclaimed listing: owned by the seed owner, carrying a live claim
 *  token, with no claimed_at. Fail-soft false when the seed owner is unknown. PURE. */
function isSeededUnclaimed(r: Record<string, unknown>, seedOwnerId: string | null): boolean {
  if (!seedOwnerId) return false
  return (
    (r.owner_profile_id as string | null) === seedOwnerId &&
    (r.claim_token as string | null) != null &&
    (r.claimed_at as string | null) == null
  )
}

export function rowToListing(r: Record<string, unknown>, seedOwnerId: string | null = null): Listing {
  return {
    id: r.id as string,
    vertical: r.vertical as ListingVertical,
    ownerProfileId: (r.owner_profile_id as string) ?? null,
    entityId: r.entity_id as string,
    title: r.title as string,
    description: (r.description as string) ?? null,
    status: r.status as ListingStatus,
    images: (r.images as string[]) ?? [],
    priceNote: (r.price_note as string) ?? null,
    category: (r.category as string) ?? null,
    neighborhood: (r.neighborhood as string) ?? null,
    city: (r.city as string) ?? null,
    latitude: (r.latitude as number) ?? null,
    longitude: (r.longitude as number) ?? null,
    circleId: (r.circle_id as string) ?? null,
    isDemo: !!r.is_demo,
    seededUnclaimed: isSeededUnclaimed(r, seedOwnerId),
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  }
}

export interface ListListingsOpts {
  vertical?: ListingVertical
  q?: string
  limit?: number
}

/** Active listings, newest first, with optional vertical + text filter. Fail-safe
 *  to [] (a missing table pre-migration reads as empty, never throws). */
export async function listListings(opts: ListListingsOpts = {}): Promise<Listing[]> {
  let query = db()
    .from('listings')
    .select(LISTING_COLS)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(Math.min(Math.max(opts.limit ?? 40, 1), 100))
  if (opts.vertical) query = query.eq('vertical', opts.vertical)
  if (opts.q?.trim()) query = query.ilike('title', `%${opts.q.trim()}%`)
  const [{ data }, seedOwnerId] = await Promise.all([query, resolveSeedOwnerProfileId()])
  return ((data ?? []) as Record<string, unknown>[]).map((r) => rowToListing(r, seedOwnerId))
}

export async function getListing(id: string): Promise<Listing | null> {
  const [{ data }, seedOwnerId] = await Promise.all([
    db().from('listings').select(LISTING_COLS).eq('id', id).maybeSingle(),
    resolveSeedOwnerProfileId(),
  ])
  return data ? rowToListing(data as Record<string, unknown>, seedOwnerId) : null
}

export interface ListingOwner {
  id: string
  displayName: string
  handle: string
  avatarUrl: string | null
}

/** A listing joined with its owner profile (for the detail page's contact handoff).
 *  Connect-only: contact is a DM to the owner, never an in-app payment (ADR-148). */
export async function getListingWithOwner(
  id: string,
): Promise<(Listing & { owner: ListingOwner | null }) | null> {
  // Resolve the seed owner alongside the row so seededUnclaimed is populated (drives the operator
  // claim-link surface on the detail page, mirroring lib/marketplace.ts getListing).
  const [{ data }, seedOwnerId] = await Promise.all([
    db()
      .from('listings')
      .select(`${LISTING_COLS}, owner:profiles!owner_profile_id(id, display_name, handle, avatar_url)`)
      .eq('id', id)
      .maybeSingle(),
    resolveSeedOwnerProfileId(),
  ])
  if (!data) return null
  const r = data as Record<string, unknown>
  const raw = (Array.isArray(r.owner) ? r.owner[0] : r.owner) as Record<string, unknown> | null
  return {
    ...rowToListing(r, seedOwnerId),
    owner: raw
      ? {
          id: raw.id as string,
          displayName: (raw.display_name as string) ?? 'A member',
          handle: raw.handle as string,
          avatarUrl: (raw.avatar_url as string) ?? null,
        }
      : null,
  }
}

/** The one-time claim token for a seeded, still-unclaimed base/housing listing (null when claimed or
 *  not seeded). Reads the secret directly, so the CALLER must gate this to platform staff before
 *  surfacing it — it builds the shareable "claim this listing" link an operator sends the real poster.
 *  Mirrors lib/marketplace.ts getListingClaimToken (the classifieds twin). */
export async function getListingClaimToken(id: string): Promise<string | null> {
  const { data } = await db()
    .from('listings')
    .select('claim_token, claimed_at')
    .eq('id', id)
    .maybeSingle()
  const row = data as { claim_token: string | null; claimed_at: string | null } | null
  if (!row || row.claimed_at) return null
  return row.claim_token ?? null
}

export interface ListingInput {
  vertical: ListingVertical
  title: string
  description?: string | null
  priceNote?: string | null
  category?: string | null
  neighborhood?: string | null
  city?: string | null
  latitude?: number | null
  longitude?: number | null
  circleId?: string | null
  images?: string[]
}

/** Create a listing for the owner. Connect-only verticals settle on no money rail,
 *  so they carry the Foundation entity tag. */
export async function createListing(ownerProfileId: string, input: ListingInput): Promise<Listing | null> {
  const title = input.title?.trim()
  if (!title) return null
  const { data } = await db()
    .from('listings')
    .insert({
      vertical: input.vertical,
      owner_profile_id: ownerProfileId,
      entity_id: ENTITY_ID.foundation,
      title: title.slice(0, 120),
      description: input.description ?? null,
      price_note: input.priceNote ?? null,
      category: input.category ?? null,
      neighborhood: input.neighborhood ?? null,
      city: input.city ?? null,
      latitude: input.latitude ?? null,
      longitude: input.longitude ?? null,
      circle_id: input.circleId ?? null,
      images: (input.images ?? []).slice(0, 6),
    })
    .select(LISTING_COLS)
    .maybeSingle()
  return data ? rowToListing(data as Record<string, unknown>) : null
}

/** The owner-editable slice of a listing (the shared base row only; per-vertical
 *  attributes go through their extension upsert, e.g. upsertHousingDetail). */
export interface ListingPatch {
  title?: string
  description?: string | null
  images?: string[]
  priceNote?: string | null
  neighborhood?: string | null
  city?: string | null
  latitude?: number | null
  longitude?: number | null
}

/** Update a listing's base row, OWNER-SCOPED IN THE WHERE (id + owner_profile_id both
 *  match or nothing is written) — the same app-code authz posture as the rest of the
 *  file, enforced at the row level so a mis-gated caller still cannot touch someone
 *  else's listing. Only the fields present on the patch change; title/images carry the
 *  same caps as createListing. Returns true when a row was actually updated. */
export async function updateListing(
  listingId: string,
  ownerProfileId: string,
  patch: ListingPatch,
): Promise<boolean> {
  const row: Record<string, unknown> = {}
  if (patch.title !== undefined) {
    const title = patch.title.trim()
    if (!title) return false
    row.title = title.slice(0, 120)
  }
  if (patch.description !== undefined) row.description = patch.description
  if (patch.images !== undefined) row.images = patch.images.slice(0, 6)
  if (patch.priceNote !== undefined) row.price_note = patch.priceNote
  if (patch.neighborhood !== undefined) row.neighborhood = patch.neighborhood
  if (patch.city !== undefined) row.city = patch.city
  if (patch.latitude !== undefined) row.latitude = patch.latitude
  if (patch.longitude !== undefined) row.longitude = patch.longitude
  if (Object.keys(row).length === 0) return false
  const { data } = await db()
    .from('listings')
    .update(row)
    .eq('id', listingId)
    .eq('owner_profile_id', ownerProfileId)
    .select('id')
    .maybeSingle()
  return !!data
}

// ── Saves (favorites) — listing_saves, (profile_id, listing_id) PK, self RLS ─────────

/** Save (heart) a listing for the member. Idempotent: the upsert lands on the
 *  (profile_id, listing_id) primary key, so a double-tap never errors. THROWS on a real
 *  write failure so the heart's optimistic flip reverts — a discarded error here is how a
 *  dropped table (20260925 → restored 20270327) no-opped every save invisibly for months. */
export async function saveListing(profileId: string, listingId: string): Promise<void> {
  const { error } = await db()
    .from('listing_saves')
    .upsert({ profile_id: profileId, listing_id: listingId })
  if (error) throw new Error(`saveListing failed: ${error.message}`)
}

/** Remove a saved listing. A no-op when it was never saved; THROWS on a real write failure
 *  (same contract as saveListing — the button reverts its optimistic flip). */
export async function unsaveListing(profileId: string, listingId: string): Promise<void> {
  const { error } = await db()
    .from('listing_saves')
    .delete()
    .eq('profile_id', profileId)
    .eq('listing_id', listingId)
  if (error) throw new Error(`unsaveListing failed: ${error.message}`)
}

/** Which of `listingIds` the member has saved — ONE batched read for a whole browse
 *  grid (never a per-card query). Fail-safe to an empty set. */
export async function listSavedListingIds(
  profileId: string,
  listingIds: string[],
): Promise<Set<string>> {
  if (listingIds.length === 0) return new Set()
  const { data } = await db()
    .from('listing_saves')
    .select('listing_id')
    .eq('profile_id', profileId)
    .in('listing_id', listingIds)
  return new Set(((data ?? []) as { listing_id: string }[]).map((r) => r.listing_id))
}

/** The member's saved listings for a vertical, newest-saved first. Joined `!inner` to
 *  still-ACTIVE listings only, so a closed or deleted home quietly drops out instead of
 *  lingering as a dead card. Fail-safe to []. */
export async function listSavedListings(
  profileId: string,
  vertical: ListingVertical,
  limit = 40,
): Promise<Listing[]> {
  const [{ data }, seedOwnerId] = await Promise.all([
    db()
      .from('listing_saves')
      .select(`created_at, listing:listings!inner(${LISTING_COLS})`)
      .eq('profile_id', profileId)
      .eq('listing.vertical', vertical)
      .eq('listing.status', 'active')
      .order('created_at', { ascending: false })
      .limit(Math.min(Math.max(limit, 1), 100)),
    resolveSeedOwnerProfileId(),
  ])
  return ((data ?? []) as Record<string, unknown>[])
    .map((r) => (Array.isArray(r.listing) ? r.listing[0] : r.listing) as Record<string, unknown> | null)
    .filter((l): l is Record<string, unknown> => !!l)
    .map((l) => rowToListing(l, seedOwnerId))
}

export async function setListingStatus(id: string, status: ListingStatus): Promise<void> {
  await db().from('listings').update({ status }).eq('id', id)
}

export async function deleteListing(id: string): Promise<void> {
  await db().from('listings').delete().eq('id', id)
}

/** Ownership gate for app-code authz (mirrors lib/marketplace.ts listingAuthorId). */
export async function listingOwnerId(id: string): Promise<string | null> {
  const { data } = await db().from('listings').select('owner_profile_id').eq('id', id).maybeSingle()
  return (data as { owner_profile_id?: string } | null)?.owner_profile_id ?? null
}
