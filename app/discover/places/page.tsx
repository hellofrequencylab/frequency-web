import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowRight, Users, CalendarDays, MapPin } from 'lucide-react'
import { listDiscoverCities } from './_data'
import {
  PageHero,
  Section,
  SectionHeading,
  Card,
  BetaCTA,
} from '@/components/marketing/marketing-ui'
import { JsonLd } from '@/components/json-ld'
import { breadcrumbSchema } from '@/lib/jsonld'
import { SITE_NAME, SITE_URL } from '@/lib/site'

export const revalidate = 3600

const TITLE = 'Browse by place'
const DESCRIPTION =
  'Find the Frequency community near you. Browse the towns and cities where local Circles are meeting and real-world events are happening this season.'

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: '/discover/places' },
  openGraph: { title: `${TITLE} · ${SITE_NAME}`, description: DESCRIPTION, url: '/discover/places', type: 'website' },
  twitter: { card: 'summary_large_image', title: `${TITLE} · ${SITE_NAME}`, description: DESCRIPTION },
}

export default async function DiscoverPlacesPage() {
  const cities = await listDiscoverCities()

  return (
    <>
      <JsonLd
        data={[
          breadcrumbSchema([
            { name: 'Discover', path: '/discover' },
            { name: 'Places', path: '/discover/places' },
          ]),
          {
            '@context': 'https://schema.org',
            '@type': 'ItemList',
            name: 'Places on Frequency',
            numberOfItems: cities.length,
            itemListElement: cities.map((c, i) => ({
              '@type': 'ListItem',
              position: i + 1,
              url: `${SITE_URL}/discover/places/${c.slug}`,
              name: c.city,
            })),
          },
        ]}
      />

      <PageHero
        eyebrow="Discover by place"
        title={
          <>
            Find your people, <span className="text-primary">near you</span>
          </>
        }
        subtitle="Somewhere close to you, neighbors are already meeting this week. Pick your town to see the Circles forming and the events coming up there."
      />

      <Section tone="canvas" className="!max-w-none">
        <div className="mx-auto max-w-4xl">
          <SectionHeading
            eyebrow="Where it's happening"
            title="Browse by town"
            kicker="Every place here has real Circles or events you can show up to."
          />
          {cities.length === 0 ? (
            <p className="text-center text-muted">
              The first Circles are forming now. Check back soon to browse by place.
            </p>
          ) : (
            <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {cities.map((c) => (
                <li key={c.slug}>
                  <Link href={`/discover/places/${c.slug}`} className="group block h-full">
                    <Card
                      tone="feature"
                      className="flex h-full flex-col transition-colors hover:border-border-strong"
                    >
                      <div className="mb-3 flex items-center gap-2">
                        <MapPin className="h-4 w-4 text-primary-strong" />
                        <h3 className="text-base font-bold text-text transition-colors group-hover:text-primary-strong">
                          {c.city}
                        </h3>
                      </div>
                      <div className="mt-auto flex items-center gap-4 text-xs text-subtle">
                        {c.circleCount > 0 && (
                          <span className="inline-flex items-center gap-1">
                            <Users className="h-3.5 w-3.5" />
                            {c.circleCount} {c.circleCount === 1 ? 'Circle' : 'Circles'}
                          </span>
                        )}
                        {c.eventCount > 0 && (
                          <span className="inline-flex items-center gap-1">
                            <CalendarDays className="h-3.5 w-3.5" />
                            {c.eventCount} {c.eventCount === 1 ? 'event' : 'events'}
                          </span>
                        )}
                        <ArrowRight className="ml-auto h-4 w-4 text-primary-strong opacity-0 transition-opacity group-hover:opacity-100" />
                      </div>
                    </Card>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Section>

      <BetaCTA
        heading="Don't see your town yet?"
        body="Frequency is growing one neighborhood at a time. Join the beta and help start the first Circle where you live."
      />
    </>
  )
}
