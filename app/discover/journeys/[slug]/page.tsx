import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getPublicJourney, listPublicJourneys } from '@/lib/journey-plans'
import { readJourneyOutcomes } from '@/lib/journeys/outcomes'
import { readJourneyGuarantee } from '@/lib/journeys/guarantee'
import { getPillars, pillarsById } from '@/lib/pillars'
import { journeyFacts, primaryPillar } from '@/components/journey/discovery-widgets'
import { getPlanAuthor } from '@/lib/journey-plans'
import { resolveDetailHero } from '@/lib/layout/detail-hero'
import { OG_SITE, SITE_NAME } from '@/lib/site'
import { JsonLd } from '@/components/json-ld'
import { journeySchema, breadcrumbSchema, journeyOfferSchema } from '@/lib/jsonld'
import { getJourneyOffer, isSoldOut } from '@/lib/journeys/paid'
import { getProductReviews } from '@/lib/commerce/reviews'
import { ProductReviews } from '@/components/marketplace/product-reviews'
import { readJourneyFaq } from '@/lib/journeys/faq'
import { genericJourneyFaq } from '@/components/journey/discovery-widgets'
import { FrequencyJourney } from '@/components/frequency/site/pages/discover/journeys'

// Public, indexable detail page for one library Journey. Mirrors the in-app Journey
// page's header (badge + Pillar + stat chips) + two-column body + sticky "At a glance"
// card, but in the MARKETING register: anonymous visitors get a "Create a free account"
// CTA in place of the enroll actions. Revalidated hourly, canonical + OG/Twitter
// metadata, and JSON-LD (HowTo). Reuses the same discovery widgets so the public face
// and the member face stay in lockstep. Voice is v2; no em dashes.
export const revalidate = 3600

// Pre-render the public library. listPublicJourneys applies exactly the gate this
// page's own getPublicJourney applies (visibility 'public', status not 'rejected')
// and returns them ordered by adopt_count, so slicing keeps the most-adopted
// Journeys in the prerender manifest and bounds the set as the library grows.
// Without this the route never enters that manifest and `revalidate` above is inert.
// The tail still renders on demand (dynamicParams defaults true).
// Falls back to [] when Supabase credentials are absent (CI / preview without env vars).
const PRERENDER_LIMIT = 200

export async function generateStaticParams() {
  const journeys = await listPublicJourneys().catch(() => [])
  return journeys.slice(0, PRERENDER_LIMIT).map((j) => ({ slug: j.slug }))
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const found = await getPublicJourney(slug)
  if (!found) return { title: 'Journey not found' }
  const { plan } = found

  const full =
    plan.summary ?? `${plan.title}: a guided practice Journey on ${SITE_NAME}. Sign in to start it.`
  // Search snippets truncate around 155 chars — keep the meta description tight.
  const description = full.length > 155 ? `${full.slice(0, 152).trimEnd()}…` : full
  const ogTitle = `${plan.title} · ${SITE_NAME}`
  return {
    title: plan.title,
    description,
    alternates: { canonical: `/discover/journeys/${plan.slug}` },
    openGraph: {
      ...OG_SITE,
      title: ogTitle,
      description,
      url: `/discover/journeys/${plan.slug}`,
      type: 'article',
    },
    twitter: { card: 'summary_large_image', title: ogTitle, description },
  }
}

export default async function DiscoverJourneyPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const found = await getPublicJourney(slug)
  if (!found) notFound()
  const { plan, items } = found

  const [pillars, author, hero] = await Promise.all([
    getPillars(),
    getPlanAuthor(plan.author_id),
    // The standard entity cover (PROG-P5, ADR-1136): the Journey's own cover + focal point is
    // rung 1 — the same `journey_plans` image the in-app page shows — so a published Journey's
    // photo now shows on its public twin too.
    resolveDetailHero(`/discover/journeys/${plan.slug}`, {
      entityImage: plan.cover_image,
      entityFocus: plan.cover_focus,
    }),
  ])
  const byId = pillarsById(pillars)

  const facts = journeyFacts(items)
  const topPillar = primaryPillar(items, byId)

  // ── THIS PAGE HAS TO KNOW WHAT THE JOURNEY COSTS (ADR-1400) ─────────────────────────────────────
  //
  // 🔴 IT DID NOT. This route called `getJourneyOffer` zero times, showed no price anywhere, and
  // told every visitor "Create a free account -- Free to start." It is also the CANONICAL url AND
  // the page a signed-out visitor is redirected to from `/journeys/<slug>` (TWIN_RULES), so it is
  // where every share link, every QR and every crawler lands. A $444 program was advertised as free
  // on the one page most of its buyers would ever see.
  //
  // ⚠️ PRICE YES, SEATS NO. `revalidate = 3600` means anything here can be up to an hour stale. A
  // stale price is a wrong number the buyer corrects at checkout; a stale "2 spots left" is
  // manufactured urgency, which is exactly what ADR-1397 §9 and the FTC's dark-patterns report
  // refuse. `seatLine` stays on the live surfaces.
  const offer = await getJourneyOffer(plan.id)
  const reviews = offer ? await getProductReviews(offer.productId) : null
  const rating =
    reviews && reviews.average != null && reviews.count > 0
      ? { ratingValue: reviews.average, reviewCount: reviews.count }
      : null
  const priceLabel = offer
    ? new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: (offer.currency || 'usd').toUpperCase(),
        maximumFractionDigits: offer.priceCents % 100 === 0 ? 0 : 2,
      }).format(offer.priceCents / 100)
    : null
  const soldOut = offer ? isSoldOut(offer) : false

  const schema = [
    journeySchema(plan, items),
    // A priced Journey also emits a Product node carrying its Offer, so the canonical page
    // states the price in structured data and not only in the markup. Absent when free.
    ...(offer && priceLabel ? [journeyOfferSchema(plan, offer, soldOut, rating)] : []),
    breadcrumbSchema([
      { name: 'Discover', path: '/discover' },
      { name: 'Journeys', path: '/discover/journeys' },
      { name: plan.title, path: `/discover/journeys/${plan.slug}` },
    ]),
  ]
  const authoredFaq = readJourneyFaq(plan.page_config)
  return (
    <>
      <JsonLd data={schema} />
      <FrequencyJourney
        plan={plan}
        facts={facts}
        pillarName={topPillar?.name ?? null}
        author={author}
        sale={offer && priceLabel ? { productId: offer.productId, priceLabel, soldOut } : null}
        image={hero.coverImage}
        outcomes={readJourneyOutcomes(plan.page_config)}
        guarantee={readJourneyGuarantee(plan.page_config)}
        faqs={authoredFaq.length > 0 ? authoredFaq : genericJourneyFaq(plan)}
        reviews={
          reviews && offer ? (
            <ProductReviews
              productId={offer.productId}
              productTitle={plan.title}
              reviews={reviews}
              myReview={null}
              signedIn={false}
              canReview={false}
              canModerate={false}
            />
          ) : null
        }
      />
    </>
  )
}
