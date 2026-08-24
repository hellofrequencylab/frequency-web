'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { getMyProfileId, getCallerProfile } from '@/lib/auth'
import { createProduct, setProductStatus, deleteProduct, productOwnerProfileId } from '@/lib/commerce/products'
import { createCommerceCheckout } from '@/lib/commerce/checkout'
import { canListNew } from '@/lib/commerce/selling'
import { normalizeCategory, normalizeTags } from '@/lib/commerce/categories'
import { draftListingCopy, type ListingCopy } from '@/lib/ai/listing-copy'
import type { ProductKind, ProductStatus } from '@/lib/commerce/types'

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

// Commerce actions (Makers + Shop, ADR-39X). Selling = createProduct on the commerce
// core (owner_kind='profile' for a maker); buying = createCommerceCheckout, which mirrors
// tips/tickets (destination charge + application fee) and FAIL-SAFEs to a friendly
// "payments aren't on yet" while billing is disabled — never a half-charge.

export async function createMakerProductAction(formData: FormData): Promise<void> {
  const profile = await getCallerProfile()
  if (!profile) redirect('/sign-in?next=/market/sell')
  // 🔴 SIGNED IN IS THE WHOLE GATE. Listing in the Market is open on the free tier (ADR-914, owner
  // ruling 2026-08-24): never gate the transaction, gate the repeat. A `redirect('/upgrade')` used to
  // stand on this line and must not come back — the ladder is the RATE the sale settles at (free
  // Member 10%, Crew 8%, own audience 0%), resolved from the payee's real tier at checkout by
  // `memberNetworkTakeRateBps`, not a permission to list at all. Locked by ./free-seller.test.ts.
  const profileId = profile.id

  const title = String(formData.get('title') ?? '').trim()
  const priceDollars = Number(formData.get('price'))
  if (!title || !Number.isFinite(priceDollars) || priceDollars < 0) return

  // R3 (Phase 0), fail-closed: an individual ('profile') may list USED only. Listing New is a Business
  // feature, so a 'new' submission is rejected (the form disables it) and sent to the Business path;
  // everything an individual lists stores as 'used'. canListNew is the single source of truth.
  if (String(formData.get('condition') ?? 'used') === 'new' && !canListNew('profile')) redirect('/spaces/new')

  // What kind of thing it is, per the Product manifest's two options (lib/studio/entities/product.ts):
  // something you ship, or something they download. Default-deny to 'physical', which is what
  // createProduct assumed before the Spark could ask. Both land in the Market's `products` group
  // (marketGroupForKind), so this changes what the row SAYS it is, not where it shows.
  const productKind: ProductKind = formData.get('productKind') === 'digital' ? 'digital' : 'physical'

  const product = await createProduct({
    ownerKind: 'profile',
    ownerProfileId: profileId,
    productKind,
    vertical: 'maker',
    title,
    description: (formData.get('description') as string) || null,
    category: normalizeCategory(formData.get('category') as string | null),
    // Ordered storage paths from the gallery uploader (cap enforced in createProduct).
    images: parseStringArray(formData.get('images')),
    tags: normalizeTags(parseStringArray(formData.get('tags'))),
    priceCents: Math.round(priceDollars * 100),
    // Individuals list used items (R3); New is a Business feature, rejected above. A download has no
    // condition at all, so it stores null rather than claiming to be second hand.
    condition: productKind === 'digital' ? null : 'used',
    // A member product IS a Market listing (the maker path implicitly opts into the umbrella, ADR-596).
    marketPublished: true,
  })
  if (!product) return

  // A maker listing their piece means it is live to browse immediately. Payouts still
  // require a Connect account + billing enabled before a buyer can actually check out.
  await setProductStatus(product.id, 'active')
  revalidatePath('/market')
  redirect(`/market/${product.id}`)
}

/**
 * Draft the name + details for a member's product with Vera (the Spark's first door, ADR-986). The
 * member-side twin of the Space console's `draftListingCopyAction`: same generator, same voice primer,
 * same usage ledger, and the same shape of gate — the Space twin asks "may you write in this Space",
 * so the member twin asks "are you signed in", which is the whole permission to list (ADR-914).
 *
 * 🔴 This used to demand a PAID tier, for one stated reason: it mirrored the paid gate on creating the
 * product. That gate is gone, so mirroring it would leave a Vera door that silently does nothing for
 * the member who may list. Vera's own spend limit is unchanged and lives where it belongs — the
 * per-feature daily cap inside `draftListingCopy` — and the `vera_unlimited` Crew gate (the repeat)
 * still meters Vera chat. Locked by ./free-seller.test.ts.
 *
 * NEVER throws and never blocks: draftListingCopy falls back to a deterministic draft when Vera is off
 * or over budget, and a signed-out caller gets empty copy (the Spark then leaves its fields alone).
 */
export async function draftMakerProductCopyAction(input: {
  productKind?: ProductKind | null
  seed?: string | null
}): Promise<ListingCopy> {
  const profile = await getCallerProfile()
  if (!profile) return { title: '', description: '' }
  return draftListingCopy({
    kind: input.productKind === 'digital' ? 'digital' : 'physical',
    seed: input.seed ?? null,
    profileId: profile.id,
  })
}

/** Start a one-item checkout for a product (optionally a specific variant). Returns the Stripe Checkout
 *  URL, or a friendly error (payments off / seller not payout-ready). The BuyButton navigates. */
export async function startCheckoutAction(
  productId: string,
  variantId?: string | null,
): Promise<{ url?: string; error?: string }> {
  const buyerProfileId = await getMyProfileId()
  if (!buyerProfileId) return { error: 'Sign in to buy.' }
  return createCommerceCheckout({ buyerProfileId, items: [{ productId, variantId: variantId ?? null, qty: 1 }] })
}

// ── Seller (maker) storefront management — owner-gated ────────────────────────────
async function ownsProduct(id: string): Promise<boolean> {
  const profileId = await getMyProfileId()
  if (!profileId) return false
  return (await productOwnerProfileId(id)) === profileId
}

/** Publish / unpublish / mark sold-out / archive one of MY products. */
export async function setMyProductStatusAction(id: string, status: ProductStatus): Promise<void> {
  if (!(await ownsProduct(id))) return
  await setProductStatus(id, status)
  revalidatePath('/market/manage')
  revalidatePath('/market')
  revalidatePath(`/market/${id}`)
}

/** Delete one of MY products. */
export async function deleteMyProductAction(id: string): Promise<void> {
  if (!(await ownsProduct(id))) return
  await deleteProduct(id)
  revalidatePath('/market/manage')
  revalidatePath('/market')
}
