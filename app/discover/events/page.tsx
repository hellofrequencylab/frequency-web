import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { getPublicEvents } from '@/lib/discover'
import { EventRow } from '@/components/discover/cards'
import { Statement, BetaCTA, PhotoHero, SectionHeading, Button } from '@/components/marketing/marketing-ui'
import { JsonLd } from '@/components/json-ld'
import { breadcrumbSchema, eventListSchema } from '@/lib/jsonld'
import { SITE_NAME, BETA_CTA_HREF, BETA_CTA_LABEL } from '@/lib/site'

export const metadata: Metadata = {
  title: 'Upcoming events',
  description:
    'Browse upcoming real-world events across the Frequency community: neighbors gathering in person near you.',
  alternates: { canonical: '/discover/events' },
  openGraph: {
    title: `Upcoming events · ${SITE_NAME}`,
    description: 'Browse upcoming real-world events across the Frequency community.',
    url: '/discover/events',
  },
}

export const revalidate = 3600

export default async function DiscoverEventsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const isAuthed = !!user

  const events = await getPublicEvents(50)

  return (
    <>
      <JsonLd
        data={[
          breadcrumbSchema([
            { name: 'Discover', path: '/discover' },
            { name: 'Events', path: '/discover/events' },
          ]),
          eventListSchema(events, 'Upcoming events on Frequency'),
        ]}
      />

      <PhotoHero
        image="/images/site/63978107-8b40-4ce2-8eaf-01a2f6f35cb9.jpg"
        alt="People on the beach at golden hour, arms raised in celebration by the ocean"
        eyebrow="Coming up"
        title="Show up in person"
        subtitle="Real-world gatherings near you. Public pages show the city only; the exact venue is shared with members who RSVP."
      >
        <Button href={BETA_CTA_HREF}>{BETA_CTA_LABEL}</Button>
      </PhotoHero>

      {events.length === 0 ? (
        // Founding state: no events on the calendar yet near the beta. Frame it as a
        // beginning, not an absence.
        <section className="bg-surface px-6 py-20 sm:py-24">
          <div className="max-w-3xl mx-auto text-center">
            <SectionHeading eyebrow="Founding chapter" title="The first gathering hasn't happened yet" />
            <p className="mt-6 text-lg text-muted leading-relaxed">
              We&rsquo;re just getting started in North County San Diego. The calendar is quiet
              for now, but that&rsquo;s how every circle begins, with a few neighbors deciding to
              show up. Join the beta and you&rsquo;ll be among the first to know when the first one
              lands.
            </p>
            <div className="mt-9">
              <Button href={BETA_CTA_HREF}>{BETA_CTA_LABEL}</Button>
            </div>
          </div>
        </section>
      ) : (
        <>
          <section className="bg-surface px-6 py-20 sm:py-24">
            <div className="max-w-3xl mx-auto">
              <div className="text-center mb-9">
                <SectionHeading eyebrow="On the calendar" title="What's coming up" />
              </div>
              <div className="space-y-3">
                {events.map((e) => (
                  <div key={e.id} className="transition-transform hover:-translate-y-0.5">
                    <EventRow event={e} isAuthed={isAuthed} />
                  </div>
                ))}
              </div>
            </div>
          </section>

          <Statement tone="ink">
            Friendship happens <span className="text-primary">in person</span>.
          </Statement>
        </>
      )}

      <BetaCTA
        heading="See you there"
        body="Join the North County San Diego beta: RSVP to gatherings, meet your neighbors, and help shape what we build next."
      />
    </>
  )
}
