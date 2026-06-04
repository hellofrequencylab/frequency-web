import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { getPublicEvents } from '@/lib/discover'
import { EventRow } from '@/components/discover/cards'
import {
  ZigZag,
  Statement,
  BetaCTA,
  PhotoHero,
  SectionHeading,
  Button,
} from '@/components/marketing/marketing-ui'
import { FrequencyArcs, OrganicBlob } from '@/components/marketing/vector-art'
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
        focal="object-center"
        eyebrow="Coming up"
        title={<>Show up <span className="text-primary">this week</span></>}
        subtitle="A sunrise on the bluff. A thermal circuit. A supper table with a seat saved for you. These are real plans, on real days, with neighbors who will notice if you don't come. Public pages show the city only; the exact venue is shared with members who RSVP."
      >
        <Button href={BETA_CTA_HREF}>{BETA_CTA_LABEL}</Button>
      </PhotoHero>

      {events.length === 0 ? (
        // Founding state: no events on the calendar yet near the beta. Frame it as a
        // beginning, not an absence.
        <section className="relative overflow-hidden bg-surface px-6 py-20 sm:py-24">
          <FrequencyArcs
            aria-hidden
            className="pointer-events-none absolute -top-12 left-1/2 -translate-x-1/2 w-[38rem] max-w-none text-primary opacity-[0.05]"
          />
          <div className="relative max-w-3xl mx-auto text-center">
            <SectionHeading
              eyebrow="Founding chapter"
              title={<>The first gathering hasn&apos;t <span className="text-primary">happened yet</span></>}
              kicker="Every circle begins with a few neighbors deciding to show up."
            />
            <p className="mt-6 text-lg text-muted leading-relaxed">
              We&rsquo;re just getting started in North County San Diego. The calendar is quiet
              for now, but quiet is how every standing time starts: one sunrise, one cold plunge,
              one supper that someone was brave enough to put on the calendar. Join the beta and
              you&rsquo;ll be among the first to know when the first one lands, and one of the
              faces the next person walks in and recognizes.
            </p>
            <div className="mt-9">
              <Button href={BETA_CTA_HREF}>{BETA_CTA_LABEL}</Button>
            </div>
          </div>
        </section>
      ) : (
        <>
          {/* ── The intro ───────────────────────────────────────── */}
          <section className="relative overflow-hidden bg-surface px-6 py-20 sm:py-24">
            {/* Frequency arcs radiating up under the calendar, tying events to place. */}
            <FrequencyArcs
              aria-hidden
              className="pointer-events-none absolute -top-10 right-0 w-[32rem] max-w-none text-primary opacity-[0.05]"
            />
            <div className="relative max-w-3xl mx-auto">
              <div className="text-center max-w-2xl mx-auto mb-9">
                <SectionHeading
                  eyebrow="On the calendar"
                  title={<>What&apos;s <span className="text-primary">coming up</span></>}
                  kicker="Pick one, RSVP, and you're expected."
                />
                <p className="mt-5 text-lg text-muted leading-relaxed">
                  This is the kind of plan that pulls you off the couch and into a room. Tap
                  through what&apos;s next, find the one that sounds like your morning, and let
                  a few neighbors start to know your face.
                </p>
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

          {/* ── Sensory beat — what an event actually feels like ── */}
          <ZigZag
            tone="canvas"
            img="/images/site/PHOTO-2020-09-09-16-38-27.jpeg"
            alt="A large Frequency community practicing yoga together on a lawn at golden hour"
            imgAspect="natural"
            eyebrow="Why in person"
            title="The room does what the feed can't"
            kicker="Cold, gold, quiet, and the same faces, week after week."
          >
            <p>
              A sunrise on the bluff. Mats laid out in rows on the grass. The exhale of a circuit
              that takes you from heat to cold and hands you back a settled nervous system. None
              of it survives a screen. You have to be in the room.
            </p>
            <p>
              And the second time you come, you&apos;re not a stranger anymore. The faces you
              half-recognize from the feed are already there, saving you the corner by the window.
              Showing up stops feeling like a plan and starts feeling like home.
            </p>
          </ZigZag>

          <div className="relative overflow-hidden">
            <OrganicBlob
              aria-hidden
              className="pointer-events-none absolute -bottom-24 -right-16 w-[30rem] max-w-none text-primary opacity-[0.04]"
            />
            <Statement tone="ink">
              Friendship happens <span className="text-primary">in person</span>.
            </Statement>
          </div>
        </>
      )}

      <BetaCTA
        heading="See you there"
        body="Join the North County San Diego beta: RSVP to gatherings, meet your neighbors, and help shape what we build next."
      />
    </>
  )
}
