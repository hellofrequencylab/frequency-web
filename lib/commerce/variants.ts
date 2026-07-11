// Read/write layer for per-product variants (Etsy-Grade Phase 2). A product may have
// 0..N variants (size/color/etc); a plain product with no variants keeps its single
// price + single stock and behaves exactly as before. Server-only (admin client behind
// app-code authz, like lib/commerce/products.ts). Checkout/settlement live in ./checkout.ts.
//
// types: regenerated after the 20261132000000_commerce_variants migration applies. Until then
// db() is annotated as the untyped SupabaseClient so `.from('commerce_variants')` type-checks
// (same idiom as lib/commerce/reviews.ts / reports.ts).

import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import type { CommerceVariant, VariantInput } from './types'

function db(): SupabaseClient {
  return createAdminClient()
}

const VARIANT_COLS = 'id, product_id, name, options, price_cents, stock, sku, sort_order, active, created_at'

function rowToVariant(r: Record<string, unknown>): CommerceVariant {
  return {
    id: r.id as string,
    productId: r.product_id as string,
    name: (r.name as string) ?? '',
    options: (r.options as Record<string, string>) ?? {},
    priceCents: (r.price_cents as number) ?? null,
    stock: (r.stock as number) ?? null,
    sku: (r.sku as string) ?? null,
    sortOrder: (r.sort_order as number) ?? 0,
    active: r.active !== false,
    createdAt: r.created_at as string,
  }
}

/** Clamp a nullable price (dollars already converted to cents by the caller) to a non-negative int,
 *  or null (inherit the product price). */
function normPrice(v: number | null | undefined): number | null {
  if (v == null || !Number.isFinite(v) || v < 0) return null
  return Math.round(v)
}

/** Clamp a nullable stock to a non-negative int, or null (untracked). */
function normStock(v: number | null | undefined): number | null {
  if (v == null || !Number.isFinite(v) || v < 0) return null
  return Math.floor(v)
}

/** Every variant for a product, authoring order (the Shop console editor — all statuses). */
export async function listVariants(productId: string): Promise<CommerceVariant[]> {
  if (!productId) return []
  const { data } = await db()
    .from('commerce_variants')
    .select(VARIANT_COLS)
    .eq('product_id', productId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })
  return ((data ?? []) as Record<string, unknown>[]).map(rowToVariant)
}

/** The ACTIVE variants for a product (the buyer picker). Distinct from listVariants, which returns
 *  inactive rows too for the owner console — never reuse that reader on the buyer surface. */
export async function listActiveVariants(productId: string): Promise<CommerceVariant[]> {
  if (!productId) return []
  const { data } = await db()
    .from('commerce_variants')
    .select(VARIANT_COLS)
    .eq('product_id', productId)
    .eq('active', true)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })
  return ((data ?? []) as Record<string, unknown>[]).map(rowToVariant)
}

/** Every variant for a set of products, grouped by product id (the Shop console Catalog seeds each edit
 *  form from this in one query, no N+1). Products with no variants are simply absent from the map. */
export async function listVariantsForProducts(productIds: string[]): Promise<Map<string, CommerceVariant[]>> {
  const unique = [...new Set(productIds.filter(Boolean))]
  const map = new Map<string, CommerceVariant[]>()
  if (!unique.length) return map
  const { data } = await db()
    .from('commerce_variants')
    .select(VARIANT_COLS)
    .in('product_id', unique)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })
  for (const r of (data ?? []) as Record<string, unknown>[]) {
    const v = rowToVariant(r)
    const list = map.get(v.productId) ?? []
    list.push(v)
    map.set(v.productId, list)
  }
  return map
}

/** One variant by id (checkout validation). Null when missing. */
export async function getVariant(id: string): Promise<CommerceVariant | null> {
  if (!id) return null
  const { data } = await db().from('commerce_variants').select(VARIANT_COLS).eq('id', id).maybeSingle()
  return data ? rowToVariant(data as Record<string, unknown>) : null
}

/** Fetch a set of variants by id in one query, keyed by id (checkout validation across a cart).
 *  Missing ids are simply absent from the map. */
export async function getVariantsByIds(ids: string[]): Promise<Map<string, CommerceVariant>> {
  const unique = [...new Set(ids.filter(Boolean))]
  if (!unique.length) return new Map()
  const { data } = await db().from('commerce_variants').select(VARIANT_COLS).in('id', unique)
  const map = new Map<string, CommerceVariant>()
  for (const r of (data ?? []) as Record<string, unknown>[]) {
    const v = rowToVariant(r)
    map.set(v.id, v)
  }
  return map
}

/** Replace a product's variant set to exactly `inputs` (the Shop console editor persists the whole set):
 *  rows with an `id` are updated in place, rows without one are inserted, and any existing row NOT in the
 *  incoming id set is deleted. Deleting a variant is safe for order history (the FK is ON DELETE SET NULL,
 *  and the item keeps its price + title snapshot). Caller (server action) has authorized the owner. */
export async function upsertVariants(productId: string, inputs: VariantInput[]): Promise<void> {
  if (!productId) return
  const client = db()

  // Existing rows for this product, to compute deletions.
  const { data: existingRows } = await client.from('commerce_variants').select('id').eq('product_id', productId)
  const existingIds = new Set(((existingRows ?? []) as { id: string }[]).map((r) => r.id))

  const keepIds = new Set<string>()
  const inserts: Record<string, unknown>[] = []

  for (let i = 0; i < inputs.length; i++) {
    const input = inputs[i]
    const name = (input.name ?? '').trim().slice(0, 200)
    if (!name) continue // a nameless row is dropped (the form requires a name)
    const row = {
      name,
      options: input.options ?? {},
      price_cents: normPrice(input.priceCents),
      stock: normStock(input.stock),
      sku: input.sku?.trim() ? input.sku.trim().slice(0, 120) : null,
      sort_order: Number.isFinite(input.sortOrder) ? Number(input.sortOrder) : i,
      active: input.active !== false,
    }
    if (input.id && existingIds.has(input.id)) {
      keepIds.add(input.id)
      const { error } = await client.from('commerce_variants').update(row).eq('id', input.id)
      if (error) throw new Error(error.message)
    } else {
      inserts.push({ product_id: productId, ...row })
    }
  }

  // Delete rows the operator removed (present before, absent now).
  const toDelete = [...existingIds].filter((id) => !keepIds.has(id))
  if (toDelete.length) {
    const { error } = await client.from('commerce_variants').delete().in('id', toDelete)
    if (error) throw new Error(error.message)
  }

  if (inserts.length) {
    const { error } = await client.from('commerce_variants').insert(inserts)
    if (error) throw new Error(error.message)
  }
}

/** Delete a single variant (safe for order history via ON DELETE SET NULL). Caller has authorized the owner. */
export async function deleteVariant(id: string): Promise<void> {
  if (!id) return
  const { error } = await db().from('commerce_variants').delete().eq('id', id)
  if (error) throw new Error(error.message)
}
