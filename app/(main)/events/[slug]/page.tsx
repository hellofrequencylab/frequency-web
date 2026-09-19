import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { CalendarDays, MapPin, Lock } from 'lucide-react'
import { getPublicEventBySlug, getPublicEvents, formatEventDateTime, hasEventEnded } from '@/lib/discover'
import { getEventEnrichment } from '@/app/discover/events/_data'
import { SignInCta } from '@/components/discover/cards'
import { EventDetailTemplate } from '@/components/templates'
import { PosterBand } from '@/components/media/poster-band'
import { eventPosterHeightClass, eventPosterMaxHeightClass } from '@/lib/events/hero-height'
import { SITE_NAME, BETA_CTA_HREF, BETA_CTA_LABEL } from '@/lib/site'
import { JsonLd } from '@/components/json-ld'
import { eventSchema, breadcrumbSchema } from '@/lib/jsonld'
import { seriesRobots, seriesSeoFactsBySlug, suppressPastNoindex } from '@/lib/events/series-seo'
import { getSeriesDisplayConfig } from '@/lib/events/series-config'

// Public share URL for an event (SCAN-636 / ADR-1440). Same ISR window and
// column-safe RPC as /discover/events/[slug]. Auth during render is a dynamic
// API and would void that window; signed-in members are rewritten to
// /events/<slug>/full (event-member-page.tsx) so RSVP and host tools stay
// on the existing page. The (main) layout auth read is SCAN-641.
export const revalidate = 3600

export async function generateStaticParams() {
  const events = await getPublicEvents(200).catch(() => [])
  return events.map((e) => ({ slug: e.slug }))
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const event = await getPublicEventBySlug(slug)
  if (!event) return { title: 'Event not found' }

  const where = event.city ? ` in ${event.city}` : ''
  const full =
    event.description ??
    `${event.title}: a Frequency community event${where}. Sign in to RSVP.`
  const description = full.length > 155 ? `${full.slice(0, 152).trimEnd()}…` : full
  const ogTitle = `${event.title} · ${SITE_NAME}`
  const ended = hasEventEnded(event)
  const facts = await seriesSeoFactsBySlug(event.slug)
  const { indexedOccurrences } = await getSeriesDisplayConfig()
  const pastRobots = ended && !suppressPastNoindex(facts) ? ({ index: false, follow: true } as const) : undefined
  const robots = pastRobots ?? seriesRobots(facts, indexedOccurrences)
  return {
    title: event.title,
    description,
    alternates: { canonical: `/events/${event.slug}` },
    ...(robots ? { robots } : {}),
    openGraph: {
      title: ogTitle,
      description,
      url: `/events/${event.slug}`,
      type: 'article',
    },
    twitter: { card: 'summary_large_image', title: ogTitle, description },
  }
}

export default async function PublicEventPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const event = await getPublicEventBySlug(slug)
  if (!event) notFound()

  const enrichment = await getEventEnrichment(slug)
  const hasEnded = hasEventEnded(event)

  return (
    <EventDetailTemplate
      structuredData={
        <JsonLd
          data={[
            eventSchema({ ...event, ...(enrichment ?? {}) }),
            breadcrumbSchema([
              { name: 'Events', path: '/events' },
              { name: event.title, path: `/events/${event.slug}` },
            ]),
          ]}
        />
      }
      cover={
        enrichment?.cover_url ? (
          <PosterBand
            src={enrichment.cover_url}
            heightClass={eventPosterHeightClass('standard')}
            maxHeightClass={eventPosterMaxHeightClass('standard')}
            aspect={enrichment.cover_aspect ?? null}
            focus={enrichment.cover_focus ?? null}
          />
        ) : undefined
      }
      back={{ href: '/events', label: 'Events' }}
      title={event.title}
      badges={
        hasEnded ? (
          <span className="inline-block text-meta px-2 py-1 rounded-md font-medium bg-surface-elevated text-muted">
            This event has ended
          </span>
        ) : undefined
      }
      identity={{
        when: (
          <div className="flex items-center gap-2">
            <CalendarDays className="w-4 h-4 text-primary-strong shrink-0" />
            <span className="text-body font-semibold text-text">{formatEventDateTime(event.starts_at)}</span>
          </div>
        ),
        where: (
          <div className="flex items-center gap-2">
            <MapPin className="w-4 h-4 text-subtle shrink-0" />
            <span>{event.city ?? 'Location shared with members'}</span>
          </div>
        ),
        hostedBy:
          event.circle_name && event.circle_id ? (
            <p>
              <span className="text-subtle">Hosted by </span>
              <Link
                href={`/discover/circles/${event.circle_id}`}
                className="text-primary-strong hover:underline font-medium"
              >
                {event.circle_name}
              </Link>
            </p>
          ) : null,
      }}
      interiorMain={
        <>
          {event.description ? (
            <section className="mb-8">
              <p className="text-body-lg text-muted leading-relaxed whitespace-pre-line">
                {event.description}
              </p>
            </section>
          ) : (
            <section className="mb-8">
              <p className="text-body-lg text-muted leading-relaxed">
                A real-world gathering near you: a standing time, a handful of regulars, and a seat
                that gets noticed when it&apos;s empty. The kind of plan that pulls you off the couch
                and into a room where people are glad you came.
              </p>
            </section>
          )}
          <div className="flex items-start gap-3 rounded-card border border-border bg-marketing-canvas p-4">
            <Lock className="w-4 h-4 text-muted shrink-0 mt-0.5" />
            <p className="text-body-sm text-muted leading-relaxed">
              The exact venue is shared with members who RSVP. Sign up free to see the full
              details and let the host know you&apos;re coming.
            </p>
          </div>
        </>
      }
      interiorSide={
        <SignInCta
          title={hasEnded ? 'Catch the next one' : `Want to be at ${event.title}?`}
          body={
            hasEnded
              ? 'This one has passed, but somewhere near you another circle is already deciding on the next. Find it, and be one of the faces the next person walks in and recognizes.'
              : "RSVP and you're expected: see who else is coming, get the exact venue, and let the host know to save you a seat."
          }
          action={BETA_CTA_LABEL}
          href={BETA_CTA_HREF}
        />
      }
    />
  )
}
