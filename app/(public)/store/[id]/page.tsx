import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getProduct } from '@/lib/commerce/products'
import { getProductReviews } from '@/lib/commerce/reviews'
import { resolveDetailHero } from '@/lib/layout/detail-hero'
import { JsonLd } from '@/components/json-ld'
import { productSchema } from '@/lib/jsonld'
import { OG_SITE, SITE_NAME } from '@/lib/site'
import { BuyButton } from '@/app/(main)/marketplace/buy-button'
import { FqStoreProduct } from '@/components/frequency/members/marketplace/store-product'

// Public Product JSON-LD page, advertised in app/sitemap.ts. force-dynamic here would keep the
// crawler on a full render after the (main) public chrome stops reading auth (SCAN-641). Viewer
// state lives on BuyButton (client). ISR window matches /discover.
export const revalidate = 3600

// ISR on a dynamic segment needs this (Next 16, generate-static-params.md: "you must return an
// empty array from generateStaticParams ... in order to revalidate (ISR) paths at runtime").
// Without it the route rendered per request with a private, no-store cache-control even though
// `revalidate` was set; /events/<slug> cached only because it already had one (LIVE-884). An empty
// list prerenders nothing at build: each path is generated on its first visit and cached.
export async function generateStaticParams(): Promise<{ id: string }[]> {
  return []
}

function usd(cents: number, currency = 'usd') {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency.toUpperCase() }).format(cents / 100)
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<Metadata> {
  const { id } = await params
  const product = await getProduct(id)
  // Only the publicly rendered path (platform-owned, active) gets indexable metadata; anything
  // else the page body 404s, so keep its head minimal and out of the index.
  if (!product || product.ownerKind !== 'platform' || product.status !== 'active') {
    return { title: 'Product not found', robots: { index: false, follow: false } }
  }
  const full =
    product.description ?? `${product.title}: a piece from the ${SITE_NAME} Store.`
  const description = full.length > 155 ? `${full.slice(0, 152).trimEnd()}…` : full
  const ogTitle = `${product.title} · ${SITE_NAME} Store`
  return {
    title: product.title,
    description,
    alternates: { canonical: `/store/${id}` },
    openGraph: {
      ...OG_SITE,
      title: ogTitle,
      description,
      type: 'website',
      url: `/store/${id}`,
    },
    twitter: {
      card: 'summary_large_image',
      title: ogTitle,
      description,
    },
  }
}

export default async function ShopProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const product = await getProduct(id)
  if (!product || product.ownerKind !== 'platform' || product.status !== 'active') notFound()
  const soldOut = product.stock === 0

  // Store products are commerce_products under the same review model as Market, so the Store's Product
  // JSON-LD gets rating parity: the visible-review aggregate feeds AggregateRating and a handful of
  // Review nodes. Gated downstream on reviewCount > 0, so an unreviewed item carries no rating node.
  // Reviews + the standard entity cover (PROG-P5, ADR-1136) in one batch. Product photos stay in
  // the gallery below — a square product shot is not a 16:6 cover — so the ladder here is the
  // operator's /store Settings image or nothing.
  const [reviews, hero] = await Promise.all([
    getProductReviews(product.id),
    resolveDetailHero(`/store/${id}`),
  ])

  const structuredData = (
    <JsonLd
      data={productSchema({
        title: product.title,
        description: product.description,
        image: product.images[0] ?? null,
        priceCents: product.priceCents,
        currency: product.currency,
        inStock: !soldOut,
        sellerName: SITE_NAME,
        path: `/store/${product.id}`,
        aggregateRating:
          reviews.average != null && reviews.count > 0
            ? { ratingValue: reviews.average, reviewCount: reviews.count }
            : null,
        reviews: reviews.latest.map((r) => ({
          author: r.author?.displayName ?? null,
          rating: r.rating,
          body: r.body,
          datePublished: r.createdAt,
        })),
      })}
    />
  )
  return (
    <FqStoreProduct
      structuredData={structuredData}
      title={product.title}
      priceLabel={usd(product.priceCents, product.currency)}
      category={product.category ?? null}
      description={product.description ?? null}
      images={product.images}
      coverUrl={product.images[0] ?? (typeof hero.coverImage === 'string' ? hero.coverImage : null)}
      soldOut={soldOut}
      // 🔴 NEVER STAMPED, exactly as the DAWN panel below: /store/<id> is the seller's own storefront.
      buy={soldOut ? null : <BuyButton productId={product.id} />}
    />
  )
}
