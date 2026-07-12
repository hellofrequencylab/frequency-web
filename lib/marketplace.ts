// Local Marketplace (vertical 5, ADR-148): geolocated, no-fee listings members
// swap / give / lend / request. No in-app payment — we connect people (DMs) and
// they arrange offline. Server-only. Writes go through the service-role admin
// client behind app-code authz (callers enforce: author owns the listing); the
// market_listings table is new, so we read/write through an untyped handle until
// `supabase gen types` is re-run (repo convention — see lib/journey-plans.ts).

import { createAdminClient } from '@/lib/supabase/admin'
import { resolveSeedOwnerProfileId } from '@/lib/listing-seeder/seed-owner'
import type { ListingDetail, ListingPickupPrecision } from '@/lib/listing-seeder/types'
import type { SupabaseClient } from '@supabase/supabase-js'

function db(): SupabaseClient {
  return createAdminClient()
}

export type ListingKind = 'offer' | 'request' | 'free' | 'lend'
export type ListingStatus = 'active' | 'claimed' | 'closed'

export const LISTING_KINDS: { key: ListingKind; label: string; blurb: string }[] = [
  { key: 'offer', label: 'Offering', blurb: 'Something to sell or hand on' },
  { key: 'free', label: 'Free', blurb: 'Giving it away' },
  { key: 'lend', label: 'To lend', blurb: 'Borrow and return' },
  { key: 'request', label: 'Looking for', blurb: 'Something you need' },
]

/** One compact item-detail chip (Condition, Brand, Dimensions, ...) shown in the listing right rail. */
export interface ListingDetailField {
  label: string
  value: string
}

export interface MarketListing {
  id: string
  author_id: string | null
  title: string
  description: string | null
  kind: ListingKind
  category: string | null
  price_note: string | null
  status: ListingStatus
  images: string[]
  neighborhood: string | null
  city: string | null
  latitude: number | null
  longitude: number | null
  /** Ordered [{label, value}] item detail chips (jsonb; defaults to []). */
  details: ListingDetailField[]
  /** The seller's exact pickup address. Private unless pickup_precision === 'exact'. */
  pickup_address: string | null
  /** 'area' (default) shows only the approximate location; 'exact' reveals pickup_address. */
  pickup_precision: 'area' | 'exact'
  circle_id: string | null
  is_demo: boolean
  /** True when this listing is still held by the Frequency seed owner AND unclaimed (a live claim
   *  token, no claimed_at). Drives the "Unclaimed" browse-card badge. Fail-soft false when the seed
   *  owner can't be resolved. */
  seededUnclaimed: boolean
  created_at: string
  updated_at: string
}

export interface MarketListingWithAuthor extends MarketListing {
  author: { id: string; display_name: string; handle: string; avatar_url: string | null } | null
}

const COLS =
  'id, author_id, title, description, kind, category, price_note, status, images, ' +
  'neighborhood, city, latitude, longitude, details, pickup_address, pickup_precision, ' +
  'circle_id, is_demo, claim_token, claimed_at, created_at, updated_at'
const AUTHOR = 'author:profiles!author_id(id, display_name, handle, avatar_url)'

const touch = () => ({ updated_at: new Date().toISOString() })

/** Whether a raw row is a seeded, still-unclaimed listing (owned by the seed owner, live claim token,
 *  no claimed_at). Fail-soft false when the seed owner is unknown. PURE. */
function computeSeededUnclaimed(row: Record<string, unknown>, seedOwnerId: string | null): boolean {
  if (!seedOwnerId) return false
  return (
    (row.author_id as string | null) === seedOwnerId &&
    (row.claim_token as string | null) != null &&
    (row.claimed_at as string | null) == null
  )
}

// --- Reads ----------------------------------------------------------------

export interface ListOpts {
  kind?: ListingKind | null
  q?: string | null
  hideDemo?: boolean
  limit?: number
}

/** Active listings, newest first, with author. Optional kind + text filter. */
export async function listListings(opts: ListOpts = {}): Promise<MarketListingWithAuthor[]> {
  let query = db()
    .from('market_listings')
    .select(`${COLS}, ${AUTHOR}`)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(opts.limit ?? 60)
  if (opts.kind) query = query.eq('kind', opts.kind)
  if (opts.hideDemo) query = query.eq('is_demo', false)
  if (opts.q && opts.q.trim()) {
    const needle = opts.q.trim().replace(/[%,()]/g, ' ').slice(0, 80)
    if (needle.trim()) query = query.or(`title.ilike.%${needle}%,description.ilike.%${needle}%,category.ilike.%${needle}%`)
  }
  // Resolve the seed owner once per query (process-memoized) so each row can carry seededUnclaimed.
  const [{ data }, seedOwnerId] = await Promise.all([query, resolveSeedOwnerProfileId()])
  const rows = (data as Record<string, unknown>[] | null) ?? []
  return rows.map((r) => ({ ...(r as unknown as MarketListingWithAuthor), seededUnclaimed: computeSeededUnclaimed(r, seedOwnerId) }))
}

/** A single listing with its author. Null if not found. */
export async function getListing(id: string): Promise<MarketListingWithAuthor | null> {
  const [{ data }, seedOwnerId] = await Promise.all([
    db().from('market_listings').select(`${COLS}, ${AUTHOR}`).eq('id', id).maybeSingle(),
    resolveSeedOwnerProfileId(),
  ])
  if (!data) return null
  const r = data as Record<string, unknown>
  return { ...(r as unknown as MarketListingWithAuthor), seededUnclaimed: computeSeededUnclaimed(r, seedOwnerId) }
}

export async function listingAuthorId(id: string): Promise<string | null> {
  const { data } = await db().from('market_listings').select('author_id').eq('id', id).maybeSingle()
  return (data as { author_id: string | null } | null)?.author_id ?? null
}

// --- Mutations (callers enforce: the author owns the listing) ---------------

/** Normalize image URLs: trim, drop empties, cap at 6. */
function cleanImages(images: string[] | undefined): string[] {
  return (images ?? []).map((s) => s.trim()).filter(Boolean).slice(0, 6)
}

/** Normalize item-detail chips: trim both parts, drop any row missing a label or value, cap at 20.
 *  Order is preserved (the chips render in the given order on the detail rail). ListingDetail and the
 *  detail-view ListingDetailField are the same {label, value} shape, so both write paths share this. */
export function cleanDetails(details: ListingDetail[] | undefined): ListingDetail[] {
  return (details ?? [])
    .map((d) => ({ label: (d?.label ?? '').trim().slice(0, 40), value: (d?.value ?? '').trim().slice(0, 160) }))
    .filter((d) => d.label && d.value)
    .slice(0, 20)
}

export interface ListingInput {
  title: string
  description?: string | null
  kind?: ListingKind
  category?: string | null
  priceNote?: string | null
  /** Ordered item-detail chips ({label, value}) for the detail rail. Defaults to []. */
  details?: ListingDetail[]
  /** Pickup precision: 'area' (approximate, default) or 'exact' (reveal pickup_address). */
  pickupPrecision?: ListingPickupPrecision
  neighborhood?: string | null
  city?: string | null
  circleId?: string | null
  images?: string[]
  latitude?: number | null
  longitude?: number | null
}

export async function createListing(authorId: string, input: ListingInput): Promise<MarketListing | null> {
  const { data } = await db()
    .from('market_listings')
    .insert({
      author_id: authorId,
      title: input.title.trim().slice(0, 120),
      description: input.description?.trim() || null,
      kind: input.kind ?? 'offer',
      category: input.category?.trim() || null,
      price_note: input.priceNote?.trim().slice(0, 80) || null,
      details: cleanDetails(input.details),
      pickup_precision: input.pickupPrecision ?? 'area',
      neighborhood: input.neighborhood?.trim() || null,
      city: input.city?.trim() || null,
      circle_id: input.circleId || null,
      images: cleanImages(input.images),
      latitude: input.latitude ?? null,
      longitude: input.longitude ?? null,
    })
    .select(COLS)
    .maybeSingle()
  if (!data) return null
  // A freshly created row is never a "seeded, unclaimed" browse state yet (the seeder mints its claim
  // token in a separate step right after); reads recompute it. Default false keeps the shape honest.
  return { ...(data as unknown as MarketListing), seededUnclaimed: false }
}

export interface ListingPatch {
  title?: string
  description?: string | null
  kind?: ListingKind
  category?: string | null
  priceNote?: string | null
  neighborhood?: string | null
  city?: string | null
  images?: string[]
  latitude?: number | null
  longitude?: number | null
  details?: ListingDetailField[]
  pickupAddress?: string | null
  pickupPrecision?: 'area' | 'exact'
}

export async function updateListing(id: string, patch: ListingPatch): Promise<void> {
  const update: Record<string, unknown> = {}
  if (patch.title !== undefined) update.title = patch.title.trim().slice(0, 120) || 'Untitled'
  if (patch.description !== undefined) update.description = patch.description?.trim() || null
  if (patch.kind !== undefined) update.kind = patch.kind
  if (patch.category !== undefined) update.category = patch.category?.trim() || null
  if (patch.priceNote !== undefined) update.price_note = patch.priceNote?.trim().slice(0, 80) || null
  if (patch.neighborhood !== undefined) update.neighborhood = patch.neighborhood?.trim() || null
  if (patch.city !== undefined) update.city = patch.city?.trim() || null
  if (patch.images !== undefined) update.images = cleanImages(patch.images)
  if (patch.latitude !== undefined) update.latitude = patch.latitude
  if (patch.longitude !== undefined) update.longitude = patch.longitude
  if (patch.details !== undefined) update.details = cleanDetails(patch.details)
  if (patch.pickupAddress !== undefined) update.pickup_address = patch.pickupAddress?.trim() || null
  if (patch.pickupPrecision !== undefined) update.pickup_precision = patch.pickupPrecision === 'exact' ? 'exact' : 'area'
  if (Object.keys(update).length === 0) return
  const { error } = await db().from('market_listings').update({ ...update, ...touch() }).eq('id', id)
  if (error) throw new Error(`Could not update the listing: ${error.message}`)
}

export async function setListingStatus(id: string, status: ListingStatus): Promise<void> {
  const { error } = await db().from('market_listings').update({ status, ...touch() }).eq('id', id)
  if (error) throw new Error(`Could not update the listing status: ${error.message}`)
}

export async function deleteListing(id: string): Promise<void> {
  const { error } = await db().from('market_listings').delete().eq('id', id)
  if (error) throw new Error(`Could not delete the listing: ${error.message}`)
}
