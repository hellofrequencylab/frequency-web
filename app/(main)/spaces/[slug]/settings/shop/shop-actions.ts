'use server'

import { revalidatePath } from 'next/cache'
import { getCallerProfile } from '@/lib/auth'
import { getVisibleSpaceBySlug, patchSpacePreferences } from '@/lib/spaces/store'
import { preferencesPatch } from '@/lib/spaces/preferences-patch'
import { resolveSpaceManageAccess, getSpaceCapabilities } from '@/lib/spaces/entitlements'
import { spaceFunctionAccess } from '@/lib/spaces/functions'
import { isConsoleSpaceType } from '@/lib/spaces/types'
import {
  createProduct,
  setProductStatus,
  deleteProduct,
  updateProduct,
  duplicateProduct,
  productOwnerSpaceId,
  setProductMarketPublished,
  listSpaceCatalog,
  type ProductPatch,
} from '@/lib/commerce/products'
import { cartEnabled } from '@/lib/commerce/cart-flag'
import { saveSpaceShippingProfile } from '@/lib/commerce/shipping-profiles-store'
import { upsertVariants } from '@/lib/commerce/variants'
import { setOrderFulfillment } from '@/lib/commerce/fulfilment'
import { refundSpaceSale, type RefundableSaleKind } from '@/lib/commerce/space-refunds'
import { normalizeCategory, normalizeTags } from '@/lib/commerce/categories'
import { readStorefrontConfig, withStorefrontConfig } from '@/lib/spaces/storefront'
import { draftListingCopy, type ListingCopy } from '@/lib/ai/listing-copy'
import { safeWritingQuestions } from '@/lib/ai/writing-coach'
import { proposeAndConfirmCreate } from '@/lib/ai/vera/create-entity'
import { checkSpaceShopMeter } from '@/lib/spaces/counted-meters'
import type {
  ProductStatus,
  ProductKind,
  CommerceVertical,
  ProductCondition,
  ServiceConfig,
  ServicePriceModel,
  VariantInput,
  FulfillmentStatus,
} from '@/lib/commerce/types'

// Space Shop console write actions (ADR-596). Every action gates on resolveSpaceManageAccess (owner /
// admin / editor — NOT the profile-only productOwnerProfileId, which is null for a Space), and each
// per-item action also checks productOwnerSpaceId === space.id so one Space can never touch another's
// catalog. Reuses the existing commerce writers (createProduct / updateProduct / setProductStatus /
// deleteProduct); no checkout change is needed. Billing stays gated OFF, so nothing charges.

/** Resolve the Space + assert the caller may manage it (write authority). Returns the space id, or null
 *  when the caller is not an editor (a staff preview is read-only, so it cannot write). */
async function gateSpaceWrite(slug: string): Promise<{ spaceId: string; role: string | null } | null> {
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
  return { spaceId: space.id, role: caps.role ?? null }
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
  // Shop listings per Space (space_shop_listings, LIVE-750). This action reports nothing back, so a
  // full shop simply does not add; the plan hub shows the count.
  if (!(await checkSpaceShopMeter(gate.spaceId)).ok) return

  const kind = String(formData.get('kind') ?? 'product')
  const { productKind, vertical } = kindToCommerce(kind)
  const service = productKind === 'service' ? serviceConfigFromForm(formData) : null
  // Condition applies to a product only (R3); a service/ticket carries none.
  const condition = productKind === 'physical' ? asCondition(formData.get('condition')) : null

  const description = (formData.get('description') as string) || null
  const category = normalizeCategory(formData.get('category') as string | null)
  const images = parseStringArray(formData.get('images'))
  const tags = normalizeTags(parseStringArray(formData.get('tags')))
  const priceCents = Math.round(priceDollars * 100)
  // Market opt-in from the editor: list it in the global Market, or keep it to this Space's page only.
  const marketPublished = formData.get('marketPublished') === '1'

  // THE GOVERNED WRITE (ADR-988, ADR-1249): the team filled the item and tapped Save, so one call
  // proposes, claims and commits through the same writer, and the audit row is written. This is
  // the one road that makes a service, so the entity follows the kind; both gates are scoped to
  // the Space's role ladder (gateSpaceWrite above), which the layer records and leaves here.
  const governed = await proposeAndConfirmCreate({
    entity: productKind === 'service' ? 'service' : 'product',
    draft: {
      title,
      productKind,
      description: description ?? '',
      category: category ?? '',
      images,
      tags,
      priceCents,
      marketPublished,
      ...(productKind === 'service' ? { bookingSpaceId: gate.spaceId } : {}),
    },
    spaceId: gate.spaceId,
    rationale: 'Space Shop catalog: the team filled the item and tapped Save.',
    commit: async () => {
      const created = await createProduct({
        ownerKind: 'space',
        ownerSpaceId: gate.spaceId,
        // MUST pass both explicitly — createProduct defaults product_kind='physical' and vertical='maker'.
        productKind,
        vertical,
        title,
        description,
        category,
        images,
        tags,
        priceCents,
        condition,
        // A service books against the Space's own availability calendar (Phase 4, ADR-596).
        bookingSpaceId: productKind === 'service' ? gate.spaceId : undefined,
        // The full quote + policy (price model, duration, deposit, cancellation, no-show) in one write.
        service,
        marketPublished,
      })
      if (!created) throw new Error('Could not add that item.')
      return created
    },
  })
  if ('error' in governed) return
  const product = governed.data

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

/** Fresh Space manager gate precedes context reads. Only questions cross back to the form. */
export async function draftListingCopyAction(
  slug: string,
  input: { kind: ProductKind; seed?: string | null; priceModel?: ServicePriceModel | null },
): Promise<ListingCopy> {
  const gate = await gateSpaceWrite(slug)
  if (!gate) return { title: '', description: '' }
  const caller = await getCallerProfile()
  const space = await getVisibleSpaceBySlug(slug, caller?.id ?? null)
  const advice = await draftListingCopy({
    kind: input.kind,
    seed: input.seed ?? null,
    priceModel: input.priceModel ?? null,
    brandName: space?.brandName ?? space?.name ?? null,
    profileId: caller?.id ?? null,
    spaceId: gate.spaceId,
  })
  return { title: '', description: '', questions: safeWritingQuestions(advice) }
}

/** Toggle whether a Space listing appears in the global Market (Phase 5, ADR-596). Separate from
 *  status='active' (which only makes it live in the Space's own Shop). Owner-gated to this Space's item. */
export async function setSpaceListingMarketPublishedAction(slug: string, id: string, published: boolean): Promise<void> {
  if (!(await gateSpaceItem(slug, id))) return
  await setProductMarketPublished(id, published)
  revalidatePath(`/spaces/${slug}/settings/shop`)
}

/** Move one of this Space's orders along the fulfilment ladder (LIVE-606, ADR-1575): shipped with a
 *  carrier and tracking number, then delivered, then complete. Gated like every other Shop write
 *  (gateSpaceWrite), and the writer binds the update to owner_space_id, so an order id from another
 *  Space finds nothing. A refusal (a step back, a race, an unpaid order) is logged with the writer's
 *  sentence and the page re-renders where the order actually stands. */
export async function setOrderFulfillmentAction(
  slug: string,
  orderId: string,
  status: FulfillmentStatus,
  formData: FormData,
): Promise<void> {
  const gate = await gateSpaceWrite(slug)
  if (!gate) return
  const result = await setOrderFulfillment(
    orderId,
    {
      status,
      carrier: String(formData.get('carrier') ?? ''),
      tracking: String(formData.get('tracking') ?? ''),
    },
    { kind: 'space', spaceId: gate.spaceId },
  )
  if (!result.ok) console.warn('[shop] fulfilment refused', { slug, orderId, status, reason: result.error })
  revalidatePath(`/spaces/${slug}/settings/shop`)
  revalidatePath('/orders')
}

/**
 * Refund one of this Space's sales from the Orders tab (LIVE-2550): a shop order, a ticket or a
 * donation, in full. Real money, so the gate is tighter than the rest of the Shop: the owner or a
 * Space admin only (an editor can list and fulfil, not send money back). refundSpaceSale pins the
 * sale to this Space before anything moves.
 */
export async function refundSpaceSaleAction(
  slug: string,
  kind: RefundableSaleKind,
  id: string,
): Promise<{ ok: true } | { error: string }> {
  const gate = await gateSpaceWrite(slug)
  if (!gate) return { error: 'You can’t refund sales for this Space.' }
  if (gate.role !== 'admin') return { error: 'Only the owner or an admin can refund a sale.' }
  if (kind !== 'order' && kind !== 'ticket' && kind !== 'donation') return { error: 'That sale can’t be refunded here.' }
  const result = await refundSpaceSale(gate.spaceId, kind, id)
  revalidatePath(`/spaces/${slug}/settings/shop`)
  revalidatePath('/orders')
  return result
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
  // The banner image URL + focal point ride in from the client field. withStorefrontConfig re-sanitizes
  // both (http(s)-only URL, "x% y%" focus), so a bad value falls back to null / centered rather than
  // storing junk. An empty string clears the banner.
  const rawBanner = String(formData.get('bannerUrl') ?? '').trim()
  const bannerUrl = rawBanner === '' ? null : rawBanner
  const bannerFocus = String(formData.get('bannerFocus') ?? '').trim() || current.bannerFocus
  // KEY-SCOPED write (LIVE-2348): only the top-level keys withStorefrontConfig changed (the storefront
  // node) go through patchSpacePreferences (set_space_preferences), so a save here never writes back a
  // stale copy of a key another console saved after this request read the Space.
  const next = withStorefrontConfig(space.preferences, { tabLabel, published, bannerUrl, bannerFocus })
  const before =
    space.preferences && typeof space.preferences === 'object' && !Array.isArray(space.preferences)
      ? (space.preferences as Record<string, unknown>)
      : {}
  const patch = preferencesPatch(before, next)
  if (Object.keys(patch).length > 0) await patchSpacePreferences(space.id, patch)
  revalidatePath(`/spaces/${slug}/settings/shop`)
  revalidatePath(`/spaces/${slug}/shop`)
}

/** A whole number of processing days from the form, 0 to 60, or the fallback. */
function processingDays(raw: FormDataEntryValue | null, fallback: number): number {
  const n = Number(raw)
  return raw !== null && String(raw).trim() !== '' && Number.isFinite(n) ? Math.min(60, Math.max(0, Math.round(n))) : fallback
}

/** Dollars typed in the form to whole cents, or null for a blank or bad value. */
function dollarsToCents(raw: FormDataEntryValue | undefined): number | null {
  const s = String(raw ?? '').trim()
  if (!s) return null
  const n = Number(s)
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null
}

/**
 * Create (profileId null) or edit one of this Space's shipping profiles (DEF-ETSY P3) and choose which of its
 * physical listings ship with it. Dark until COMMERCE_CART_ENABLED is set, like the cart that reads it, and
 * gated like every Shop write (gateSpaceWrite). The rates arrive as parallel rows (region, first item, each
 * extra item) and are re-parsed by the store; the listing ids are narrowed to this Space's own physical items
 * here, and the store scopes every write to the Space again.
 */
export async function saveShippingProfileAction(slug: string, profileId: string | null, formData: FormData): Promise<void> {
  if (!cartEnabled()) return
  const gate = await gateSpaceWrite(slug)
  if (!gate) return
  const name = String(formData.get('name') ?? '').trim().slice(0, 80)
  if (!name) return
  const min = processingDays(formData.get('processingDaysMin'), 1)
  const max = Math.max(min, processingDays(formData.get('processingDaysMax'), 3))
  const regions = formData.getAll('rateRegion')
  const firsts = formData.getAll('rateFirst')
  const extras = formData.getAll('rateAdditional')
  const rates = regions.flatMap((region, i) => {
    const firstCents = dollarsToCents(firsts[i])
    return firstCents == null ? [] : [{ region: String(region), firstCents, additionalCents: dollarsToCents(extras[i]) ?? 0 }]
  })
  const own = new Set((await listSpaceCatalog(gate.spaceId)).filter((p) => p.productKind === 'physical').map((p) => p.id))
  const productIds = formData.getAll('productIds').map(String).filter((id) => own.has(id))
  await saveSpaceShippingProfile(
    gate.spaceId,
    profileId,
    { name, processingDaysMin: min, processingDaysMax: max, rates },
    productIds,
  )
  revalidatePath(`/spaces/${slug}/settings/shop`)
}
