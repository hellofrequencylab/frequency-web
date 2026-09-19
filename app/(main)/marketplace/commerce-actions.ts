'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { cookies, headers } from 'next/headers'
import { getMyProfileId, getCallerProfile } from '@/lib/auth'
import { rateLimitOk } from '@/lib/rate-limit'
import { createProduct, setProductStatus, deleteProduct, productOwnerProfileId } from '@/lib/commerce/products'
import { createCommerceCheckout, recordCommerceOrderFromSessionId } from '@/lib/commerce/checkout'
import { onPageCheckoutAvailable } from '@/lib/billing/stripe-browser'
import { canListNew } from '@/lib/commerce/selling'
import { normalizeCategory, normalizeTags } from '@/lib/commerce/categories'
import { draftListingCopy, type ListingCopy } from '@/lib/ai/listing-copy'
import { proposeAndConfirmCreate } from '@/lib/ai/vera/create-entity'
import type { ProductKind, ProductStatus } from '@/lib/commerce/types'
import {
  MARKETPLACE_ENTRY_COOKIE,
  entryPointFromStamp,
  verifyStamp,
} from '@/lib/commerce/marketplace-entry'
import { journeySlugForProduct } from '@/lib/commerce/marketplace-entry-server'

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
 *  The DISCOVERY signal is not an argument (LIVE-220, ADR-1419). `proxy.ts` stamps an httpOnly
 *  cookie when the Market or Journey sales page renders; we read that cookie here. `/store/[id]`
 *  is never stamped, so a seller's own link stays `self` at 0% (ADR-811). A crafted call that
 *  omits a client `entryPoint` used to force that 0% default; it cannot, now, if the buyer
 *  actually viewed the listing on a discovery surface. */
export async function startCheckoutAction(
  productId: string,
  variantId?: string | null,
  /** 🔴 Set by a caller whose on-page form already FAILED, to demand a session it can redirect
   *  to. Without it the fallback re-asks for elements, gets another client secret, finds no `url`
   *  and dead-ends the buyer -- the live 2026-09-15 ticket failure. */
  opts?: { forceHosted?: boolean },
): Promise<{ url?: string; clientSecret?: string; sessionId?: string; error?: string; signInRequired?: true }> {
  const buyerProfileId = await getMyProfileId()
  // 🔴 A SIGNED-OUT BUYER GETS A ROUTE, NOT A DEAD STRING. This used to answer `'Sign in to buy.'`
  // and nothing else: the control printed that sentence under itself and the visitor was left to
  // find the sign-in page on their own, then find this product again. That is the wall the events
  // page removed for tickets on exactly the same reasoning (see the signed-out branch of the
  // tickets cascade in app/(main)/events/[slug]/page.tsx) -- on a paid Journey it is the ENTIRE
  // signed-out path, in front of the one thing the page exists to do.
  //
  // The flag rather than a URL, because only the CLIENT knows which page it is on: this action is
  // reached from /market/<id>, /store/<id> and (once the till moves) the Journey itself, and a
  // server action sees no calling path. The control appends its own `?next=`, so the buyer comes
  // back to the page they were reading rather than to a generic listing.
  if (!buyerProfileId) return { error: 'Sign in to buy.', signInRequired: true }
  const stamp = verifyStamp((await cookies()).get(MARKETPLACE_ENTRY_COOKIE)?.value)
  let journeySlug: string | null = null
  if (stamp && !stamp.p.includes(productId) && stamp.j.length > 0) {
    journeySlug = await journeySlugForProduct(productId)
  }
  const r = await createCommerceCheckout({
    buyerProfileId,
    items: [{ productId, variantId: variantId ?? null, qty: 1 }],
    entryPoint: entryPointFromStamp(stamp, productId, journeySlug),
    // Ask for the on-page form only when the browser can actually mount it (LIVE-359).
    ui: opts?.forceHosted ? 'hosted' : onPageCheckoutAvailable() ? 'elements' : 'hosted',
  })
  // `orderId` is for the service-booking caller, not the browser; it is dropped here so a buy
  // control cannot come to depend on an internal row id.
  if (r.error) return { error: r.error }
  // `sessionId` rides ALONGSIDE the secret, never instead of it: it is what lets the control settle
  // the purchase from its own success handler instead of waiting on the webhook. See
  // `settleCommerceOrderAction` below.
  if (r.clientSecret) return { clientSecret: r.clientSecret, sessionId: r.sessionId }
  return { url: r.url }
}

/**
 * Settle a commerce order the moment it is paid ON PAGE, without waiting for the webhook.
 *
 * 🔴 WHY THIS IS NOT OPTIONAL ON A PRICED JOURNEY. The on-page form confirms with
 * `redirect: 'if_required'`, so the common card path never navigates and the success URL carrying
 * `session_id={CHECKOUT_SESSION_ID}` is never visited. Until this existed, the webhook was the only
 * thing that could flip the order to `paid` -- and for a Journey it is also the only thing that
 * calls `enrolByOrder`. A late, retried or misconfigured delivery therefore meant a buyer who had
 * paid $444 and had no access, behind a panel that had already told them they were in.
 *
 * The webhook remains the GUARANTEE; this is the fast path that makes the guarantee usually
 * unnecessary. Both are safe to run: `recordCommerceOrderFromSession` updates
 * `where status = 'pending'`, so whichever arrives second flips nothing and fulfils nothing.
 */
// authz-ok: STRIPE IS THE AUTHORITY, and a session-holder gate would add nothing.
// `recordCommerceOrderFromSessionId` re-fetches the session FROM STRIPE and refuses anything that
// is not `metadata.kind === 'commerce_order'` AND `payment_status === 'paid'`, so the most a caller
// can do with an id that is not theirs is settle a purchase that genuinely happened -- precisely
// what the webhook does, unprompted, seconds later. Nothing is read back but a boolean, and the
// per-IP limiter is what stops that boolean being used to enumerate session ids.
export async function settleCommerceOrderAction(sessionId: string): Promise<{ settled: boolean }> {
  if (!sessionId || !sessionId.startsWith('cs_')) return { settled: false }
  const ip = (await headers()).get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  // ⚠️ `whenUnconfigured: 'allow'`, matching `settleTicketAction`, and for the same reason: this
  // runs AFTER a successful charge. Denying it protects nothing (the webhook settles the same
  // session regardless) and only deletes the fast path, silently, wherever the limiter is unwired.
  // A door that takes money fails closed; a reconcile that runs behind one fails open.
  if (!(await rateLimitOk('settle_commerce_order', ip, 30, '1 m', { whenUnconfigured: 'allow' }))) {
    return { settled: false }
  }
  try {
    return { settled: await recordCommerceOrderFromSessionId(sessionId) }
  } catch (e) {
    // NEVER fatal to the buyer. They paid; the webhook still owes them the order, and a thrown
    // reconcile must not turn a successful payment into an error screen. Loud, because a swallowed
    // failure here is the invisible regression AGENTS.md names.
    console.error('[commerce] on-page settle failed; the webhook is now the only path', e)
    return { settled: false }
  }
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
