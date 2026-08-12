'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { getMyProfileId, getCallerProfile } from '@/lib/auth'
import { isPaid } from '@/lib/core/entitlement'
import { createProduct, setProductStatus, deleteProduct, productOwnerProfileId } from '@/lib/commerce/products'
import { createCommerceCheckout } from '@/lib/commerce/checkout'
import { canListNew } from '@/lib/commerce/selling'
import { normalizeCategory, normalizeTags } from '@/lib/commerce/categories'
import type { ProductStatus } from '@/lib/commerce/types'

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
  // Selling in the Market is a paid-member feature (ADR-596); free members trade in Classifieds.
  // Server-side gate mirrors the page gate (defense in depth), on the REAL tier (never beta-overridden)
  // per the creation-gate convention (auth.ts, ADR-414) — a genuinely free member is sent to upgrade.
  if (!isPaid(profile.realMembershipTier)) redirect('/upgrade')
  const profileId = profile.id

  const title = String(formData.get('title') ?? '').trim()
  const priceDollars = Number(formData.get('price'))
  if (!title || !Number.isFinite(priceDollars) || priceDollars < 0) return

  // R3 (Phase 0), fail-closed: an individual ('profile') may list USED only. Listing New is a Business
  // feature, so a 'new' submission is rejected (the form disables it) and sent to the Business path;
  // everything an individual lists stores as 'used'. canListNew is the single source of truth.
  if (String(formData.get('condition') ?? 'used') === 'new' && !canListNew('profile')) redirect('/spaces/new')

  const product = await createProduct({
    ownerKind: 'profile',
    ownerProfileId: profileId,
    vertical: 'maker',
    title,
    description: (formData.get('description') as string) || null,
    category: normalizeCategory(formData.get('category') as string | null),
    // Ordered storage paths from the gallery uploader (cap enforced in createProduct).
    images: parseStringArray(formData.get('images')),
    tags: normalizeTags(parseStringArray(formData.get('tags'))),
    priceCents: Math.round(priceDollars * 100),
    // Individuals list used items (R3); New is a Business feature, rejected above.
    condition: 'used',
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
