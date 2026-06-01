import type { Metadata } from 'next'
import { getPublicEvents } from '@/lib/discover'
import { EventRow } from '@/components/discover/cards'
import { JsonLd } from '@/components/json-ld'
import { breadcrumbSchema, eventListSchema } from '@/lib/jsonld'
import { SITE_NAME } from '@/lib/site'

export const metadata: Metadata = {
  title: 'Upcoming events',
  description:
    'Browse upcoming real-world events across the Frequency community — neighbors gathering in person near you.',
  alternates: { canonical: '/discover/events' },
  openGraph: {
    title: `Upcoming events — ${SITE_NAME}`,
    description: 'Browse upcoming real-world events across the Frequency community.',
    url: '/discover/events',
  },
}

export const revalidate = 3600

export default async function DiscoverEventsPage() {
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

      <section className="bg-marketing-canvas px-6 py-16 border-b border-border/60">
        <div className="max-w-5xl mx-auto text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-primary-strong mb-3">
            Coming up
          </p>
          <h1 className="text-3xl sm:text-5xl font-bold text-text mb-4">Upcoming events</h1>
          <p className="text-muted leading-relaxed max-w-2xl mx-auto">
            Real-world gatherings near you. Public pages show the city only — the exact venue is
            shared with members who RSVP.
          </p>
        </div>
      </section>

      <section className="bg-surface px-6 py-16">
        <div className="max-w-2xl mx-auto">
          {events.length === 0 ? (
            <p className="text-center text-muted">No upcoming events yet — check back soon.</p>
          ) : (
            <div className="space-y-3">
              {events.map((e) => (
                <EventRow key={e.id} event={e} />
              ))}
            </div>
          )}
        </div>
      </section>
    </>
  )
}
