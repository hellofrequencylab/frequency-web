// The /discover/cities index (GE11-2) — the cities that have crossed the density
// threshold each get a card. Only above-threshold cities appear (the same gate
// the per-city pages and the sitemap use), so this never lists a thin facet. Real
// canonical, breadcrumb + ItemList JSON-LD. Voice locked: plain, no em dashes.
import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { listDensityCities } from './_data'
import { PageHero, Section, BetaCTA, Button } from '@/components/marketing/marketing-ui'
import { JsonLd } from '@/components/json-ld'
import { breadcrumbSchema } from '@/lib/jsonld'
import { SITE_NAME, SITE_URL } from '@/lib/site'

export const revalidate = 3600

const TITLE = 'Find your people by city'
const DESCRIPTION =
  'The cities where Frequency is taking root: local Circles meeting and real-world events happening near you. Browse by city, free to join during the beta.'

export function generateMetadata(): Metadata {
  const canonical = '/discover/cities'
  return {
    title: TITLE,
    description: DESCRIPTION,
    alternates: { canonical },
    openGraph: {
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
  const cities = await listDensityCities()

  return (
    <>
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

      <PageHero
        eyebrow="Discover by city"
        title={
          <>
            Where Frequency is <span className="text-primary">taking root</span>
          </>
        }
        subtitle="These are the cities with real momentum: Circles meeting and events happening near you. Pick yours to see what is on this week, then show up in person."
      />

      <Section tone="canvas" pad="pb-16 sm:pb-20">
        {cities.length > 0 ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {cities.map((c) => (
              <Link
                key={c.slug}
                href={`/discover/cities/${c.slug}`}
                className="group flex items-center justify-between gap-4 rounded-2xl border border-border bg-surface px-6 py-5 shadow-sm transition-colors hover:border-primary"
              >
                <span className="text-lg font-semibold text-text">{c.city}</span>
                <ArrowRight className="h-5 w-5 shrink-0 text-subtle transition-transform group-hover:translate-x-0.5 group-hover:text-primary-strong" aria-hidden />
              </Link>
            ))}
          </div>
        ) : (
          <div className="mx-auto max-w-xl text-center text-lg leading-relaxed text-muted">
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

      <BetaCTA
        heading="Your city is built one room at a time."
        body="Frequency is free to join during the beta. Find a Circle near you, or start the first one."
      />
    </>
  )
}
