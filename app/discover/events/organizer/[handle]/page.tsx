import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { createPublicClient } from '@/lib/supabase/public'
import type { PublicEvent } from '@/lib/discover'
import { JsonLd } from '@/components/json-ld'
import { breadcrumbSchema, eventListSchema, personSchema } from '@/lib/jsonld'
import { OG_SITE, SITE_NAME } from '@/lib/site'
import { avatarSrc } from '@/lib/images/avatar-focus'
import { dayInZone, HOME_TZ } from '@/lib/time/zone'
import { FrequencyOrganizer } from '@/components/frequency/site/pages/discover/frequency-discover-events'

export const revalidate = 3600

// ── Data: a host's PUBLIC events (Events B-4, narrowed by ADR-899) ───────────
// One crawlable link with everything a host is running publicly (Partiful
// pattern). Reads the public_organizer_events RPC, which returns city only (never
// the venue) and only PUBLISHED, PUBLIC, non-removed, non-demo events on a
// network-visible active Space. Never draft, removed, unlisted, circle_only or
// private: this page is self-canonical, sitemap-enumerated and emits Event
// JSON-LD, so it is a listing, and 'unlisted' is a link, not a listing (ADR-202).
// The RPC always returns the host identity (one host-only row when they have no
// listable events), so we can render the profile even before any event is public.

type OrganizerRow = {
  host_id: string
  host_display_name: string | null
  host_handle: string | null
  host_avatar_url: string | null
  id: string | null
  slug: string | null
  title: string | null
  description: string | null
  starts_at: string | null
  ends_at: string | null
  city: string | null
  circle_id: string | null
  circle_name: string | null
  is_past: boolean | null
}

type Organizer = {
  id: string
  displayName: string
  handle: string
  avatarUrl: string | null
  upcoming: PublicEvent[]
  past: PublicEvent[]
}

function toPublicEvent(r: OrganizerRow): PublicEvent {
  return {
    id: r.id!,
    slug: r.slug!,
    title: r.title!,
    description: r.description,
    starts_at: r.starts_at!,
    ends_at: r.ends_at,
    city: r.city,
    circle_id: r.circle_id,
    circle_name: r.circle_name,
    price_cents: null,
  }
}

async function getOrganizer(handle: string): Promise<Organizer | null> {
  const supabase = createPublicClient()
  const { data, error } = await supabase.rpc('public_organizer_events', { _handle: handle })
  if (error || !Array.isArray(data) || data.length === 0) return null

  const rows = data as OrganizerRow[]
  const head = rows[0]
  if (!head.host_handle) return null

  const upcoming: PublicEvent[] = []
  const past: PublicEvent[] = []
  for (const r of rows) {
    if (!r.id || !r.slug) continue // host-only row (no listable events)
    if (r.is_past) past.push(toPublicEvent(r))
    else upcoming.push(toPublicEvent(r))
  }
  // Past events read newest-first (most recent at the top).
  past.sort((a, b) => new Date(b.starts_at).getTime() - new Date(a.starts_at).getTime())

  return {
    id: head.host_id,
    displayName: head.host_display_name ?? 'A Frequency host',
    handle: head.host_handle,
    avatarUrl: head.host_avatar_url,
    upcoming,
    past,
  }
}

// Pre-render the hosts the sitemap already advertises. public_organizer_handles is
// the companion of the RPC above and carries the same ADR-899 gate, so we only
// prerender handles that have at least one listable upcoming event, and its _limit
// bounds the set (500, matching app/sitemap.ts). Without this the route never enters
// the prerender manifest and `revalidate` above is inert. A host whose first public
// event lands later still renders on demand (dynamicParams defaults true).
// Falls back to [] when Supabase credentials are absent (CI / preview without env vars).
export async function generateStaticParams() {
  try {
    const supabase = createPublicClient()
    const { data } = await supabase.rpc('public_organizer_handles', { _limit: 500 })
    if (!Array.isArray(data)) return []
    return (data as { handle: string }[])
      .filter((h) => !!h.handle)
      .map((h) => ({ handle: h.handle }))
  } catch {
    return []
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ handle: string }>
}): Promise<Metadata> {
  const { handle } = await params
  const organizer = await getOrganizer(handle)
  if (!organizer) return { title: 'Host not found' }

  const count = organizer.upcoming.length
  const title = `Events by ${organizer.displayName}`
  const description =
    count > 0
      ? `${organizer.displayName} is hosting ${count} upcoming ${count === 1 ? 'event' : 'events'} on Frequency. See what's coming up and RSVP.`
      : `${organizer.displayName} hosts real-world gatherings on Frequency. Follow along for what's coming up next.`
  const ogTitle = `${title} · ${SITE_NAME}`

  return {
    title,
    description,
    alternates: { canonical: `/discover/events/organizer/${organizer.handle}` },
    openGraph: {
      ...OG_SITE,
      title: ogTitle,
      description,
      url: `/discover/events/organizer/${organizer.handle}`,
      type: 'profile',
    },
    twitter: { card: 'summary_large_image', title: ogTitle, description },
  }
}

export default async function OrganizerPage({
  params,
}: {
  params: Promise<{ handle: string }>
}) {
  const { handle } = await params
  const organizer = await getOrganizer(handle)
  if (!organizer) notFound()

  const { displayName, handle: hostHandle, avatarUrl, upcoming, past } = organizer
  return (
    <>
      <JsonLd
        data={[
          personSchema({
            name: displayName,
            path: `/discover/events/organizer/${hostHandle}`,
            image: avatarUrl ? avatarSrc(avatarUrl) : avatarUrl,
          }),
          breadcrumbSchema([
            { name: 'Discover', path: '/discover' },
            { name: 'Events', path: '/discover/events' },
            { name: displayName, path: `/discover/events/organizer/${hostHandle}` },
          ]),
          eventListSchema(upcoming, `Upcoming events hosted by ${displayName}`),
        ]}
      />
      <FrequencyOrganizer
        displayName={displayName}
        avatarUrl={avatarUrl}
        upcoming={upcoming}
        past={past}
        today={dayInZone(new Date(), HOME_TZ)}
      />
    </>
  )
}
