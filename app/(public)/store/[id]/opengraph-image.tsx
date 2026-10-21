import { getProduct } from '@/lib/commerce/products'
import { listingCardResponse } from '@/lib/og/listing-card'
import { OG_CONTENT_TYPE } from '@/lib/og/content-type'
import { SITE_NAME } from '@/lib/site'

export const runtime = 'nodejs'
export const alt = `A listing on ${SITE_NAME}`
export const size = { width: 1200, height: 630 }
export const contentType = OG_CONTENT_TYPE

// Share card for /store/<id>. Only an active platform product is drawn, the same gate the page applies.
export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const product = await getProduct(id).catch(() => null)
  if (!product || product.ownerKind !== 'platform' || product.status !== 'active') {
    return listingCardResponse('Store', null)
  }
  const price =
    product.priceCents > 0
      ? new Intl.NumberFormat('en-US', { style: 'currency', currency: (product.currency ?? 'usd').toUpperCase() }).format(
          product.priceCents / 100,
        )
      : 'Free'
  return listingCardResponse('Store', {
    title: product.title,
    price,
    facts: [product.category],
    blurb: product.description,
    image: product.images[0] ?? null,
  })
}
