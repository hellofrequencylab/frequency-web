import type { Metadata } from 'next'
import Link from 'next/link'
import Image from 'next/image'
import { notFound } from 'next/navigation'
import { ChevronLeft, CalendarPlus } from 'lucide-react'
import { createPublicClient } from '@/lib/supabase/public'
import type { PublicEvent } from '@/lib/discover'
import { EventRow, SignInCta } from '@/components/discover/cards'
import { FrequencyArcs } from '@/components/marketing/vector-art'
import { SectionHeading } from '@/components/marketing/marketing-ui'
import { DetailTemplate } from '@/components/templates'
import { JsonLd } from '@/components/json-ld'
import { breadcrumbSchema, eventListSchema } from '@/lib/jsonld'
import { SITE_NAME } from '@/lib/site'
import { getInitials } from '@/lib/utils'

export const revalidate = 3600

// ── Data: a host's public/unlisted events (Events B-4) ───────────────────────
// One crawlable link with everything a host is running (Partiful pattern). Reads
// the public_organizer_events RPC, which returns city only (never the venue) and
// only public/unlisted events (never circle_only/private). The RPC always returns
// the host identity (one host-only row when they have no listable events), so we
// can render the profile even before any event is public.

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
    <div className="relative overflow-hidden max-w-3xl mx-auto px-6 py-20 sm:py-24">
      <FrequencyArcs
        aria-hidden
        className="pointer-events-none absolute -top-10 right-0 w-[28rem] max-w-none text-primary opacity-[0.05]"
      />

      <JsonLd
        data={[
          breadcrumbSchema([
            { name: 'Discover', path: '/discover' },
            { name: 'Events', path: '/discover/events' },
            { name: displayName, path: `/discover/events/organizer/${hostHandle}` },
          ]),
          eventListSchema(upcoming, `Upcoming events hosted by ${displayName}`),
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
        title={
          <span className="inline-flex items-center gap-3">
            {avatarUrl ? (
              <Image
                src={avatarUrl}
                alt={displayName}
                width={48}
                height={48}
                className="h-12 w-12 rounded-full object-cover"
              />
            ) : (
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary-bg text-base font-semibold text-primary-strong select-none">
                {getInitials(displayName)}
              </span>
            )}
            {displayName}
          </span>
        }
        subtitle={
          <span>
            Real-world gatherings, in one place. Public pages show the city only; the exact venue
            is shared with members who RSVP.
          </span>
        }
      >
        {/* Subscribe affordance: follow this host's public calendar. The subscribe
            URL is the public events feed for now; signed-in members get the live,
            personal feed from the /events library. */}
        <div className="mb-8 flex items-start gap-3 rounded-2xl border border-border bg-marketing-canvas p-4">
          <CalendarPlus className="mt-0.5 h-4 w-4 shrink-0 text-muted" />
          <p className="text-sm leading-relaxed text-muted">
            Want these on your calendar?{' '}
            <Link href="/sign-in" className="font-medium text-primary-strong hover:underline">
              Sign in
            </Link>{' '}
            and subscribe once. The events you RSVP to land in Google or Apple Calendar and stay
            current on their own.
          </p>
        </div>

        {/* Upcoming */}
        <section className="mb-12">
          <SectionHeading
            eyebrow="On the calendar"
            title={<>Coming <span className="text-primary">up</span></>}
            kicker={
              upcoming.length > 0
                ? 'Pick one, RSVP, and you are expected.'
                : 'Nothing on the public calendar right now.'
            }
          />
          {upcoming.length > 0 ? (
            <div className="mt-6 space-y-3">
              {upcoming.map((e) => (
                <EventRow key={e.id} event={e} />
              ))}
            </div>
          ) : (
            <p className="mt-5 text-base leading-relaxed text-muted">
              {displayName} doesn&rsquo;t have a public event up at the moment. The next one shows
              up here as soon as it&rsquo;s posted.
            </p>
          )}
        </section>

        {/* Past */}
        {past.length > 0 && (
          <section className="mb-12">
            <SectionHeading
              eyebrow="Already happened"
              title={<>Recently <span className="text-primary">hosted</span></>}
              kicker="A sense of the rooms this host puts together."
            />
            <div className="mt-6 space-y-3 opacity-80">
              {past.map((e) => (
                <EventRow key={e.id} event={e} />
              ))}
            </div>
          </section>
        )}

        <SignInCta
          title="Show up to the next one"
          body="Sign up free to RSVP, see who else is coming, and get the exact venue. Two words to belong."
          action="Get started"
        />
      </DetailTemplate>
    </div>
  )
}
