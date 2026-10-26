import type { Metadata } from 'next'
import { getPublicEvents, getPublicCounts } from '@/lib/discover'
import { EventRow, SignInCta } from '@/components/discover/cards'
import { CommunityProof } from '@/components/discover/community-proof'
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
import { OG_SITE, ROOT_OG_IMAGES, SITE_NAME, BETA_CTA_HREF, BETA_CTA_LABEL } from '@/lib/site'
import { SITE_DESIGN } from '@/lib/theme/design'
import { dayInZone, HOME_TZ } from '@/lib/time/zone'
import { getCityCategoryHubs } from './_data'
import { FrequencyDiscoverEvents } from '@/components/frequency/site/pages/discover/frequency-discover-events'

export const metadata: Metadata = {
  title: 'Upcoming events',
  description:
    'Browse community events and local gatherings on Frequency. Check the date, activity, availability and how to take part before you go.',
  alternates: { canonical: '/discover/events' },
  openGraph: {
    ...OG_SITE,
    images: ROOT_OG_IMAGES,
    title: `Upcoming events · ${SITE_NAME}`,
    description: 'Browse community events and local gatherings on Frequency. Check the date, activity, availability and how to take part before you go.',
    url: '/discover/events',
  },
  twitter: {
    card: 'summary_large_image',
    title: `Upcoming events · ${SITE_NAME}`,
    description: 'Browse community events and local gatherings on Frequency. Check the date, activity, availability and how to take part before you go.',
  },
}

export const revalidate = 3600

export default async function DiscoverEventsPage() {
  const [events, counts] = await Promise.all([
    getPublicEvents(50),
    getPublicCounts(),
  ])

  // The Frequency design (ADR-1737): the same calendar read and the same JSON-LD, in the design's body,
  // plus the town x type hubs as links (the same read app/sitemap.ts enumerates them from). A failed hub
  // read drops the links, never the calendar. SITE_DESIGN is build-time, so a DAWN build never reaches
  // this branch and never pays the extra read.
  if (SITE_DESIGN === 'frequency') {
    const hubs = await getCityCategoryHubs().catch(() => [])
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
        <FrequencyDiscoverEvents
          events={events}
          counts={counts}
          today={dayInZone(new Date(), HOME_TZ)}
          townTypes={hubs.map((h) => ({
            href: `/discover/events/in/${h.citySlug}/${h.category.slug}`,
            label: `${h.category.label} in ${h.city}`,
            count: h.events.length,
          }))}
        />
      </>
    )
  }

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
        image="/images/site/adult-playground-parachute.jpg"
        alt="A group on a bluff lawn at dusk holding the edges of a rainbow parachute, the ocean behind them"
        focal="object-center"
        eyebrow="Coming up"
        title={<>Show up <span className="text-primary">this week</span></>}
        subtitle="Browse listed community events, read the activity and check the date. Public pages show the city only; the exact venue is shared with members who RSVP."
      >
        <Button href={BETA_CTA_HREF}>{BETA_CTA_LABEL}</Button>
      </PhotoHero>

      {events.length === 0 ? (
        // Founding state: no events on the calendar yet near the beta. Frame it as a
        // beginning, not an absence.
        <section className="relative overflow-hidden bg-surface mk-beat">
          <FrequencyArcs
            aria-hidden
            className="pointer-events-none absolute -top-12 left-1/2 -translate-x-1/2 w-[38rem] max-w-none text-primary opacity-[0.05]"
          />
          <div className="relative max-w-3xl mx-auto text-center">
            <SectionHeading
              eyebrow="Founding chapter"
              title={<>The first gathering hasn&apos;t <span className="text-primary-strong">happened yet</span></>}
              kicker="Every Circle begins with a few neighbors deciding to show up."
            />
            <p className="mt-6 text-body-lg text-muted leading-relaxed">
              We’re just getting started in North County San Diego. Check back for new dates, or explore the Circles listed here and how to start a gathering of your own.
            </p>
            <div className="mt-9">
              <Button href={BETA_CTA_HREF}>{BETA_CTA_LABEL}</Button>
            </div>
          </div>
        </section>
      ) : (
        <>
          {/* ── The intro ───────────────────────────────────────── */}
          <section className="relative overflow-hidden bg-surface mk-beat">
            {/* Frequency arcs radiating up under the calendar, tying events to place. */}
            <FrequencyArcs
              aria-hidden
              className="pointer-events-none absolute -top-10 right-0 w-[32rem] max-w-none text-primary opacity-[0.05]"
            />
            <div className="relative max-w-3xl mx-auto">
              <div className="text-center max-w-2xl mx-auto mb-9">
                <SectionHeading
                  eyebrow="On the calendar"
                  title={<>What&apos;s <span className="text-primary-strong">coming up</span></>}
                  kicker="Choose a gathering and check the details."
                />
                <p className="mt-5 text-body-lg text-muted leading-relaxed">
                  Browse the upcoming dates and choose an activity you would like to try. Read the listing for availability and how to take part.
                </p>
              </div>
              <div className="space-y-3">
                {events.map((e) => (
                  <div key={e.id} className="transition-transform hover:-translate-y-0.5">
                    <EventRow event={e} />
                  </div>
                ))}
              </div>

              {/* Live proof, then the ask: someone scanning the calendar is ready
                  to show up — show the room is real before we offer the invite. */}
              <div className="mt-12 mx-auto max-w-2xl space-y-4">
                <CommunityProof
                  members={counts.members}
                  circles={counts.circles}
                  events={events.length}
                />
                <SignInCta
                  title="Want to be at one of these?"
                  body="Read the listing, RSVP and check the venue details before you go."
                  action={BETA_CTA_LABEL}
                  href={BETA_CTA_HREF}
                />
              </div>
            </div>
          </section>

          {/* ── Sensory beat — what an event actually feels like ── */}
          <ZigZag
            tone="canvas"
            img="/images/site/adult-play.jpg"
            alt="An outdoor class on a beach overlook, one person mid-handstand, the ocean behind"
            imgAspect="natural"
            eyebrow="Why in person"
            title="The room does what the feed can't"
            kicker="Choose an activity and a date that work for you."
          >
            <p>
              A walk, a class, a table where people gather. Choose an activity that interests you and read what taking part involves.
            </p>
            <p>
              You can try one date before deciding whether to return. Ask the Host about future gatherings if you want a regular time to meet.
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
        body="Joining is free. RSVP to gatherings, meet your neighbors, and help shape what we build next."
      />
    </>
  )
}
