'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { getMyProfileId, getCallerProfile } from '@/lib/auth'
import { createProduct, setProductStatus, deleteProduct, productOwnerProfileId } from '@/lib/commerce/products'
import { createCommerceCheckout } from '@/lib/commerce/checkout'
import { canListNew } from '@/lib/commerce/selling'
import { normalizeCategory, normalizeTags } from '@/lib/commerce/categories'
import { draftListingCopy, type ListingCopy } from '@/lib/ai/listing-copy'
import { proposeAndConfirmCreate } from '@/lib/ai/vera/create-entity'
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

  const description = (formData.get('description') as string) || null
  const category = normalizeCategory(formData.get('category') as string | null)
  // Ordered storage paths from the gallery uploader (cap enforced in createProduct).
  const images = parseStringArray(formData.get('images'))
  const tags = normalizeTags(parseStringArray(formData.get('tags')))
  const priceCents = Math.round(priceDollars * 100)

  // THE GOVERNED WRITE (ADR-988, ADR-1249): the maker filled the listing and tapped List it, so
  // one call proposes, claims and commits through the same writer, and the audit row is written.
  // The seller gate is scoped (signed in is the whole of it, ADR-914), which the layer records
  // and leaves here. A refusal ends the action exactly as a failed write always did.
  const governed = await proposeAndConfirmCreate({
    entity: 'product',
    draft: { title, productKind, description: description ?? '', category: category ?? '', images, tags, priceCents, marketPublished: true },
    rationale: 'Market sell page: the maker filled the listing and tapped List it.',
    commit: async () => {
      const created = await createProduct({
        ownerKind: 'profile',
        ownerProfileId: profileId,
        productKind,
        vertical: 'maker',
        title,
        description,
        category,
        images,
        tags,
        priceCents,
        // Individuals list used items (R3); New is a Business feature, rejected above. A download has no
        // condition at all, so it stores null rather than claiming to be second hand.
        condition: productKind === 'digital' ? null : 'used',
        // A member product IS a Market listing (the maker path implicitly opts into the umbrella, ADR-596).
        marketPublished: true,
      })
      if (!created) throw new Error('Could not list that product.')
      return created
    },
  })
  if ('error' in governed) return
  const product = governed.data

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
 *  URL, or a friendly error (payments off / seller not payout-ready). The BuyButton navigates.
 *
 *  `entryPoint` is the DISCOVERY signal (LIVE-219). Only the Market — the browse surface where
 *  Frequency made the introduction — passes it; `/store/[id]` is the seller's own storefront link and
 *  deliberately passes nothing, so it keeps the default `self` classification and its 0% fee. Without
 *  this argument every cold Buy-button sale classified `self` and took a 0% platform fee (ADR-811 §A).
 *
 *  ⚠️ NARROWED HERE RATHER THAN PASSED THROUGH, because this is a SERVER ACTION and every argument is
 *  client-supplied. Accepting the caller's string verbatim would let a crafted call name any entry
 *  point; the literal check means a client can only choose between 'marketplace' (which RAISES the
 *  platform's cut) and nothing. Nothing is exactly what every client can already send today, so this
 *  cannot classify an order lower than the status quo — it can only fail to raise it. Deriving the
 *  surface server-side is not available: a server action sees no calling path, and `referer` is
 *  client-controlled too. A tamper-proof signal needs the entry point recorded at page render. */
export async function startCheckoutAction(
  productId: string,
  variantId?: string | null,
  entryPoint?: 'marketplace' | null,
): Promise<{ url?: string; error?: string }> {
  const buyerProfileId = await getMyProfileId()
  if (!buyerProfileId) return { error: 'Sign in to buy.' }
  return createCommerceCheckout({
    buyerProfileId,
    items: [{ productId, variantId: variantId ?? null, qty: 1 }],
    entryPoint: entryPoint === 'marketplace' ? 'marketplace' : null,
  })
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
