// SEO / AIO for the STANDARDIZED marketplace listing detail page. One place derives both the
// document <head> (listingMetadata) and the Schema.org graph (listingJsonLd) from the shared
// ListingDetailView, so Classifieds, Market, and Housing describe themselves identically to search
// engines and answer engines. No vertical hand-rolls its own metadata block.
//
// Privacy + honesty contract (mirrors the events detail page, ADR-186 / SEO-AEO-PLAN):
//   - A non-active listing (sold / closed / draft) gets a noindexed head so a de-listed item never
//     lingers as a rich result, and the body already 404s it for non-owners.
//   - Location is coarse (neighborhood/city text only, whatever the card already shows) — never a
//     street address or coordinates.
//   - Voice canon: no em or en dashes in any surfaced string.

import type { Metadata } from 'next'
import { SITE_NAME, SITE_URL } from '@/lib/site'
import { breadcrumbSchema, aggregateRatingNode, productReviewNodes } from '@/lib/jsonld'
import type { ListingDetailView } from '@/lib/listings-shared/detail-view'

/** Canonical app path for a listing, keyed off its vertical. The one source both the metadata
 *  canonical and the JSON-LD `url` read, so they never drift. */
export function listingCanonicalPath(view: Pick<ListingDetailView, 'vertical' | 'id'>): string {
  switch (view.vertical) {
    case 'classifieds':
      return `/classifieds/${view.id}`
    case 'market':
      return `/market/${view.id}`
    case 'housing':
      return `/marketplace/housing/${view.id}`
  }
}

const VERTICAL_LABEL: Record<ListingDetailView['vertical'], string> = {
  classifieds: 'Classifieds',
  market: 'Market',
  housing: 'Housing',
}

/** Trim a blob to a search-snippet-friendly length (~155 chars), ellipsized. */
function snippet(text: string, max = 155): string {
  const clean = text.replace(/\s+/g, ' ').trim()
  return clean.length > max ? `${clean.slice(0, max - 3).trimEnd()}...` : clean
}

/** Best-effort numeric price (in cents) parsed from a free-text price label like
 *  "$299, open to reasonable offers" or "$2,400/mo". Returns null when no leading dollar amount is
 *  present (e.g. "Free", "Make an offer"), in which case the Offer node is omitted rather than faked. */
function priceCentsFromLabel(label: string | null): number | null {
  if (!label) return null
  const m = label.match(/\$\s*([\d,]+(?:\.\d{1,2})?)/)
  if (!m) return null
  const value = Number(m[1].replace(/,/g, ''))
  return Number.isFinite(value) ? Math.round(value * 100) : null
}

/** The meta description: the listing's own words, else a plain fallback built from what we know. */
function metaDescription(view: ListingDetailView): string {
  if (view.description?.trim()) return snippet(view.description)
  const bits = [view.title, view.priceLabel, view.locationLabel].filter(Boolean).join('. ')
  return snippet(bits || `${view.title} on ${SITE_NAME}.`)
}

/**
 * The document head for a listing detail page. Call from each vertical's generateMetadata after it
 * has built the view. A non-active listing is noindexed (see the privacy contract above).
 */
export function listingMetadata(view: ListingDetailView): Metadata {
  const path = listingCanonicalPath(view)
  const description = metaDescription(view)
  const ogTitle = `${view.title} · ${SITE_NAME}`
  const image = view.primaryImage ?? undefined

  // Sold / closed / draft: reachable by direct link but out of the index (thin, stale, or gated).
  const noindex = view.status != null

  return {
    title: view.title,
    description,
    ...(noindex ? { robots: { index: false, follow: true } } : {}),
    alternates: { canonical: path },
    openGraph: {
      title: ogTitle,
      description,
      type: 'website',
      url: path,
      ...(image ? { images: [{ url: image }] } : {}),
    },
    twitter: {
      card: 'summary_large_image',
      title: ogTitle,
      description,
      ...(image ? { images: [image] } : {}),
    },
  }
}

const abs = (path: string) => (/^https?:\/\//i.test(path) ? path : `${SITE_URL}${path}`)

/**
 * The Schema.org graph for a listing detail page: a Product/Offer (Housing renders as Accommodation)
 * plus a breadcrumb. Rendered by the shared ListingDetailTemplate, so every vertical emits it. Only
 * an active listing gets structured data (a noindexed page should not advertise a rich result), and
 * the Offer is attached only when a numeric price can be read from the label.
 */
export function listingJsonLd(view: ListingDetailView): object[] {
  const path = listingCanonicalPath(view)
  const url = abs(path)
  if (view.status != null) return [] // non-active: no rich result

  const image = [...(view.primaryImage ? [view.primaryImage] : []), abs('/opengraph-image')]
  const priceCents = priceCentsFromLabel(view.priceLabel)
  const isHousing = view.vertical === 'housing'

  const offer =
    priceCents != null
      ? {
          '@type': 'Offer',
          price: (priceCents / 100).toFixed(2),
          priceCurrency: 'USD',
          availability: 'https://schema.org/InStock',
          url,
          ...(view.seller ? { seller: { '@type': 'Person', name: view.seller.displayName } } : {}),
        }
      : undefined

  // AggregateRating (commerce AIO): emitted ONLY when there is a real average AND at least one review.
  // A null/zero rating is dropped — answer engines silently discard malformed schema, which would negate
  // the node. Carries the 1-5 bestRating/worstRating scale. Only a Market Product carries reviews today
  // (housing/classifieds pass null). Shared with productSchema so both commerce surfaces match.
  const rating = aggregateRatingNode(view.aggregateRating)

  // Individual Review nodes (commerce AIO): a handful of quotable member reviews, each a schema.org
  // Review with author + reviewRating + reviewBody + datePublished. Emitted ONLY when reviews exist;
  // the builder caps + drops any without a real author or body, so an empty set yields no `review`.
  const reviews = productReviewNodes(view.reviews)

  const primary = {
    '@context': 'https://schema.org',
    '@type': isHousing ? 'Accommodation' : 'Product',
    name: view.title,
    ...(view.description?.trim() ? { description: snippet(view.description, 300) } : {}),
    image,
    url,
    ...(view.categoryLabel ? { category: view.categoryLabel } : {}),
    ...(view.locationLabel
      ? { address: { '@type': 'PostalAddress', addressLocality: view.locationLabel } }
      : {}),
    ...(!isHousing && view.seller ? { brand: { '@type': 'Brand', name: view.seller.displayName } } : {}),
    ...(rating ? { aggregateRating: rating } : {}),
    ...(reviews.length ? { review: reviews } : {}),
    ...(offer ? { offers: offer } : {}),
  }

  const crumbs = breadcrumbSchema([
    { name: VERTICAL_LABEL[view.vertical], path: view.back.href },
    { name: view.title, path },
  ])

  return [primary, crumbs]
}
