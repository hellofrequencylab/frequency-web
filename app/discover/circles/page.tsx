import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { getPublicCircles } from '@/lib/discover'
import { CircleCard } from '@/components/discover/cards'
import { ZigZag, BetaCTA, PhotoHero, SectionHeading, Button } from '@/components/marketing/marketing-ui'
import { JsonLd } from '@/components/json-ld'
import { breadcrumbSchema, circleListSchema } from '@/lib/jsonld'
import { SITE_NAME, BETA_CTA_HREF, BETA_CTA_LABEL } from '@/lib/site'

export const metadata: Metadata = {
  title: 'Local circles',
  description:
    'Browse the local circles forming on Frequency: small groups of up to 50 neighbors meeting in person around something they share.',
  alternates: { canonical: '/discover/circles' },
  openGraph: {
    title: `Local circles · ${SITE_NAME}`,
    description: 'Browse the local circles forming on Frequency and find your people.',
    url: '/discover/circles',
  },
}

export const revalidate = 3600

export default async function DiscoverCirclesPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const isAuthed = !!user

  const circles = await getPublicCircles(200)

  return (
    <>
      <JsonLd
        data={[
          breadcrumbSchema([
            { name: 'Discover', path: '/discover' },
            { name: 'Circles', path: '/discover/circles' },
          ]),
          circleListSchema(circles, 'Local circles on Frequency'),
        ]}
      />

      <PhotoHero
        image="/images/site/971634cd-1d52-4b3a-a0ab-5713d395d58a.jpg"
        alt="A group gathered outdoors at golden hour, arms thrown open mid-breathwork"
        eyebrow="Find your people"
        title="Circles forming now"
        subtitle="A circle is a small group of up to 50 neighbors who meet in person around something they share: a practice, a place, a love. Browse freely; join a free account to take part."
      >
        <Button href={BETA_CTA_HREF}>{BETA_CTA_LABEL}</Button>
      </PhotoHero>

      <section className="bg-surface px-6 py-20 sm:py-24">
        <div className="max-w-4xl mx-auto">
          <div className="mb-9 max-w-prose">
            <SectionHeading eyebrow="Near you" title="Browse the circles" />
            <p className="mt-5 text-lg text-muted leading-relaxed">
              Every circle here is real and forming in North County San Diego. Find one that
              sounds like your people, or a reason to start your own.
            </p>
          </div>
          {circles.length === 0 ? (
            <p className="text-center text-muted">No public circles yet. Check back soon.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {circles.map((c) => (
                <div key={c.id} className="rounded-2xl transition-shadow hover:shadow-pop">
                  <CircleCard circle={c} isAuthed={isAuthed} />
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <ZigZag
        tone="ink"
        img="/images/site/PHOTO-2020-10-17-13-49-14.jpeg"
        alt="A music circle gathered on a cliffside above the ocean at golden hour"
        imgAspect="landscape"
        eyebrow="How circles grow"
        title="A circle divides to stay close"
        kicker="Fifty is not a limit. It's the edge of intimacy."
      >
        <p>
          Circles gather around something small and true: a sunrise swim, a guitar, a grief.
          They stay where you can still learn everyone&apos;s name.
        </p>
        <p>
          When a circle outgrows that closeness, it doesn&apos;t sprawl. It divides, like a cell,
          like a family at a long table, so the warmth carries into two rooms instead of thinning
          across one.
        </p>
      </ZigZag>

      <BetaCTA
        heading="Your people are already gathering"
        body="Join the North County San Diego beta to step inside a circle, or start one of your own."
      />
    </>
  )
}
