// Data layer for the connect-only listings base (General + Housing). Mirrors the
// existing lib/marketplace.ts style: flat reads/writes via the admin client behind
// app-code authz; RLS governs direct reads. Per-vertical attributes in ./housing.ts.

import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { ENTITY_ID } from '@/lib/finance/record'
import type { Listing, ListingStatus, ListingVertical } from './types'

function db(): SupabaseClient {
  return createAdminClient()
}

const LISTING_COLS =
  'id, vertical, owner_profile_id, entity_id, title, description, status, images, price_note, category, neighborhood, city, latitude, longitude, circle_id, is_demo, created_at, updated_at'

export function rowToListing(r: Record<string, unknown>): Listing {
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
  const { data } = await query
  return ((data ?? []) as Record<string, unknown>[]).map(rowToListing)
}

export async function getListing(id: string): Promise<Listing | null> {
  const { data } = await db().from('listings').select(LISTING_COLS).eq('id', id).maybeSingle()
  return data ? rowToListing(data as Record<string, unknown>) : null
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
  const { data } = await db()
    .from('listings')
    .select(`${LISTING_COLS}, owner:profiles!owner_profile_id(id, display_name, handle, avatar_url)`)
    .eq('id', id)
    .maybeSingle()
  if (!data) return null
  const r = data as Record<string, unknown>
  const raw = (Array.isArray(r.owner) ? r.owner[0] : r.owner) as Record<string, unknown> | null
  return {
    ...rowToListing(r),
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
