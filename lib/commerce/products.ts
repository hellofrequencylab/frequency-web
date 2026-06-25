// Read/write layer for the commerce catalog (maker, shop, Space storefront). One
// table, owner_kind discriminator. Checkout/settlement live in ./checkout.ts.
// Server-only (admin client behind app-code authz, like lib/marketplace.ts).

import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { ENTITY_ID } from '@/lib/finance/record'
import type { CommerceProduct, OwnerKind, ProductInput, ProductStatus } from './types'

function db(): SupabaseClient {
  return createAdminClient()
}

const PRODUCT_COLS =
  'id, owner_kind, owner_profile_id, owner_space_id, entity_id, product_kind, vertical, title, description, images, price_cents, currency, stock, category, status, booking_space_id, metadata, is_demo, created_at, updated_at'

function rowToProduct(r: Record<string, unknown>): CommerceProduct {
  return {
    id: r.id as string,
    ownerKind: r.owner_kind as OwnerKind,
    ownerProfileId: (r.owner_profile_id as string) ?? null,
    ownerSpaceId: (r.owner_space_id as string) ?? null,
    entityId: r.entity_id as string,
    productKind: r.product_kind as CommerceProduct['productKind'],
    vertical: r.vertical as CommerceProduct['vertical'],
    title: r.title as string,
    description: (r.description as string) ?? null,
    images: (r.images as string[]) ?? [],
    priceCents: r.price_cents as number,
    currency: r.currency as string,
    stock: (r.stock as number) ?? null,
    category: (r.category as string) ?? null,
    status: r.status as ProductStatus,
    bookingSpaceId: (r.booking_space_id as string) ?? null,
    metadata: (r.metadata as Record<string, unknown>) ?? {},
    isDemo: !!r.is_demo,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  }
}

export async function listMakerProducts(opts: { q?: string; limit?: number } = {}): Promise<CommerceProduct[]> {
  let query = db()
    .from('commerce_products')
    .select(PRODUCT_COLS)
    .eq('vertical', 'maker')
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(Math.min(Math.max(opts.limit ?? 40, 1), 100))
  if (opts.q?.trim()) query = query.ilike('title', `%${opts.q.trim()}%`)
  const { data } = await query
  return ((data ?? []) as Record<string, unknown>[]).map(rowToProduct)
}

export async function listShopProducts(opts: { limit?: number } = {}): Promise<CommerceProduct[]> {
  const { data } = await db()
    .from('commerce_products')
    .select(PRODUCT_COLS)
    .eq('owner_kind', 'platform')
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(Math.min(Math.max(opts.limit ?? 60, 1), 100))
  return ((data ?? []) as Record<string, unknown>[]).map(rowToProduct)
}

export async function getProduct(id: string): Promise<CommerceProduct | null> {
  const { data } = await db().from('commerce_products').select(PRODUCT_COLS).eq('id', id).maybeSingle()
  return data ? rowToProduct(data as Record<string, unknown>) : null
}

/** Create a product. owner_kind determines which owner ref is set. Caller (server
 *  action) has already authorized the owner. Commerce settles on the Labs rail. */
export async function createProduct(input: ProductInput): Promise<CommerceProduct | null> {
  const title = input.title?.trim()
  if (!title || !Number.isFinite(input.priceCents) || input.priceCents < 0) return null
  const { data } = await db()
    .from('commerce_products')
    .insert({
      owner_kind: input.ownerKind,
      owner_profile_id: input.ownerProfileId ?? null,
      owner_space_id: input.ownerSpaceId ?? null,
      entity_id: ENTITY_ID.labs,
      product_kind: input.productKind ?? 'physical',
      vertical: input.vertical ?? (input.ownerKind === 'platform' ? 'shop' : 'maker'),
      title: title.slice(0, 200),
      description: input.description ?? null,
      images: (input.images ?? []).slice(0, 8),
      price_cents: Math.round(input.priceCents),
      stock: input.stock ?? null,
      category: input.category ?? null,
      booking_space_id: input.bookingSpaceId ?? null,
      status: 'draft',
    })
    .select(PRODUCT_COLS)
    .maybeSingle()
  return data ? rowToProduct(data as Record<string, unknown>) : null
}

export async function setProductStatus(id: string, status: ProductStatus): Promise<void> {
  await db().from('commerce_products').update({ status }).eq('id', id)
}

/** A maker's own catalog (all statuses), newest first — for their storefront manager. */
export async function listMyMakerProducts(profileId: string): Promise<CommerceProduct[]> {
  const { data } = await db()
    .from('commerce_products')
    .select(PRODUCT_COLS)
    .eq('owner_kind', 'profile')
    .eq('owner_profile_id', profileId)
    .order('created_at', { ascending: false })
  return ((data ?? []) as Record<string, unknown>[]).map(rowToProduct)
}

/** The first-party catalog (all statuses) — the operator Shop manager. */
export async function listPlatformCatalog(): Promise<CommerceProduct[]> {
  const { data } = await db()
    .from('commerce_products')
    .select(PRODUCT_COLS)
    .eq('owner_kind', 'platform')
    .order('created_at', { ascending: false })
  return ((data ?? []) as Record<string, unknown>[]).map(rowToProduct)
}

/** Every Space-owned product (operator oversight of Space storefronts), newest first. */
export async function listSpaceCatalog(): Promise<CommerceProduct[]> {
  const { data } = await db()
    .from('commerce_products')
    .select(PRODUCT_COLS)
    .eq('owner_kind', 'space')
    .order('created_at', { ascending: false })
  return ((data ?? []) as Record<string, unknown>[]).map(rowToProduct)
}

export interface ProductPatch {
  title?: string
  description?: string | null
  priceCents?: number
  category?: string | null
  stock?: number | null
  images?: string[]
}

/** Edit a product's fields. Caller (server action) has authorized the owner/operator. */
export async function updateProduct(id: string, patch: ProductPatch): Promise<void> {
  const update: Record<string, unknown> = {}
  if (patch.title !== undefined) update.title = patch.title.trim().slice(0, 200) || 'Untitled'
  if (patch.description !== undefined) update.description = patch.description ?? null
  if (patch.priceCents !== undefined && Number.isFinite(patch.priceCents) && patch.priceCents >= 0) {
    update.price_cents = Math.round(patch.priceCents)
  }
  if (patch.category !== undefined) update.category = patch.category ?? null
  if (patch.stock !== undefined) update.stock = patch.stock ?? null
  if (patch.images !== undefined) update.images = (patch.images ?? []).slice(0, 8)
  if (Object.keys(update).length === 0) return
  await db().from('commerce_products').update(update).eq('id', id)
}

export async function deleteProduct(id: string): Promise<void> {
  await db().from('commerce_products').delete().eq('id', id)
}

/** Ownership gate for app-code authz: the profile that owns this product (or null). */
export async function productOwnerProfileId(id: string): Promise<string | null> {
  const { data } = await db().from('commerce_products').select('owner_profile_id').eq('id', id).maybeSingle()
  return (data as { owner_profile_id?: string } | null)?.owner_profile_id ?? null
}
