import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { CalendarDays, MapPin, Lock } from 'lucide-react'
import { getPublicEventBySlug, formatEventDateTime, hasEventEnded } from '@/lib/discover'
import { getEventEnrichment } from '../_data'
import { SignInCta } from '@/components/discover/cards'
import { FrequencyArcs } from '@/components/marketing/vector-art'
import { EventDetailTemplate } from '@/components/templates'
import { SITE_NAME, BETA_CTA_HREF, BETA_CTA_LABEL } from '@/lib/site'
import { JsonLd } from '@/components/json-ld'
import { eventSchema, breadcrumbSchema } from '@/lib/jsonld'
import { seriesRobots, seriesSeoFactsBySlug, suppressPastNoindex } from '@/lib/events/series-seo'
import { getSeriesDisplayConfig } from '@/lib/events/series-config'

export const revalidate = 3600

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
  // Search snippets truncate around 155 chars — keep the meta description tight.
  const description = full.length > 155 ? `${full.slice(0, 152).trimEnd()}…` : full
  const ogTitle = `${event.title} · ${SITE_NAME}`
  // Expired events keep their links and share card but drop out of the index
  // (noindex, follow). They're isolated in the sitemap too. The page itself stays
  // live until it's pruned, so an old shared link never 404s a real reader.
  const ended = hasEventEnded(event)
  // Series rules apply to the twin too (ADR-897). The canonical below is only a HINT: Google is free
  // to ignore it, so the directive is what actually keeps date twenty of a daily series out of the
  // index. suppressPastNoindex rescues a live series' anchor page here for the same reason it does on
  // /events/<slug>: its own starts_at is in the past forever while the series keeps meeting.
  const facts = await seriesSeoFactsBySlug(event.slug)
  const { indexedOccurrences } = await getSeriesDisplayConfig()
  const pastRobots = ended && !suppressPastNoindex(facts) ? ({ index: false, follow: true } as const) : undefined
  const robots = pastRobots ?? seriesRobots(facts, indexedOccurrences)
  return {
    title: event.title,
    description,
    // The canonical public event page is /events/<slug> (the in-app, shareable URL). This discover
    // detail stays crawlable but consolidates its SEO signal there, so the two don't compete.
    alternates: { canonical: `/events/${event.slug}` },
    ...(robots ? { robots } : {}),
    openGraph: {
      title: ogTitle,
      description,
      url: `/discover/events/${event.slug}`,
      type: 'article',
    },
    twitter: { card: 'summary_large_image', title: ogTitle, description },
  }
}

export default async function EventPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const event = await getPublicEventBySlug(slug)
  if (!event) notFound()

  // Privacy-safe B1 enrichment (attendance mode, city-level region/country) for
  // the schema.org Event. Best-effort: the page renders fully without it.
  const enrichment = await getEventEnrichment(slug)

  const hasEnded = hasEventEnded(event)

  return (
    // The marketing frame stays the PAGE's own wrapper (arcs, generous vertical rhythm); the event
    // itself renders through the standard block layout, so the public twin and the in-app page are
    // the same shape. Its differences are ABSENT SLOTS — an anonymous reader gets no operator
    // actions, no gallery, no module engine, no RSVP bar — never a fork inside the template.
    // Widened from max-w-3xl so the standard's two-column interior has room to breathe.
    <div className="relative overflow-hidden max-w-5xl mx-auto px-6 py-20 sm:py-24">
      {/* Frequency arcs radiating up under the event, tying it to a real place. */}
      <FrequencyArcs
        aria-hidden
        className="pointer-events-none absolute -top-10 right-0 w-[28rem] max-w-none text-primary opacity-[0.05]"
      />

      <EventDetailTemplate
        structuredData={
          <JsonLd
            data={[
              eventSchema({ ...event, ...(enrichment ?? {}) }),
              breadcrumbSchema([
                { name: 'Discover', path: '/discover' },
                { name: 'Events', path: '/discover/events' },
                { name: event.title, path: `/discover/events/${event.slug}` },
              ]),
            ]}
          />
        }
        // Nothing to RSVP to while signed out, so no sticky bar and no space reserved for one.
        hasActionBar={false}
        back={{ href: '/discover/events', label: 'Events' }}
        title={event.title}
        badges={
          hasEnded ? (
            <span className="inline-block text-xs px-2 py-1 rounded-md font-medium bg-surface-elevated text-muted">
              This event has ended
            </span>
          ) : undefined
        }
        identity={{
          when: (
            <div className="flex items-center gap-2">
              <CalendarDays className="w-4 h-4 text-primary-strong shrink-0" />
              <span className="text-base font-semibold text-text">{formatEventDateTime(event.starts_at)}</span>
            </div>
          ),
          // City only. The exact venue never reaches an anonymous reader (ADR-186), so the
          // where-line says where the room is, not which door.
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
            {/* Description */}
            {event.description ? (
              <section className="mb-8">
                <p className="text-lg text-muted leading-relaxed whitespace-pre-line">
                  {event.description}
                </p>
              </section>
            ) : (
              <section className="mb-8">
                <p className="text-lg text-muted leading-relaxed">
                  A real-world gathering near you: a standing time, a handful of regulars, and a seat
                  that gets noticed when it&apos;s empty. The kind of plan that pulls you off the couch
                  and into a room where people are glad you came.
                </p>
              </section>
            )}

            {/* Location-protected notice */}
            <div className="flex items-start gap-3 rounded-2xl border border-border bg-marketing-canvas p-4">
              <Lock className="w-4 h-4 text-muted shrink-0 mt-0.5" />
              <p className="text-sm text-muted leading-relaxed">
                The exact venue is shared with members who RSVP. Sign up free to see the full
                details and let the host know you&apos;re coming.
              </p>
            </div>
          </>
        }
        // The side column is where the standard puts the RSVP card. Signed out, the equivalent ask
        // is the induction: someone reading a single event is ready to show up, so offer it right
        // here where intent peaks instead of bouncing them to /sign-in. Copy fits whether the event
        // is upcoming or already passed.
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
    </div>
  )
}
