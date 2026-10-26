import { getMyProfileId } from '@/lib/auth'
import { listListings, LISTING_KINDS, type ListingKind } from '@/lib/marketplace'
import { resolvePageContent, pageContentMetadata } from '@/lib/page-content'
import { FqClassifiedsBody } from '@/components/frequency/members/marketplace/marketplace-body'

// Classifieds (ADR-596) — the peer trade board (offer / free / lend / request), connect-only, no fees.
// Hero-led (the site PhotoHero grammar) + a stats band. Operator-editable header content (ADR-180).

const CONTENT_FALLBACK = {
  title: 'Classifieds',
  description: 'Swap, give, lend, and find things with people near you. No fees, no in-app payment, just neighbors helping out. Arrange the handoff offline.',
}

// Same posture as the Frequency Store index (app/(main)/(marketplace)/store/page.tsx:19-23): no /discover twin
// exists for Classifieds, and this kind-filtered board is not the SEO surface — the individual
// /classifieds/<id> pages are (self-canonical, Product schema, and the ones app/sitemap.ts
// advertises). So the index is noindexed but still FOLLOWED, letting crawlers walk through to the
// indexable listing pages. It stays out of the robots.ts DISALLOW list for exactly the reason noted
// there: a blanket "/classifieds" rule would deindex the listing pages too. The rest of the head
// (title, description, canonical, og/twitter) still comes from the operator-editable page content.
export async function generateMetadata() {
  const meta = await pageContentMetadata('/classifieds', {
    title: 'Classifieds',
    description: 'Swap, give, lend, and find things with people near you. No fees, just neighbors.',
  })
  return { ...meta, robots: { index: false, follow: true } }
}
export const dynamic = 'force-dynamic'


export default async function ClassifiedsPage({ searchParams }: { searchParams: Promise<{ kind?: string }> }) {
  const { kind } = await searchParams
  const activeKind = LISTING_KINDS.some((k) => k.key === kind) ? (kind as ListingKind) : null

  const { description, body, ctaLabel, ctaHref } = await resolvePageContent('/classifieds', CONTENT_FALLBACK)
  // One unfiltered read powers the stats; the grid filters to the active kind in-process. The hero
  // search bar filters the grid instantly on the client (MarketGrid reads the shared query).
  const [profileId, allListings] = await Promise.all([getMyProfileId(), listListings({})])
  const kindCount = (k: string) => allListings.filter((l) => l.kind === k).length
  const listings = allListings.filter((l) => (activeKind ? l.kind === activeKind : true))

  return (
    <FqClassifiedsBody
      listings={listings.map((l) => ({
        id: l.id,
        title: l.title,
        kind: l.kind,
        priceNote: l.price_note,
        image: l.images?.[0] ?? null,
        seller: l.author?.display_name ?? null,
        place: l.neighborhood ?? l.city ?? null,
        description: l.description,
        lat: l.latitude,
        lng: l.longitude,
        unclaimed: !!l.seededUnclaimed,
      }))}
      activeKind={activeKind}
      signedIn={!!profileId}
      subtitle="Meet up to swap. No in-app payment."
      stats={{ total: allListings.length, free: kindCount('free'), lend: kindCount('lend'), request: kindCount('request') }}
      intro={{ body: body ?? null, ctaLabel: ctaLabel ?? null, ctaHref: ctaHref ?? null }}
    />
  )
}
