import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowRight, Building2, Compass } from 'lucide-react'
import { listNetworkedSpaces } from '@/lib/spaces/discovery'
import { DIRECTORY_TYPES, spaceTypeLabel } from '@/components/spaces/space-type'
import { SpaceCard } from '@/components/spaces/space-card'
import { PageHero, Section, SectionHeading, BetaCTA, Button } from '@/components/marketing/marketing-ui'
import { JsonLd } from '@/components/json-ld'
import { breadcrumbSchema, spaceListSchema } from '@/lib/jsonld'
import { SITE_NAME, SITE_URL, BETA_CTA_HREF, BETA_CTA_LABEL } from '@/lib/site'

export const revalidate = 3600

// A programmatic hub per Space type (BUSINESS-ACCOUNTS-STRATEGY Area A). Each is a crawlable landing
// page that borrows the root domain's authority and links out to every networked Space of its type,
// thickening the internal link graph. A hub with fewer than this many Spaces is noindex'd so a thin
// page never advertises itself (BrightLocal / Semrush programmatic-SEO guidance).
const HUB_MIN_INDEX = 3

const TYPE_HUBS: Record<string, { plural: string; blurb: string }> = {
  practitioner: { plural: 'Practitioners', blurb: 'coaches, healers, and teachers running a practice' },
  business: { plural: 'Businesses', blurb: 'studios, gyms, and brands with classes and memberships' },
  organization: { plural: 'Organizations', blurb: 'non-profits and mission-driven groups' },
  coaching: { plural: 'Coaching academies', blurb: 'cohort programs and guided curricula' },
  event_space: { plural: 'Event spaces', blurb: 'venues and retreats hosting real gatherings' },
}

export function generateStaticParams() {
  return DIRECTORY_TYPES.map((t) => ({ type: t.value }))
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ type: string }>
}): Promise<Metadata> {
  const { type } = await params
  const hub = TYPE_HUBS[type]
  if (!hub) return { title: 'Not found' }

  const spaces = await listNetworkedSpaces({ type })
  const title = `${hub.plural} on ${SITE_NAME}`
  const description = `Browse ${hub.plural.toLowerCase()} on ${SITE_NAME}: ${hub.blurb}. Free to browse, and every profile is claimable.`
  const canonical = `/discover/spaces/${type}`
  return {
    title,
    description,
    alternates: { canonical },
    // Guard the index signal: a hub with too few Spaces should not be advertised as a landing page.
    robots: spaces.length >= HUB_MIN_INDEX ? undefined : { index: false, follow: true },
    openGraph: { title: `${title}`, description, url: canonical, type: 'website' },
    twitter: { card: 'summary_large_image', title, description },
  }
}

export default async function DiscoverSpacesByTypePage({
  params,
}: {
  params: Promise<{ type: string }>
}) {
  const { type } = await params
  const hub = TYPE_HUBS[type]
  if (!hub) notFound()

  const spaces = await listNetworkedSpaces({ type })
  const label = spaceTypeLabel(type)

  return (
    <>
      <JsonLd
        data={[
          breadcrumbSchema([
            { name: 'Discover', path: '/discover' },
            { name: 'Spaces', path: '/spaces' },
            { name: hub.plural, path: `/discover/spaces/${type}` },
          ]),
          {
            '@context': 'https://schema.org',
            '@type': 'CollectionPage',
            name: `${hub.plural} on ${SITE_NAME}`,
            url: `${SITE_URL}/discover/spaces/${type}`,
          },
          spaces.length > 0 && spaceListSchema(spaces, `${hub.plural} on ${SITE_NAME}`),
        ].filter(Boolean)}
      />

      <PageHero
        eyebrow="Discover by type"
        title={
          <>
            {hub.plural} on <span className="text-primary">{SITE_NAME}</span>
          </>
        }
        subtitle={`The ${hub.plural.toLowerCase()} building on ${SITE_NAME}: ${hub.blurb}. Browse them free, follow the ones you like, then reach out.`}
      />

      {spaces.length > 0 ? (
        <Section tone="surface" className="!max-w-none">
          <div className="mx-auto max-w-5xl">
            <SectionHeading
              eyebrow="Browse"
              title={
                <>
                  Every {label} in the network
                </>
              }
              kicker={`${spaces.length} ${spaces.length === 1 ? 'profile' : 'profiles'}, and counting.`}
            />
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {spaces.map((s) => (
                <SpaceCard key={s.id} space={s} />
              ))}
            </div>
          </div>
        </Section>
      ) : (
        <Section tone="surface">
          <div className="mx-auto max-w-md text-center">
            <Building2 className="mx-auto h-8 w-8 text-subtle" aria-hidden />
            <p className="mt-3 text-sm text-muted-foreground">
              No {hub.plural.toLowerCase()} here yet. Be the first to claim one.
            </p>
          </div>
        </Section>
      )}

      {/* Cross-links to the other type hubs, so each page feeds the others (hub-and-spoke). */}
      <Section tone="canvas">
        <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-3 text-sm">
          <Link
            href="/spaces"
            className="inline-flex items-center gap-1.5 font-semibold text-primary-strong hover:underline"
          >
            <Compass className="h-4 w-4" /> All Spaces
          </Link>
          {DIRECTORY_TYPES.filter((t) => t.value !== type).map((t) => (
            <Link
              key={t.value}
              href={`/discover/spaces/${t.value}`}
              className="inline-flex items-center gap-1.5 font-semibold text-primary-strong hover:underline"
            >
              {TYPE_HUBS[t.value]?.plural ?? t.label}
            </Link>
          ))}
        </div>
      </Section>

      <BetaCTA
        heading={`Run your ${label.toLowerCase()} on ${SITE_NAME}`}
        body="Start with a free profile that gets found on search and AI, then grow into the full toolkit when you are ready."
      />

      <div className="px-6 pb-16 text-center">
        <Button href={BETA_CTA_HREF} variant="ghost">
          {BETA_CTA_LABEL} <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </>
  )
}
