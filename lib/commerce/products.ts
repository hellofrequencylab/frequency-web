// Read/write layer for the commerce catalog (maker, shop, Space storefront). One
// table, owner_kind discriminator. Checkout/settlement live in ./checkout.ts.
// Server-only (admin client behind app-code authz, like lib/marketplace.ts).

import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { ENTITY_ID } from '@/lib/finance/record'
import type { CommerceProduct, OwnerKind, ProductInput, ProductStatus, MarketGroup, ServiceConfig, ProductCondition } from './types'
import { kindsForGroup } from './types'

/** Drop undefined keys from a ServiceConfig so a partial edit never writes `undefined` into the JSON
 *  (and an all-undefined config collapses to null, meaning "no policy"). Copies only the KNOWN
 *  ServiceConfig fields by name (never a dynamic key from the input) so an attacker-supplied key on a
 *  client-provided patch can't be written into the stored object (no property injection / prototype
 *  pollution). Add a field here when ServiceConfig gains one. */
function pruneServiceConfig(svc: ServiceConfig): ServiceConfig | null {
  const out: ServiceConfig = {}
  if (svc.priceModel != null) out.priceModel = svc.priceModel
  if (svc.durationMin != null) out.durationMin = svc.durationMin
  if (svc.depositCents != null) out.depositCents = svc.depositCents
  if (svc.recurrence != null) out.recurrence = svc.recurrence
  if (svc.cancellationWindowHours != null) out.cancellationWindowHours = svc.cancellationWindowHours
  if (svc.noShowFeePct != null) out.noShowFeePct = svc.noShowFeePct
  if (svc.slidingScale != null) out.slidingScale = svc.slidingScale
  return Object.keys(out).length ? out : null
}

function db(): SupabaseClient {
  return createAdminClient()
}

// Listing photos live in the PUBLIC event-media bucket under the uploader's own uid prefix (the same
// owner-scoped storage RLS the events uploader uses). commerce_products.images stores storage PATHS;
// rowToProduct resolves each to a public URL below, so every display consumer (product cards, the
// detail gallery) keeps rendering plain URLs. See migration 20261128000000_commerce_media_tags.sql.
const COMMERCE_MEDIA_BUCKET = 'event-media'

/** Resolve a stored image reference to a public URL. A value already looking like a URL (a legacy row,
 *  or a ticket projection's event-media URL) passes through untouched; a storage path is resolved via
 *  getPublicUrl. Keeps the maker/Shop uploader on PATHS while cards + the detail page get URLs. */
function resolveImage(ref: string): string {
  if (/^https?:\/\//i.test(ref)) return ref
  return db().storage.from(COMMERCE_MEDIA_BUCKET).getPublicUrl(ref).data.publicUrl
}

const PRODUCT_COLS =
  'id, owner_kind, owner_profile_id, owner_space_id, entity_id, product_kind, vertical, title, description, images, price_cents, currency, stock, category, status, booking_space_id, condition, market_published, tags, metadata, is_demo, created_at, updated_at'

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
    // Stored as storage paths (or legacy URLs); resolved to public URLs for display.
    images: ((r.images as string[]) ?? []).map(resolveImage),
    priceCents: r.price_cents as number,
    currency: r.currency as string,
    stock: (r.stock as number) ?? null,
    category: (r.category as string) ?? null,
    status: r.status as ProductStatus,
    bookingSpaceId: (r.booking_space_id as string) ?? null,
    condition: (r.condition as CommerceProduct['condition']) ?? null,
    marketPublished: !!r.market_published,
    tags: (r.tags as string[]) ?? [],
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
  const { data, error } = await db()
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
      condition: input.condition ?? null,
      market_published: input.marketPublished ?? false,
      // Discovery tags (Etsy-Grade Phase 1). `tags` is not in the generated DB types; db() is the
      // untyped admin client (ADR-246), so this writes without editing lib/database.types.ts.
      tags: (input.tags ?? []).slice(0, 12),
      // Persist the full service quote + policy (priceModel, cancellation/no-show fields, duration,
      // deposit) under metadata.service when present, so a service can be authored in one write.
      ...(input.service ? { metadata: { service: pruneServiceConfig(input.service) ?? {} } } : {}),
      status: 'draft',
    })
    .select(PRODUCT_COLS)
    .maybeSingle()
  // Surface a failed insert instead of returning null and letting the action report a
  // silent "success" with no product created.
  if (error) throw new Error(error.message)
  return data ? rowToProduct(data as Record<string, unknown>) : null
}

export async function setProductStatus(id: string, status: ProductStatus): Promise<void> {
  const { error } = await db().from('commerce_products').update({ status }).eq('id', id)
  if (error) throw new Error(error.message)
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

/** Space-owned products, newest first. Pass a `spaceId` to scope to ONE Space (its own Shop
 *  console Catalog tab); no arg returns every Space's products (operator oversight). Scoping the
 *  Catalog tab is essential — the no-arg form would leak every Space's catalog (ADR-596). */
export async function listSpaceCatalog(spaceId?: string): Promise<CommerceProduct[]> {
  let query = db()
    .from('commerce_products')
    .select(PRODUCT_COLS)
    .eq('owner_kind', 'space')
    .order('created_at', { ascending: false })
  if (spaceId) query = query.eq('owner_space_id', spaceId)
  const { data } = await query
  return ((data ?? []) as Record<string, unknown>[]).map(rowToProduct)
}

/** A Space's PUBLIC catalog: only active listings, for the public Shop tab (Phase 6, ADR-596). Distinct
 *  from listSpaceCatalog, which returns every status (draft/archived) for the owner console — never reuse
 *  that reader publicly or it leaks unpublished items. */
export async function listPublicSpaceCatalog(spaceId: string): Promise<CommerceProduct[]> {
  if (!spaceId) return []
  const { data } = await db()
    .from('commerce_products')
    .select(PRODUCT_COLS)
    .eq('owner_kind', 'space')
    .eq('owner_space_id', spaceId)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
  return ((data ?? []) as Record<string, unknown>[]).map(rowToProduct)
}

/** The Space that owns this product (or null) — the ownership gate for a Space's own write
 *  actions (parallels productOwnerProfileId, which is null for owner_kind='space'). */
export async function productOwnerSpaceId(id: string): Promise<string | null> {
  const { data } = await db().from('commerce_products').select('owner_space_id').eq('id', id).maybeSingle()
  return (data as { owner_space_id?: string } | null)?.owner_space_id ?? null
}

/** THE MARKET UMBRELLA READER (ADR-596): active + market-published listings across makers (owner_kind
 *  'profile') and Business Spaces ('space'), optionally narrowed to one typed group + a title search.
 *  The resolution of TODO(services-marketplace): after the Phase 3 backfill the cross-space browse is a
 *  plain commerce_products query. Gated on market_published (NOT status alone), so a Space's active-in-
 *  its-own-Shop listing only reaches the global Market when the owner opts in. */
export async function listMarketListings(
  opts: { group?: MarketGroup; q?: string; limit?: number } = {},
): Promise<CommerceProduct[]> {
  let query = db()
    .from('commerce_products')
    .select(PRODUCT_COLS)
    .eq('status', 'active')
    .eq('market_published', true)
    .in('owner_kind', ['profile', 'space'])
    .order('created_at', { ascending: false })
    .limit(Math.min(Math.max(opts.limit ?? 40, 1), 100))
  if (opts.group) query = query.in('product_kind', kindsForGroup(opts.group))
  if (opts.q?.trim()) query = query.ilike('title', `%${opts.q.trim()}%`)
  const { data } = await query
  return ((data ?? []) as Record<string, unknown>[]).map(rowToProduct)
}

/** Set a listing's Market opt-in (the Shop console Catalog "Publish to Market" toggle). Caller (server
 *  action) has authorized the owner. */
export async function setProductMarketPublished(id: string, published: boolean): Promise<void> {
  const { error } = await db().from('commerce_products').update({ market_published: published }).eq('id', id)
  if (error) throw new Error(error.message)
}

export interface ProductPatch {
  title?: string
  description?: string | null
  priceCents?: number
  category?: string | null
  stock?: number | null
  images?: string[]
  /** Discovery tags (Etsy-Grade Phase 1). Replaces the whole list when present; [] clears it. */
  tags?: string[]
  /** The adaptive editor may change the item type (product | service | ticket → product_kind). */
  productKind?: CommerceProduct['productKind']
  /** New or Used (Phase 0). null clears it (e.g. an item switched to a service). */
  condition?: ProductCondition | null
  /** Partial metadata to MERGE over the row's existing metadata (never clobbers sibling keys such
   *  as the backfill 'source' marker) — e.g. `{ service: ServiceConfig }`. */
  metadata?: Record<string, unknown>
  /** The service quote + policy (priceModel, duration, deposit, cancellationWindowHours,
   *  noShowFeePct). Convenience over `metadata`: MERGED over the existing metadata.service so a
   *  partial edit (e.g. just the policy) never clobbers the other service fields. */
  service?: ServiceConfig | null
  /** Market opt-in: true lists this item in the global Market (cross-space browse), false keeps it to
   *  the Space's own page/Shop only. Mirrors setProductMarketPublished; lets the item editor set it inline. */
  marketPublished?: boolean
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
  if (patch.tags !== undefined) update.tags = (patch.tags ?? []).slice(0, 12)
  if (patch.productKind !== undefined) update.product_kind = patch.productKind
  if (patch.condition !== undefined) update.condition = patch.condition ?? null
  if (patch.marketPublished !== undefined) update.market_published = patch.marketPublished
  if (patch.metadata !== undefined || patch.service !== undefined) {
    // Merge over existing metadata so we never clobber sibling keys (backfill 'source', etc.). One
    // read serves both `metadata` and the typed `service` convenience.
    const { data: cur } = await db().from('commerce_products').select('metadata').eq('id', id).maybeSingle()
    const existing = (cur as { metadata?: Record<string, unknown> } | null)?.metadata ?? {}
    const merged: Record<string, unknown> = { ...existing, ...(patch.metadata ?? {}) }
    if (patch.service !== undefined) {
      // Deep-merge the service subtree so a partial policy edit keeps the other service fields.
      const existingSvc = (existing.service as ServiceConfig | undefined) ?? {}
      merged.service = pruneServiceConfig({ ...existingSvc, ...(patch.service ?? {}) }) ?? {}
    }
    update.metadata = merged
  }
  if (Object.keys(update).length === 0) return
  const { error } = await db().from('commerce_products').update(update).eq('id', id)
  if (error) throw new Error(error.message)
}

export async function deleteProduct(id: string): Promise<void> {
  const { error } = await db().from('commerce_products').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

/** Copy an existing product into a NEW draft (the Catalog "Duplicate" action, Phase 1). Carries over
 *  every authored field (photos, tags, category, condition, price, service policy) but resets to a
 *  private draft: status='draft' and market_published=false, so the copy never auto-publishes to the
 *  Shop tab or the global Market until the owner reviews and publishes it. Caller (server action) has
 *  authorized the owner. Copies raw image PATHS (never the resolved URLs), so the duplicate keeps
 *  pointing at the same stored photos. */
export async function duplicateProduct(id: string): Promise<CommerceProduct | null> {
  const { data: src } = await db().from('commerce_products').select(PRODUCT_COLS).eq('id', id).maybeSingle()
  if (!src) return null
  const r = src as Record<string, unknown>
  const { data, error } = await db()
    .from('commerce_products')
    .insert({
      owner_kind: r.owner_kind,
      owner_profile_id: r.owner_profile_id ?? null,
      owner_space_id: r.owner_space_id ?? null,
      entity_id: r.entity_id,
      product_kind: r.product_kind,
      vertical: r.vertical,
      title: `Copy of ${(r.title as string) ?? 'Untitled'}`.slice(0, 200),
      description: r.description ?? null,
      images: (r.images as string[]) ?? [],
      price_cents: r.price_cents,
      stock: r.stock ?? null,
      category: r.category ?? null,
      condition: r.condition ?? null,
      booking_space_id: r.booking_space_id ?? null,
      tags: (r.tags as string[]) ?? [],
      metadata: r.metadata ?? {},
      market_published: false,
      status: 'draft',
    })
    .select(PRODUCT_COLS)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data ? rowToProduct(data as Record<string, unknown>) : null
}

/** The public contact card (handle + display name) for a profile-owned listing's seller — for the
 *  connect-only "Contact seller" action (Phase 0, R2), where an individual maker can't take in-app
 *  payment and the buyer reaches out instead. Null for a non-profile listing or a missing/handle-less
 *  profile. */
export async function getSellerContact(
  profileId: string | null,
): Promise<{ handle: string; displayName: string } | null> {
  if (!profileId) return null
  const { data } = await db().from('profiles').select('handle, display_name').eq('id', profileId).maybeSingle()
  const row = data as { handle: string | null; display_name: string | null } | null
  if (!row?.handle) return null
  return { handle: row.handle, displayName: row.display_name ?? 'the seller' }
}

/** Ownership gate for app-code authz: the profile that owns this product (or null). */
export async function productOwnerProfileId(id: string): Promise<string | null> {
  const { data } = await db().from('commerce_products').select('owner_profile_id').eq('id', id).maybeSingle()
  return (data as { owner_profile_id?: string } | null)?.owner_profile_id ?? null
}
