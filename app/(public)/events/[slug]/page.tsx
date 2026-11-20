import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { cache } from 'react'
import { localSearchTitle, searchDescription } from '@/lib/discover-search-copy'
import { loadSeriesDates } from '@/lib/events/series-dates'
import { getPublicEventBySlug, getPublicEvents, getPublicCircleById, formatEventDateTime, hasEventEnded } from '@/lib/discover'
import { getEventEnrichment, EVENT_CATEGORIES } from '@/app/discover/events/_data'
import { getPublicEventVenue } from '@/lib/events/public-venue'
import { publicPageWhere } from '@/lib/events/visible-location'
import { SignInCta } from '@/components/discover/cards'
import { loadPublicJoinDoor } from '@/lib/events/public-join-door'
import { PublicJoinDoorBox, publicJoinHeading } from '@/components/events/public-join-door'
import { FqPublicEventBody } from '@/components/frequency/members/event/public-event-body'
import { OG_SITE, SITE_NAME, BETA_CTA_HREF, BETA_CTA_LABEL } from '@/lib/site'
import { formatEventDate, eventDateBadge } from '@/lib/utils'
import { JsonLd } from '@/components/json-ld'
import { missingPageMetadata } from '@/lib/seo/not-found-metadata'
import { eventSchema, breadcrumbSchema } from '@/lib/jsonld'
import { publicEventIndexPlan, shareEventSeo } from '@/lib/events/series-seo'
import { getSeriesDisplayConfig } from '@/lib/events/series-config'

// Public share URL for an event (SCAN-636 / ADR-1440). Same ISR window and
// column-safe RPC as /discover/events/[slug]. Auth during render is a dynamic
// API and would void that window; signed-in members are rewritten to
// /events/<slug>/full (event-member-page.tsx) so RSVP and host tools stay
// on the existing page. This file lives outside (main) so the share URL
// is not voided by that layout's cookies()/headers() (SCAN-643).
export const revalidate = 3600

const readShareSeo = cache(shareEventSeo)
const readPublicVenue = cache(getPublicEventVenue)

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
  if (!event) return missingPageMetadata('Event not found')

  const [seo, { indexedOccurrences }, venue] = await Promise.all([
    readShareSeo(event.slug),
    getSeriesDisplayConfig(),
    readPublicVenue(event.slug),
  ])
  const localizedTitle = localSearchTitle(event.title, venue.area?.city ?? event.city)
  const description = searchDescription(
    event.description,
    `Find the date, location and RSVP details for ${localizedTitle} on Frequency.`,
  )
  const ended = hasEventEnded({ ...event, time_zone: seo.timeZone })
  // A recurring event's occurrences share one name, so each indexed date carries its day in the title
  // (24 pages read "Circle Night · Frequency" on the live sitemap). The series anchor keeps the bare
  // name: its stored start is the first meeting, not the next one.
  const title = seo.facts.isAnchor ? localizedTitle : `${localizedTitle} · ${formatEventDate(event.starts_at)}`
  const ogTitle = `${title} · ${SITE_NAME}`
  // SCAN-1014 / ADR-1751: an unlisted event is a link, not a listing. The plan noindexes it and
  // omits the canonical; a public date still uses the past and series rules, with a self-canonical.
  const plan = publicEventIndexPlan({
    visibility: seo.visibility,
    ended,
    facts: seo.facts,
    indexedOccurrences,
  })
  return {
    title,
    description,
    ...(plan.canonical ? { alternates: { canonical: `/events/${event.slug}` } } : {}),
    ...(plan.robots ? { robots: plan.robots } : {}),
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
  // The host Circle's public row (SCAN-1276): linked by its slug, the address a reader lands on,
  // and not linked at all when the Circle is unlisted (public_circle_by_id returns nothing for it,
  // and /discover/circles/<id> would 404). A read error is the same as no row.
  const [enrichment, venue, joined, seo, hostCircle] = await Promise.all([
    getEventEnrichment(slug),
    readPublicVenue(event.slug),
    loadPublicJoinDoor(event.id),
    readShareSeo(event.slug),
    event.circle_id ? getPublicCircleById(event.circle_id).catch(() => null) : Promise.resolve(null),
  ])
  const seriesDates = seo.visibility === 'public' && seo.series
    ? await loadSeriesDates({ ...seo.series, publicOnly: true })
    : []
  // Reuse the public route's resolver to enforce active Space and demo exclusions before linking.
  const upcomingDates = await Promise.all(seriesDates.map(async (date) => {
    if (date.isCurrent || !date.slug) return null
    const sibling = await getPublicEventBySlug(date.slug)
    if (!sibling || hasEventEnded(sibling)) return null
    return { href: `/events/${sibling.slug}`, label: formatEventDateTime(sibling.starts_at) }
  }))
  const hasEnded = hasEventEnded({ ...event, time_zone: enrichment?.time_zone ?? seo.timeZone })
  // The where-line (ADR-1744, owner-ruled 2026-10-14): the venue and street plus the city when the
  // host left the address visible, the city alone otherwise. Same server-side read as the JSON-LD,
  // so the visible page and the structured data agree, and a hidden venue never reaches the HTML.
  // SCAN-867: an event with no city of its own takes its host Space's city, and a visible address
  // kept only in the free-text line is shown (and published) as the venue.
  const city = venue.area?.city || event.city?.trim() || null
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
        ...(seo.visibility === 'public' && !(hasEnded && seo.facts.isAnchor) ? [eventSchema({
          ...event,
          ...(enrichment ?? {}),
          city,
          region: enrichment?.region ?? region,
          hide_address: venue.hide_address,
          venue: venue.venue,
        })] : []),
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
    event.circle_name && hostCircle?.slug
      ? { name: event.circle_name, href: `/discover/circles/${hostCircle.slug}` }
      : enrichment?.host_space
        ? { name: enrichment.host_space.name, href: `/spaces/${enrichment.host_space.slug}` }
        : null
  const mode = enrichment?.attendance_mode ?? 'in_person'
  const category = EVENT_CATEGORIES.find((c) => c.values.includes(enrichment?.category ?? 'gathering'))
  const kind = category ? category.nounSingular.charAt(0).toUpperCase() + category.nounSingular.slice(1) : 'Gathering'
  const page = (
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
      dateChip={eventDateBadge(event.starts_at)}
      whenLine={formatEventDateTime(event.starts_at)}
      where={whereLine}
      going={joined?.going ?? null}
      joinHeading={joined ? publicJoinHeading(joined.door) : 'Join this event'}
      joinBox={joinBox ?? signUpCard}
      joinHref={BETA_CTA_HREF}
      venuePoint={
        venue.venue?.lat != null && venue.venue?.lng != null ? { lat: venue.venue.lat, lng: venue.venue.lng } : null
      }
      about={
        event.description ??
        "A real-world gathering near you: a standing time, a handful of regulars, and a seat that gets noticed when it's empty."
      }
      whereNote={where.exact ? null : 'The exact venue is shared with guests who RSVP.'}
      host={host}
      upcomingDates={upcomingDates.filter((date) => date !== null)}
    />
  )
  return page
}
