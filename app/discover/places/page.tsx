import type { Metadata } from 'next'
import { listDiscoverCities } from './_data'
import {
  PageHero,
  Section,
  SectionHeading,
  BetaCTA,
} from '@/components/marketing/marketing-ui'
import { PlacesFinder } from '@/components/discover/places-finder'
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

  // Aggregate the activity already on the page into a single proof line. These are
  // sums over the same public counts the cards show — no extra reads, no new data.
  const totalCircles = cities.reduce((n, c) => n + c.circleCount, 0)
  const totalEvents = cities.reduce((n, c) => n + c.eventCount, 0)

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

      {/* Proof band: the activity across every town, summed from the same public
          counts the cards below show. Concrete numbers, so the page reads as a
          living community rather than an empty directory. */}
      {cities.length > 0 && (totalCircles > 0 || totalEvents > 0) && (
        <div className="border-b border-border/60 bg-surface px-6 py-8">
          <div className="mx-auto flex max-w-2xl flex-wrap items-center justify-center gap-x-8 gap-y-2 text-center text-sm text-muted">
            <span>
              <strong className="text-text">{cities.length}</strong>{' '}
              {cities.length === 1 ? 'town' : 'towns'}
            </span>
            {totalCircles > 0 && (
              <>
                <span aria-hidden className="text-border-strong">
                  |
                </span>
                <span>
                  <strong className="text-text">{totalCircles}</strong>{' '}
                  {totalCircles === 1 ? 'Circle' : 'Circles'}
                </span>
              </>
            )}
            {totalEvents > 0 && (
              <>
                <span aria-hidden className="text-border-strong">
                  |
                </span>
                <span>
                  <strong className="text-text">{totalEvents}</strong> upcoming{' '}
                  {totalEvents === 1 ? 'event' : 'events'}
                </span>
              </>
            )}
          </div>
        </div>
      )}

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
            <PlacesFinder cities={cities} />
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
