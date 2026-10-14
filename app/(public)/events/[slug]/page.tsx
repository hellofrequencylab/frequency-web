import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { CalendarDays, MapPin, Lock } from 'lucide-react'
import { getPublicEventBySlug, getPublicEvents, formatEventDateTime, hasEventEnded } from '@/lib/discover'
import { getEventEnrichment, EVENT_CATEGORIES } from '@/app/discover/events/_data'
import { getPublicEventVenue } from '@/lib/events/public-venue'
import { publicPageWhere } from '@/lib/events/visible-location'
import { SignInCta } from '@/components/discover/cards'
import { Card } from '@/components/marketing/marketing-ui'
import { loadPublicJoinDoor } from '@/lib/events/public-join-door'
import { PublicJoinDoorBox, publicJoinHeading } from '@/components/events/public-join-door'
import { SITE_DESIGN } from '@/lib/theme/design'
import { FqPublicEventBody } from '@/components/frequency/members/event/public-event-body'
import { EventDetailTemplate } from '@/components/templates'
import { PosterBand } from '@/components/media/poster-band'
import { eventPosterHeightClass, eventPosterMaxHeightClass } from '@/lib/events/hero-height'
import { OG_SITE, SITE_NAME, BETA_CTA_HREF, BETA_CTA_LABEL } from '@/lib/site'
import { JsonLd } from '@/components/json-ld'
import { eventSchema, breadcrumbSchema } from '@/lib/jsonld'
import { seriesRobots, seriesSeoFactsBySlug, suppressPastNoindex } from '@/lib/events/series-seo'
import { getSeriesDisplayConfig } from '@/lib/events/series-config'

// Public share URL for an event (SCAN-636 / ADR-1440). Same ISR window and
// column-safe RPC as /discover/events/[slug]. Auth during render is a dynamic
// API and would void that window; signed-in members are rewritten to
// /events/<slug>/full (event-member-page.tsx) so RSVP and host tools stay
// on the existing page. This file lives outside (main) so the share URL
// is not voided by that layout's cookies()/headers() (SCAN-643).
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
    `${event.title}: a Frequency community event${where}. RSVP here, no account needed.`
  const description = full.length > 155 ? `${full.slice(0, 152).trimEnd()}…` : full
  const ogTitle = `${event.title} · ${SITE_NAME}`
  const ended = hasEventEnded(event)
  const [facts, { indexedOccurrences }] = await Promise.all([seriesSeoFactsBySlug(event.slug), getSeriesDisplayConfig()])
  const pastRobots = ended && !suppressPastNoindex(facts) ? ({ index: false, follow: true } as const) : undefined
  const robots = pastRobots ?? seriesRobots(facts, indexedOccurrences)
  return {
    title: event.title,
    description,
    alternates: { canonical: `/events/${event.slug}` },
    ...(robots ? { robots } : {}),
    openGraph: {
      ...OG_SITE,
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

  // The exact venue for the JSON-LD (ADR-1743): published only when the host left the address
  // visible. getPublicEventVenue applies the flag server-side and returns no venue otherwise.
  // The join door (lib/events/public-join-door.ts): guest RSVP or guest ticket, decided with the
  // member page's own signed-out rules from cookie-free reads. Null when it could not be read, which
  // keeps the plain sign-up card below.
  const [enrichment, venue, joined] = await Promise.all([
    getEventEnrichment(slug),
    getPublicEventVenue(slug),
    loadPublicJoinDoor(event.id),
  ])
  const hasEnded = hasEventEnded(event)
  // The where-line (ADR-1744, owner-ruled 2026-10-14): the venue and street plus the city when the
  // host left the address visible, the city alone otherwise. Same server-side read as the JSON-LD,
  // so the visible page and the structured data agree, and a hidden venue never reaches the HTML.
  // SCAN-867: an event with no city of its own takes its host Space's city, and a visible address
  // kept only in the free-text line is shown (and published) as the venue.
  const city = event.city?.trim() || venue.area?.city || null
  const region = venue.area?.region ?? null
  const where = publicPageWhere({
    hide_address: venue.hide_address,
    venue: venue.venue,
    city,
    location: venue.venue?.location,
  })

  const structuredData = (
    <JsonLd
      data={[
        eventSchema({
          ...event,
          ...(enrichment ?? {}),
          city,
          region: enrichment?.region ?? region,
          hide_address: venue.hide_address,
          venue: venue.venue,
        }),
        breadcrumbSchema([
          { name: 'Events', path: '/events' },
          { name: event.title, path: `/events/${event.slug}` },
        ]),
      ]}
    />
  )
  const whereLine = (
    <>
      {where.line ?? 'Location shared with guests who RSVP'}
      {where.mapsHref ? (
        <>
          {' · '}
          <a href={where.mapsHref} target="_blank" rel="noopener noreferrer">
            Get directions
          </a>
        </>
      ) : null}
    </>
  )
  const joinBox = joined ? <PublicJoinDoorBox door={joined.door} eventId={event.id} slug={event.slug} /> : null
  const signUpCard = (
    <SignInCta
      title={hasEnded ? 'Catch the next one' : `Want to be at ${event.title}?`}
      body={
        hasEnded
          ? 'This one has passed, but somewhere near you another circle is already deciding on the next. Find it, and be one of the faces the next person walks in and recognizes.'
          : where.exact
            ? "RSVP and you're expected: see who else is coming and let the host know to save you a seat."
            : "RSVP and you're expected: see who else is coming, get the exact venue, and let the host know to save you a seat."
      }
      action={BETA_CTA_LABEL}
      href={BETA_CTA_HREF}
    />
  )
  const host =
    event.circle_name && event.circle_id
      ? { name: event.circle_name, href: `/discover/circles/${event.circle_id}` }
      : null

  // THE FREQUENCY BODY (ADR-1737 switch, templates/members/Event.html). The owner's 2026-10-14 ask
  // ("public event pages look like trash"): the share page wears the reference's event anatomy,
  // which the member page keeps switched off by its own earlier ruling. Same reads, same privacy
  // rules; only the placement changes. Build-time constant, so the DAWN return below is untouched.
  if (SITE_DESIGN === 'frequency') {
    const mode = enrichment?.attendance_mode ?? 'in_person'
    const category = EVENT_CATEGORIES.find((c) => c.values.includes(enrichment?.category ?? 'gathering'))
    const kind = category ? category.nounSingular.charAt(0).toUpperCase() + category.nounSingular.slice(1) : 'Gathering'
    return (
      <FqPublicEventBody
        structuredData={structuredData}
        heroUrl={enrichment?.cover_url ?? null}
        heroFocus={enrichment?.cover_focus ?? null}
        modeLabel={mode === 'online' ? 'Online' : mode === 'hybrid' ? 'Hybrid' : 'In person'}
        kicker={[event.circle_name, kind].filter(Boolean).join(' · ')}
        title={event.title}
        status={
          enrichment?.is_cancelled ? (
            <span className="tag">This event was cancelled</span>
          ) : hasEnded ? (
            <span className="tag">This event has ended</span>
          ) : null
        }
        whenLine={formatEventDateTime(event.starts_at)}
        where={whereLine}
        going={joined?.going ?? null}
        joinHeading={joined ? publicJoinHeading(joined.door) : 'Join this event'}
        joinBox={joinBox ?? signUpCard}
        about={
          event.description ??
          "A real-world gathering near you: a standing time, a handful of regulars, and a seat that gets noticed when it's empty."
        }
        whereNote={where.exact ? null : 'The exact venue is shared with guests who RSVP.'}
        host={host}
      />
    )
  }

  return (
    <EventDetailTemplate
      structuredData={structuredData}
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
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <MapPin className="w-4 h-4 text-subtle shrink-0" />
            <span>{where.line ?? 'Location shared with members'}</span>
            {where.mapsHref ? (
              <a
                href={where.mapsHref}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary-strong hover:underline font-medium whitespace-nowrap"
              >
                Get directions
              </a>
            ) : null}
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
          {where.exact ? null : (
            <div className="flex items-start gap-3 rounded-card border border-border bg-marketing-canvas p-4">
              <Lock className="w-4 h-4 text-muted shrink-0 mt-0.5" />
              <p className="text-body-sm text-muted leading-relaxed">
                The exact venue is shared with members who RSVP. Sign up free to see the full
                details and let the host know you&apos;re coming.
              </p>
            </div>
          )}
        </>
      }
      interiorSide={
        joinBox && joined ? (
          <Card tone="feature" pad="p-6">
            <p className="text-body-lg font-bold text-text mb-3">{publicJoinHeading(joined.door)}</p>
            {joinBox}
          </Card>
        ) : (
          signUpCard
        )
      }
    />
  )
}
