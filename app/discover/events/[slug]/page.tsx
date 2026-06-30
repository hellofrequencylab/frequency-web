import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { CalendarDays, MapPin, Lock, ChevronLeft } from 'lucide-react'
import { getPublicEventBySlug, formatEventDateTime, hasEventEnded } from '@/lib/discover'
import { getEventEnrichment } from '../_data'
import { InlineBetaCapture } from '@/components/discover/inline-beta-capture'
import { FrequencyArcs } from '@/components/marketing/vector-art'
import { DetailTemplate } from '@/components/templates'
import { SITE_NAME } from '@/lib/site'
import { JsonLd } from '@/components/json-ld'
import { eventSchema, breadcrumbSchema } from '@/lib/jsonld'

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
  return {
    title: event.title,
    description,
    // The canonical public event page is /events/<slug> (the in-app, shareable URL). This discover
    // detail stays crawlable but consolidates its SEO signal there, so the two don't compete.
    alternates: { canonical: `/events/${event.slug}` },
    ...(ended ? { robots: { index: false, follow: true } } : {}),
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
    <div className="relative overflow-hidden max-w-3xl mx-auto px-6 py-20 sm:py-24">
      {/* Frequency arcs radiating up under the event, tying it to a real place. */}
      <FrequencyArcs
        aria-hidden
        className="pointer-events-none absolute -top-10 right-0 w-[28rem] max-w-none text-primary opacity-[0.05]"
      />
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

      <Link
        href="/discover/events"
        className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-muted transition-colors hover:text-text"
      >
        <ChevronLeft className="h-4 w-4" />
        Events
      </Link>

      <DetailTemplate
        title={event.title}
        subtitle={
          <div className="space-y-2 text-sm">
            <div className="flex items-center gap-2 text-text">
              <CalendarDays className="w-4 h-4 text-muted shrink-0" />
              <span>{formatEventDateTime(event.starts_at)}</span>
            </div>
            <div className="flex items-center gap-2 text-muted">
              <MapPin className="w-4 h-4 shrink-0" />
              <span>
                {event.city ?? 'Location shared with members'}
              </span>
            </div>
            {event.circle_name && event.circle_id && (
              <div className="pt-1">
                <span className="text-subtle">Hosted by </span>
                <Link
                  href={`/discover/circles/${event.circle_id}`}
                  className="text-primary-strong hover:underline font-medium"
                >
                  {event.circle_name}
                </Link>
              </div>
            )}
          </div>
        }
        badges={
          hasEnded ? (
            <span className="inline-block text-xs px-2 py-1 rounded-md font-medium bg-surface-elevated text-muted">
              This event has ended
            </span>
          ) : undefined
        }
      >
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
        <div className="flex items-start gap-3 rounded-2xl border border-border bg-marketing-canvas p-4 mb-10">
          <Lock className="w-4 h-4 text-muted shrink-0 mt-0.5" />
          <p className="text-sm text-muted leading-relaxed">
            The exact venue is shared with members who RSVP. Sign up free to see the full
            details and let the host know you&apos;re coming.
          </p>
        </div>

        {/* Inline capture: someone reading a single event is ready to show up.
            Offer the invite right here, where intent peaks, instead of bouncing
            them to /sign-in. Same double-opt-in funnel as the list pages, tagged
            for attribution and with copy that fits whether the event is upcoming
            or already passed. */}
        <InlineBetaCapture
          source={hasEnded ? 'discover_event_detail_ended' : 'discover_event_detail'}
          heading={hasEnded ? 'Catch the next one' : `Want to be at ${event.title}?`}
          body={
            hasEnded
              ? 'This one has passed, but somewhere near you another circle is already deciding on the next. Join the beta to find it, and be one of the faces the next person walks in and recognizes.'
              : 'RSVP and you are expected: see who else is coming, get the exact venue, and let the host know to save you a seat. Join the beta to claim your spot — two words to belong.'
          }
        />
      </DetailTemplate>
    </div>
  )
}
