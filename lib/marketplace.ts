// Local Marketplace (vertical 5, ADR-148): geolocated, no-fee listings members
// swap / give / lend / request. No in-app payment — we connect people (DMs) and
// they arrange offline. Server-only. Writes go through the service-role admin
// client behind app-code authz (callers enforce: author owns the listing); the
// market_listings table is new, so we read/write through an untyped handle until
// `supabase gen types` is re-run (repo convention — see lib/journey-plans.ts).

import { createAdminClient } from '@/lib/supabase/admin'
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
  circle_id: string | null
  is_demo: boolean
  created_at: string
  updated_at: string
}

export interface MarketListingWithAuthor extends MarketListing {
  author: { id: string; display_name: string; handle: string; avatar_url: string | null } | null
}

const COLS =
  'id, author_id, title, description, kind, category, price_note, status, images, ' +
  'neighborhood, city, latitude, longitude, circle_id, is_demo, created_at, updated_at'
const AUTHOR = 'author:profiles!author_id(id, display_name, handle, avatar_url)'

const touch = () => ({ updated_at: new Date().toISOString() })

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
  const { data } = await query
  return (data as MarketListingWithAuthor[] | null) ?? []
}

/** A single listing with its author. Null if not found. */
export async function getListing(id: string): Promise<MarketListingWithAuthor | null> {
  const { data } = await db().from('market_listings').select(`${COLS}, ${AUTHOR}`).eq('id', id).maybeSingle()
  return (data as MarketListingWithAuthor | null) ?? null
}

/** A member's own listings (any status), newest-touched first. */
export async function myListings(authorId: string): Promise<MarketListing[]> {
  const { data } = await db()
    .from('market_listings')
    .select(COLS)
    .eq('author_id', authorId)
    .order('updated_at', { ascending: false })
  return (data as MarketListing[] | null) ?? []
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

export interface ListingInput {
  title: string
  description?: string | null
  kind?: ListingKind
  category?: string | null
  priceNote?: string | null
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
      neighborhood: input.neighborhood?.trim() || null,
      city: input.city?.trim() || null,
      circle_id: input.circleId || null,
      images: cleanImages(input.images),
      latitude: input.latitude ?? null,
      longitude: input.longitude ?? null,
    })
    .select(COLS)
    .maybeSingle()
  return (data as MarketListing | null) ?? null
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
  if (Object.keys(update).length === 0) return
  await db().from('market_listings').update({ ...update, ...touch() }).eq('id', id)
}

export async function setListingStatus(id: string, status: ListingStatus): Promise<void> {
  await db().from('market_listings').update({ status, ...touch() }).eq('id', id)
}

export async function deleteListing(id: string): Promise<void> {
  await db().from('market_listings').delete().eq('id', id)
}
