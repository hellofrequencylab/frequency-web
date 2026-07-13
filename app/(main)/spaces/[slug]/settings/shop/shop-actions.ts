'use server'

import { revalidatePath } from 'next/cache'
import { getCallerProfile } from '@/lib/auth'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
import { resolveSpaceManageAccess, getSpaceCapabilities } from '@/lib/spaces/entitlements'
import { spaceFunctionAccess } from '@/lib/spaces/functions'
import { isConsoleSpaceType } from '@/lib/spaces/types'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  createProduct,
  setProductStatus,
  deleteProduct,
  updateProduct,
  duplicateProduct,
  productOwnerSpaceId,
  setProductMarketPublished,
  type ProductPatch,
} from '@/lib/commerce/products'
import { upsertVariants } from '@/lib/commerce/variants'
import { normalizeCategory, normalizeTags } from '@/lib/commerce/categories'
import { readStorefrontConfig, withStorefrontConfig } from '@/lib/spaces/storefront'
import { draftListingCopy, type ListingCopy } from '@/lib/ai/listing-copy'
import type { ProductStatus, ProductKind, CommerceVertical, ProductCondition, ServiceConfig, ServicePriceModel, VariantInput } from '@/lib/commerce/types'

// Space Shop console write actions (ADR-596). Every action gates on resolveSpaceManageAccess (owner /
// admin / editor — NOT the profile-only productOwnerProfileId, which is null for a Space), and each
// per-item action also checks productOwnerSpaceId === space.id so one Space can never touch another's
// catalog. Reuses the existing commerce writers (createProduct / updateProduct / setProductStatus /
// deleteProduct); no checkout change is needed. Billing stays gated OFF, so nothing charges.

/** Resolve the Space + assert the caller may manage it (write authority). Returns the space id, or null
 *  when the caller is not an editor (a staff preview is read-only, so it cannot write). */
async function gateSpaceWrite(slug: string): Promise<{ spaceId: string } | null> {
  const caller = await getCallerProfile()
  const space = await getVisibleSpaceBySlug(slug, caller?.id ?? null)
  if (!space) return null
  const { canManage } = await resolveSpaceManageAccess(space, caller?.id ?? null, caller?.webRole)
  if (!canManage) return null
  // The Shop is a Business-account feature; enforce the same space-type gate as the page here too, since
  // server actions are addressable independently of the page render (defense in depth, ADR-596).
  if (!isConsoleSpaceType(space.type)) return null
  // Shop is a gateable function: enforce the same `shop` on/off + role gate the console page applies, so a
  // write can never bypass a disabled or role-locked Shop (server actions are addressable on their own).
  const caps = await getSpaceCapabilities(space, caller?.id ?? null)
  if (!spaceFunctionAccess(space, 'shop', caps.role)) return null
  return { spaceId: space.id }
}

/** Map the editor's `kind` to (product_kind, vertical). Service items sit on the 'service' vertical; a
 *  product or ticket rides 'shop'. marketGroupForKind derives the Market rail from product_kind (Phase 5). */
function kindToCommerce(kind: string): { productKind: ProductKind; vertical: CommerceVertical } {
  if (kind === 'service') return { productKind: 'service', vertical: 'service' }
  if (kind === 'ticket') return { productKind: 'ticket', vertical: 'shop' }
  return { productKind: 'physical', vertical: 'shop' }
}

/** Parse a JSON string[] posted in a hidden form field (image paths, tags), tolerating a blank or
 *  malformed value by returning []. Every element is coerced to a trimmed string. */
function parseStringArray(raw: FormDataEntryValue | null): string[] {
  if (typeof raw !== 'string' || !raw.trim()) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.map((v) => String(v).trim()).filter(Boolean) : []
  } catch {
    return []
  }
}

/** Narrow a raw form value to a ServicePriceModel, or undefined (default-deny). */
function asPriceModel(raw: unknown): ServicePriceModel | undefined {
  const v = String(raw ?? '')
  return v === 'fixed' || v === 'from' || v === 'free' || v === 'contact' || v === 'choose'
    ? v
    : undefined
}

/** Narrow a raw form value to a ProductCondition, or null (default-deny). A Business Space may list
 *  New or Used (R3), so both pass. */
function asCondition(raw: unknown): ProductCondition | null {
  const v = String(raw ?? '')
  return v === 'new' || v === 'used' ? v : null
}

/** Build the metadata.service ServiceConfig from the form (service items only): the price model,
 *  the session length + deposit, and the cancellation/no-show policy. */
function serviceConfigFromForm(formData: FormData): ServiceConfig | null {
  const cfg: ServiceConfig = {}
  const priceModel = asPriceModel(formData.get('priceModel'))
  if (priceModel) cfg.priceModel = priceModel
  // Choose-your-price anchor + optional floor (Pricing Options P1). Stored in cents on the service
  // config; DISPLAY / config only until the buyer render (P2) + checkout wiring (P3).
  const suggestedDollars = Number(formData.get('suggested'))
  if (Number.isFinite(suggestedDollars) && suggestedDollars > 0) {
    cfg.suggestedCents = Math.round(suggestedDollars * 100)
  }
  const minDollars = Number(formData.get('min'))
  if (Number.isFinite(minDollars) && minDollars > 0) cfg.minCents = Math.round(minDollars * 100)
  const durationMin = Number(formData.get('durationMin'))
  if (Number.isFinite(durationMin) && durationMin > 0) cfg.durationMin = Math.round(durationMin)
  const depositDollars = Number(formData.get('deposit'))
  if (Number.isFinite(depositDollars) && depositDollars > 0) cfg.depositCents = Math.round(depositDollars * 100)
  const cancellationWindowHours = Number(formData.get('cancellationWindowHours'))
  if (Number.isFinite(cancellationWindowHours) && cancellationWindowHours > 0) {
    cfg.cancellationWindowHours = Math.round(cancellationWindowHours)
  }
  const noShowFeePct = Number(formData.get('noShowFeePct'))
  if (Number.isFinite(noShowFeePct) && noShowFeePct > 0) {
    cfg.noShowFeePct = Math.min(100, Math.round(noShowFeePct))
  }
  return Object.keys(cfg).length ? cfg : null
}

/** Parse the optional variants set posted as a JSON array in a hidden form field (Etsy-Grade Phase 2).
 *  Every field is sanitized to its expected type here (defense in depth); the writer clamps + caps again.
 *  Only rows with a non-empty name survive. A blank price maps to null (inherit the product price); a
 *  blank stock maps to null (untracked). Options are coerced to a string->string record. */
function parseVariantInputs(raw: FormDataEntryValue | null): VariantInput[] {
  if (typeof raw !== 'string' || !raw.trim()) return []
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return []
  }
  if (!Array.isArray(parsed)) return []
  const out: VariantInput[] = []
  for (const item of parsed) {
    if (!item || typeof item !== 'object') continue
    const r = item as Record<string, unknown>
    const name = String(r.name ?? '').trim()
    if (!name) continue
    const options: Record<string, string> = {}
    if (r.options && typeof r.options === 'object') {
      for (const [k, v] of Object.entries(r.options as Record<string, unknown>)) {
        const key = String(k).trim()
        const val = String(v ?? '').trim()
        if (key && val) options[key.slice(0, 40)] = val.slice(0, 80)
      }
    }
    const priceCents = r.priceCents == null || r.priceCents === '' ? null : Number(r.priceCents)
    const stock = r.stock == null || r.stock === '' ? null : Number(r.stock)
    out.push({
      id: typeof r.id === 'string' && r.id ? r.id : undefined,
      name,
      options,
      priceCents: priceCents != null && Number.isFinite(priceCents) ? priceCents : null,
      stock: stock != null && Number.isFinite(stock) ? stock : null,
      sku: r.sku != null && String(r.sku).trim() ? String(r.sku).trim() : null,
      sortOrder: out.length,
    })
  }
  return out
}

export async function createSpaceProductAction(slug: string, formData: FormData): Promise<void> {
  const gate = await gateSpaceWrite(slug)
  if (!gate) return

  const title = String(formData.get('title') ?? '').trim()
  const priceDollars = Number(formData.get('price'))
  if (!title || !Number.isFinite(priceDollars) || priceDollars < 0) return

  const kind = String(formData.get('kind') ?? 'product')
  const { productKind, vertical } = kindToCommerce(kind)
  const service = productKind === 'service' ? serviceConfigFromForm(formData) : null
  // Condition applies to a product only (R3); a service/ticket carries none.
  const condition = productKind === 'physical' ? asCondition(formData.get('condition')) : null

  const product = await createProduct({
    ownerKind: 'space',
    ownerSpaceId: gate.spaceId,
    // MUST pass both explicitly — createProduct defaults product_kind='physical' and vertical='maker'.
    productKind,
    vertical,
    title,
    description: (formData.get('description') as string) || null,
    category: normalizeCategory(formData.get('category') as string | null),
    images: parseStringArray(formData.get('images')),
    tags: normalizeTags(parseStringArray(formData.get('tags'))),
    priceCents: Math.round(priceDollars * 100),
    condition,
    // A service books against the Space's own availability calendar (Phase 4, ADR-596).
    bookingSpaceId: productKind === 'service' ? gate.spaceId : undefined,
    // The full quote + policy (price model, duration, deposit, cancellation, no-show) in one write.
    service,
  })
  if (!product) return

  // Optional variants (Etsy-Grade Phase 2): only a product carries them (services book, tickets are
  // event spots). Persist the authored set; a plain product with no rows is unchanged.
  if (productKind === 'physical') {
    const variants = parseVariantInputs(formData.get('variants'))
    if (variants.length) await upsertVariants(product.id, variants)
  }

  // A listed item is live to browse immediately; checkout still needs payouts + billing on.
  await setProductStatus(product.id, 'active')
  revalidatePath(`/spaces/${slug}/settings/shop`)
}

/** Ownership-gate a per-item write: the caller manages the Space AND the item belongs to it. */
async function gateSpaceItem(slug: string, productId: string): Promise<boolean> {
  const gate = await gateSpaceWrite(slug)
  if (!gate) return false
  return (await productOwnerSpaceId(productId)) === gate.spaceId
}

export async function setSpaceProductStatusAction(slug: string, id: string, status: ProductStatus): Promise<void> {
  if (!(await gateSpaceItem(slug, id))) return
  await setProductStatus(id, status)
  revalidatePath(`/spaces/${slug}/settings/shop`)
}

export async function deleteSpaceProductAction(slug: string, id: string): Promise<void> {
  if (!(await gateSpaceItem(slug, id))) return
  await deleteProduct(id)
  revalidatePath(`/spaces/${slug}/settings/shop`)
}

/** Edit a catalog item in place (F5). Owner-gated to this Space's item, then hands the patch (title,
 *  price, description, kind, and the deep-merged service config) to the commerce writer. The `service`
 *  subtree is deep-merged, so a partial edit never clobbers untouched fields. */
export async function updateProductAction(
  slug: string,
  id: string,
  patch: ProductPatch,
  variants?: VariantInput[],
): Promise<void> {
  if (!(await gateSpaceItem(slug, id))) return
  // Re-sanitize the client-supplied taxonomy + tags server-side (defense in depth); images and tag
  // counts are also capped in the writer.
  const safe: ProductPatch = { ...patch }
  if (patch.category !== undefined) safe.category = normalizeCategory(patch.category)
  if (patch.tags !== undefined) safe.tags = normalizeTags(patch.tags)
  await updateProduct(id, safe)
  // Variants (Etsy-Grade Phase 2): when the editor sends a set, REPLACE the product's variants to
  // exactly it (rows added/edited/removed). undefined means the editor did not touch variants, so leave
  // them as-is. Re-sanitize each row server-side, then upsert the whole set.
  if (variants !== undefined) {
    await upsertVariants(
      id,
      variants.map((v, i) => ({
        id: v.id,
        name: String(v.name ?? '').trim(),
        options:
          v.options && typeof v.options === 'object'
            ? Object.fromEntries(
                Object.entries(v.options)
                  .map(([k, val]) => [String(k).trim().slice(0, 40), String(val ?? '').trim().slice(0, 80)])
                  .filter(([k, val]) => k && val),
              )
            : {},
        priceCents: v.priceCents != null && Number.isFinite(v.priceCents) ? v.priceCents : null,
        stock: v.stock != null && Number.isFinite(v.stock) ? v.stock : null,
        sku: v.sku != null && String(v.sku).trim() ? String(v.sku).trim() : null,
        sortOrder: i,
      })),
    )
  }
  revalidatePath(`/spaces/${slug}/settings/shop`)
}

/** Duplicate a catalog item into a new private draft (Phase 1). Owner-gated to this Space's item; the
 *  copy is created with status='draft' and market_published=false, so it never auto-publishes -- the
 *  owner reviews it (photos, price, tags all carried over) and publishes when ready. */
export async function duplicateSpaceProductAction(slug: string, id: string): Promise<void> {
  if (!(await gateSpaceItem(slug, id))) return
  await duplicateProduct(id)
  revalidatePath(`/spaces/${slug}/settings/shop`)
}

/** Draft the title + description for a listing with Vera (#5). Gated to a manager of this Space (same
 *  gate the write actions use). Grounds Vera in the Space brand + the fields the author has typed so
 *  far. Never throws: draftListingCopy falls back to a deterministic draft when AI is off/over budget,
 *  and an unauthorized caller gets empty copy (the form leaves its fields untouched). */
export async function draftListingCopyAction(
  slug: string,
  input: { kind: ProductKind; seed?: string | null; priceModel?: ServicePriceModel | null },
): Promise<ListingCopy> {
  const gate = await gateSpaceWrite(slug)
  if (!gate) return { title: '', description: '' }
  const caller = await getCallerProfile()
  const space = await getVisibleSpaceBySlug(slug, caller?.id ?? null)
  return draftListingCopy({
    kind: input.kind,
    seed: input.seed ?? null,
    priceModel: input.priceModel ?? null,
    brandName: space?.brandName ?? space?.name ?? null,
    profileId: caller?.id ?? null,
    spaceId: gate.spaceId,
  })
}

/** Toggle whether a Space listing appears in the global Market (Phase 5, ADR-596). Separate from
 *  status='active' (which only makes it live in the Space's own Shop). Owner-gated to this Space's item. */
export async function setSpaceListingMarketPublishedAction(slug: string, id: string, published: boolean): Promise<void> {
  if (!(await gateSpaceItem(slug, id))) return
  await setProductMarketPublished(id, published)
  revalidatePath(`/spaces/${slug}/settings/shop`)
}

/** Save the Storefront tab settings: the renameable tab label + the published toggle (Phase 6 surfaces
 *  the public tab from this). Stored on the fail-safe preferences.storefront node. */
export async function saveStorefrontSettingsAction(slug: string, formData: FormData): Promise<void> {
  const caller = await getCallerProfile()
  const space = await getVisibleSpaceBySlug(slug, caller?.id ?? null)
  if (!space) return
  const { canManage } = await resolveSpaceManageAccess(space, caller?.id ?? null, caller?.webRole)
  if (!canManage) return
  if (!isConsoleSpaceType(space.type)) return
  const caps = await getSpaceCapabilities(space, caller?.id ?? null)
  if (!spaceFunctionAccess(space, 'shop', caps.role)) return

  const current = readStorefrontConfig(space.preferences)
  const tabLabel = String(formData.get('tabLabel') ?? '').trim().slice(0, 40) || current.tabLabel
  const published = formData.get('published') === 'on'
  const next = withStorefrontConfig(space.preferences, { tabLabel, published })
  const db = createAdminClient() as unknown as {
    from: (t: string) => {
      update: (v: Record<string, unknown>) => { eq: (c: string, val: string) => Promise<{ error: unknown }> }
    }
  }
  await db.from('spaces').update({ preferences: next }).eq('id', space.id)
  revalidatePath(`/spaces/${slug}/settings/shop`)
}
