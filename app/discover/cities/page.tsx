// The /discover/cities index (GE11-2) — the cities that have crossed the density
// threshold each get a card (the same gate the per-city pages and the sitemap use).
// Since 2026-10-14 it also carries the every-town finder that was /discover/places
// (merged here with a 301): every town with a public Circle or upcoming Event, linking
// to the one town page. Real canonical, breadcrumb + ItemList JSON-LD (the ranked
// cities). Voice locked: plain, no em dashes.
import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { listDensityCities } from './_data'
import { listDiscoverCities } from './_towns'
import { PlacesFinder } from '@/components/discover/places-finder'
import { PageHero, Section, SectionHeading, BetaCTA, Button } from '@/components/marketing/marketing-ui'
import { JsonLd } from '@/components/json-ld'
import { breadcrumbSchema } from '@/lib/jsonld'
import { OG_SITE, ROOT_OG_IMAGES, SITE_NAME, SITE_URL } from '@/lib/site'
import { SITE_DESIGN } from '@/lib/theme/design'
import { FrequencyCitiesIndex } from '@/components/frequency/site/pages/discover/frequency-discover-places'

export const revalidate = 3600

const TITLE = 'Find your people by city'
const DESCRIPTION =
  'The cities where Frequency is taking root: local Circles meeting and real-world events happening near you. Browse by city. Free to join.'

export function generateMetadata(): Metadata {
  const canonical = '/discover/cities'
  return {
    title: TITLE,
    description: DESCRIPTION,
    alternates: { canonical },
    openGraph: {
      ...OG_SITE,
      images: ROOT_OG_IMAGES,
      title: `${TITLE} · ${SITE_NAME}`,
      description: DESCRIPTION,
      url: canonical,
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title: `${TITLE} · ${SITE_NAME}`,
      description: DESCRIPTION,
    },
  }
}

export default async function DiscoverCitiesIndexPage() {
  // The every-town list is a courtesy section: a failed read leaves the ranked cities standing.
  const [cities, towns] = await Promise.all([listDensityCities(), listDiscoverCities().catch(() => [])])

  const schema = (
      <JsonLd
        data={[
          breadcrumbSchema([
            { name: 'Discover', path: '/discover' },
            { name: 'Cities', path: '/discover/cities' },
          ]),
          cities.length > 0 && {
            '@context': 'https://schema.org',
            '@type': 'ItemList',
            name: 'Cities on Frequency',
            numberOfItems: cities.length,
            itemListElement: cities.map((c, i) => ({
              '@type': 'ListItem',
              position: i + 1,
              url: `${SITE_URL}/discover/cities/${c.slug}`,
              name: c.city,
            })),
          },
        ].filter(Boolean)}
      />
  )

  // The Frequency design (ADR-1737): the same list and the same schema, in the design's body.
  // SITE_DESIGN is build-time, so a DAWN build never reaches this branch.
  if (SITE_DESIGN === 'frequency') {
    return (
      <>
        {schema}
        <FrequencyCitiesIndex cities={cities} towns={towns} />
      </>
    )
  }

  return (
    <>
      {schema}

      <PageHero
        eyebrow="Discover by city"
        title={
          <>
            Where Frequency is <span className="text-primary-strong">taking root</span>
          </>
        }
        subtitle="These are the cities with real momentum: Circles meeting and events happening near you. Pick yours to see what is on this week, then show up in person."
      />

      <Section tone="canvas" role="cont">
        {cities.length > 0 ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {cities.map((c) => (
              <Link
                key={c.slug}
                href={`/discover/cities/${c.slug}`}
                className="group flex items-center justify-between gap-4 rounded-2xl border border-border bg-surface px-6 py-5 lift-1 transition-colors hover:border-primary"
              >
                <span className="text-body-lg font-semibold text-text">{c.city}</span>
                <ArrowRight className="h-5 w-5 shrink-0 text-subtle transition-transform group-hover:translate-x-0.5 group-hover:text-primary-strong" aria-hidden />
              </Link>
            ))}
          </div>
        ) : (
          <div className="mx-auto max-w-xl text-center text-body-lg leading-relaxed text-muted">
            <p>
              Cities show up here as the community takes root in them. Want yours to be
              one of the first? Start a Circle and bring a few neighbors together.
            </p>
            <div className="mt-8">
              <Button href="/how-to-start-a-circle" variant="secondary">
                See how to start a Circle
              </Button>
            </div>
          </div>
        )}
      </Section>

      {towns.length > 0 && (
        <Section tone="surface" className="!max-w-none">
          <div id="towns" className="mx-auto max-w-4xl scroll-mt-24">
            <SectionHeading
              eyebrow="Where it's happening"
              title="Browse by town"
              kicker="Every place here has real Circles or events you can show up to."
            />
            <PlacesFinder cities={towns} />
          </div>
        </Section>
      )}

      <BetaCTA
        heading="Your city is built one room at a time."
        body="Frequency is free to join, and it stays free. Find a Circle near you, or start the first one."
      />
    </>
  )
}
