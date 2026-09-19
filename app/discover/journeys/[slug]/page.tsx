import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Sparkles } from 'lucide-react'
import { getPublicJourney, listPublicJourneys } from '@/lib/journey-plans'
import { readJourneyOutcomes } from '@/lib/journeys/outcomes'
import { getPillars, pillarsById } from '@/lib/pillars'
import {
  DiscoveryBlocks,
  OutcomesBlock,
  InstructorBlock,
  JourneyFaq,
  JourneyStatChips,
  AtAGlanceCard,
  journeyFacts,
  primaryPillar,
} from '@/components/journey/discovery-widgets'
import { getPlanAuthor } from '@/lib/journey-plans'
import { JourneyDetailTemplate } from '@/components/templates'
import { resolveDetailHero } from '@/lib/layout/detail-hero'
import { ShareButton } from '@/components/discover/share-button'
import { buttonClasses } from '@/components/ui/button'
import { accentColor, accentTint } from '@/lib/studio/accents'
import { JOURNEY_ICON_MAP, DefaultJourneyIcon } from '@/lib/studio/journey-icons'
import { SITE_NAME } from '@/lib/site'
import { JsonLd } from '@/components/json-ld'
import { journeySchema, breadcrumbSchema, journeyOfferSchema } from '@/lib/jsonld'
import { getJourneyOffer, isSoldOut } from '@/lib/journeys/paid'
import { journeyBuySignInPath } from '@/lib/journeys/sales-path'
import { getProductReviews } from '@/lib/commerce/reviews'
import { ProductReviews } from '@/components/marketplace/product-reviews'

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
  const accent = plan.accent
  const PlanIcon = JOURNEY_ICON_MAP[plan.emoji ?? ''] ?? DefaultJourneyIcon

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

  // The marketing-register CTA. A FREE Journey reads exactly as it always did; a paid one names its
  // price and sends the buyer to the storefront that can take it, which is public, crawlable and
  // (since ADR-1399) opens the card fields in place.
  const signUpCta =
    offer && priceLabel ? (
      <div className="space-y-2">
        {soldOut ? (
          <span
            className={buttonClasses('secondary', 'md', 'w-full pointer-events-none opacity-70')}
          >
            Full
          </span>
        ) : (
          <Link
            href={journeyBuySignInPath(plan.slug)}
            className={buttonClasses('primary', 'md', 'w-full')}
          >
            Get access · {priceLabel}
          </Link>
        )}
        <p className="text-2xs leading-relaxed text-muted">
          {soldOut
            ? 'Every seat is taken for this run.'
            : 'Enrol to unlock every phase. Run it with your Circle or solo.'}
        </p>
      </div>
    ) : (
      <div className="space-y-2">
        <Link href="/sign-in" className={buttonClasses('primary', 'md', 'w-full')}>
          Create a free account
        </Link>
        <p className="text-2xs leading-relaxed text-muted">
          Free to start. Run it with your Circle or solo.
        </p>
      </div>
    )

  return (
    <div className="mx-auto max-w-5xl px-6 py-12 sm:py-16">
      <JsonLd
        data={[
          journeySchema(plan, items),
          // A priced Journey also emits a Product node carrying its Offer, so the canonical page
          // states the price in structured data and not only in the markup. Absent when free.
          ...(offer && priceLabel ? [journeyOfferSchema(plan, offer, soldOut, rating)] : []),
          breadcrumbSchema([
            { name: 'Discover', path: '/discover' },
            { name: 'Journeys', path: '/discover/journeys' },
            { name: plan.title, path: `/discover/journeys/${plan.slug}` },
          ]),
        ]}
      />

      <JourneyDetailTemplate
        {...hero}
        back={{ href: '/discover/journeys', label: 'Journeys' }}
        title={
          <span className="inline-flex items-center gap-3 align-middle">
            <span
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-card"
              style={{ backgroundColor: accentTint(accent, 16), color: accentColor(accent) }}
            >
              <PlanIcon className="h-6 w-6" />
            </span>
            <span className="min-w-0 break-words">{plan.title}</span>
          </span>
        }
        badges={
          <span className="inline-flex flex-wrap items-center gap-1.5">
            {plan.official && (
              <span className="inline-flex items-center gap-1 rounded-pill bg-primary-bg px-2 py-0.5 text-meta font-semibold text-primary-strong">
                {/* Sparkles, matching the member page. The two surfaces used different icons for
                    the same badge (Flame here, Sparkles there) until this template unified them. */}
                <Sparkles className="h-3 w-3" /> Official
              </span>
            )}
            {topPillar && (
              <span className="inline-flex items-center gap-1 rounded-pill bg-primary-bg px-2 py-0.5 text-meta font-medium text-primary-strong">
                {topPillar.name}
              </span>
            )}
          </span>
        }
        identity={{
          promise: plan.summary ? (
            <p className="leading-relaxed text-text">{plan.summary}</p>
          ) : undefined,
          shape: <JourneyStatChips facts={facts} plan={plan} enrolledCount={plan.adopt_count} />,
          guide: author ? (
            <Link
              href={`/people/${author.handle}`}
              className="inline-flex items-center gap-1 text-meta text-muted hover:text-text"
            >
              By <span className="font-semibold text-text">{author.displayName}</span>
            </Link>
          ) : undefined,
        }}
        actions={
          /* 🔴 SHARE ONLY. This row used to carry an unconditional "Create a free account" link,
             which on a PRICED Journey sat directly above a rail reading "Get access · $444" and a
             closing card saying the same: the header argued with the rest of the page about
             whether the thing was free. The enrol control belongs in the side column, where it can
             be the full-width box a buy control needs to be, and where exactly one of them lives. */
          <ShareButton
            path={`/discover/journeys/${plan.slug}`}
            title={`${plan.title} · ${SITE_NAME}`}
            text={plan.summary ?? `A guided Journey on ${SITE_NAME}.`}
            label="Share"
          />
        }
        interiorSide={
          <AtAGlanceCard
            plan={plan}
            slug={plan.slug}
            facts={facts}
            enrolled={false}
            canStart={facts.lessonCount > 0}
            isAuthor={false}
            progress={null}
            cta={signUpCta}
          />
        }
        interiorMain={
          <div className="max-w-2xl space-y-8">
            <DiscoveryBlocks
              plan={plan}
              items={items}
              pillars={pillars}
              facts={facts}
              accent={accent}
              afterStory={<OutcomesBlock outcomes={readJourneyOutcomes(plan.page_config)} />}
            />
            <InstructorBlock author={author} />
            {reviews && offer && (
              <ProductReviews
                productId={offer.productId}
                productTitle={plan.title}
                reviews={reviews}
                myReview={null}
                signedIn={false}
                canReview={false}
                canModerate={false}
              />
            )}
            <JourneyFaq plan={plan} />

            {/* The closing CTA, in the same two registers. The free copy is untouched; the paid copy
                says what it costs and what enrolling buys, and never the word free. */}
            <div className="rounded-card border border-border bg-surface p-5 text-center lift-1">
              <p className="mb-1 text-body-lg font-bold text-text">
                {offer ? `Join ${plan.title}` : 'Start this Journey'}
              </p>
              <p className="mx-auto mb-4 max-w-sm text-body-sm leading-relaxed text-muted">
                {offer && priceLabel
                  ? soldOut
                    ? 'Every seat is taken for this run. Follow the guide to hear when the next one opens.'
                    : `Enrolling opens every phase and keeps them open. Your Circle can run it with you, and finishing earns the completion Gems.`
                  : 'Sign up free to start it. Its phases drip one per week, your Circle can run it with you, and finishing earns the completion Gems.'}
              </p>
              {offer && priceLabel ? (
                soldOut ? null : (
                  <Link href={journeyBuySignInPath(plan.slug)} className={buttonClasses('primary', 'md')}>
                    Get access · {priceLabel}
                  </Link>
                )
              ) : (
                <Link href="/sign-in" className={buttonClasses('primary', 'md')}>
                  Create a free account
                </Link>
              )}
            </div>
          </div>
        }
      />
    </div>
  )
}
