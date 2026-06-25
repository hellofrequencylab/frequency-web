'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { getMyProfileId } from '@/lib/auth'
import { createProduct, setProductStatus, deleteProduct, productOwnerProfileId } from '@/lib/commerce/products'
import { createCommerceCheckout } from '@/lib/commerce/checkout'
import type { ProductStatus } from '@/lib/commerce/types'

// Commerce actions (Makers + Shop, ADR-39X). Selling = createProduct on the commerce
// core (owner_kind='profile' for a maker); buying = createCommerceCheckout, which mirrors
// tips/tickets (destination charge + application fee) and FAIL-SAFEs to a friendly
// "payments aren't on yet" while billing is disabled — never a half-charge.

export async function createMakerProductAction(formData: FormData): Promise<void> {
  const profileId = await getMyProfileId()
  if (!profileId) redirect('/sign-in?next=/marketplace/makers/sell')

  const title = String(formData.get('title') ?? '').trim()
  const priceDollars = Number(formData.get('price'))
  if (!title || !Number.isFinite(priceDollars) || priceDollars < 0) return

  const product = await createProduct({
    ownerKind: 'profile',
    ownerProfileId: profileId,
    vertical: 'maker',
    title,
    description: (formData.get('description') as string) || null,
    category: (formData.get('category') as string) || null,
    priceCents: Math.round(priceDollars * 100),
  })
  if (!product) return

  // A maker listing their piece means it is live to browse immediately. Payouts still
  // require a Connect account + billing enabled before a buyer can actually check out.
  await setProductStatus(product.id, 'active')
  revalidatePath('/marketplace/makers')
  redirect(`/marketplace/makers/${product.id}`)
}

/** Start a one-item checkout for a product. Returns the Stripe Checkout URL, or a
 *  friendly error (payments off / seller not payout-ready). The BuyButton navigates. */
export async function startCheckoutAction(productId: string): Promise<{ url?: string; error?: string }> {
  const buyerProfileId = await getMyProfileId()
  if (!buyerProfileId) return { error: 'Sign in to buy.' }
  return createCommerceCheckout({ buyerProfileId, items: [{ productId, qty: 1 }] })
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
  revalidatePath('/marketplace/makers/manage')
  revalidatePath('/marketplace/makers')
  revalidatePath(`/marketplace/makers/${id}`)
}

/** Delete one of MY products. */
export async function deleteMyProductAction(id: string): Promise<void> {
  if (!(await ownsProduct(id))) return
  await deleteProduct(id)
  revalidatePath('/marketplace/makers/manage')
  revalidatePath('/marketplace/makers')
}
