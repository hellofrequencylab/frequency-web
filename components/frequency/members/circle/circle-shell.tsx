import Link from 'next/link'
import type { ReactNode } from 'react'
import { Suspense } from 'react'
import '@/app/themes/active/members-b'
import '@/app/themes/active/members-community'
import { createClient } from '@/lib/supabase/server'
import { goingCountsByEvent } from '@/lib/events/going-counts'
import type { CircleUpcomingEvent } from '@/lib/events/circle-upcoming'
import { meetupWhen } from '@/lib/circles/meetup-when'
import { GoButton } from '@/components/frequency/members/go-button'
import { FqRouteTabs } from '@/components/frequency/members/route-tabs'

// CIRCLE, FREQUENCY SHELL (templates/members/Circle.html). The Circle's route-group layout keeps
// every read and gate it had (draft 404, entry verdict, capabilities, tabs) and hands this file the
// pieces: the cover with its title and buttons, the next meetup, the tab strip over the real tab
// ROUTES (Feed, What's Happening, Members, Circle Stats), and the About / This Circle side panels.
// The tab bodies render as `children`, exactly as under DAWN.

/** The next meetup panel. Streams: the going count and the viewer's own answer are two light reads
 *  the cover should never wait on. Both are the viewer's own RSVP and an event the panel already shows
 *  them, so the session client reads them under RLS; a refused cover read just keeps the bare tile. */
async function NextMeetup({ event, myProfileId }: { event: CircleUpcomingEvent; myProfileId: string | null }) {
  const supabase = await createClient()
  const [counts, mine, cover] = await Promise.all([
    goingCountsByEvent([event.id]),
    myProfileId
      ? supabase
          .from('event_rsvps')
          .select('status')
          .eq('event_id', event.id)
          .eq('profile_id', myProfileId)
          .maybeSingle()
          .then(({ data }) => (data as { status: string } | null)?.status ?? null)
      : Promise.resolve(null),
    // The event's own cover for the photo tile (the reference's 88px thumb). Public bucket, so the
    // URL is the same one the Events list draws; an event with no cover keeps the bare tile.
    supabase
      .from('events')
      .select('cover_image_path')
      .eq('id', event.id)
      .maybeSingle()
      .then(({ data }) => {
        const path = (data as { cover_image_path: string | null } | null)?.cover_image_path
        return path ? supabase.storage.from('event-media').getPublicUrl(path).data.publicUrl : null
      }),
  ])
  const going = counts[event.id] ?? 0
  const line = [meetupWhen(event.starts_at, new Date()), event.location, going > 0 ? `${going} going` : null]
    .filter(Boolean)
    .join(' · ')
  return (
    <div className="panel row wrap fqm-meet">
      <span className="ph" style={cover ? { backgroundImage: `url('${cover}')` } : undefined} />
      <span className="grow stack fqm-row-stack">
        <span className="k">Next meetup</span>
        <Link className="h3" href={`/events/${event.slug}`}>
          {event.title}
        </Link>
        <span className="t2">{line}</span>
      </span>
      {myProfileId ? (
        <GoButton eventId={event.id} slug={event.slug} going={mine === 'going'} />
      ) : (
        <Link className="btn" href={`/events/${event.slug}`}>
          See it
        </Link>
      )}
    </div>
  )
}

export function FqCircleShell({
  notices,
  coverImage,
  statusLabel,
  live,
  name,
  subline,
  invite,
  primary,
  admin,
  sister,
  nextEvent,
  myProfileId,
  tabs,
  tabTools,
  about,
  hostLine,
  memberCount,
  memberCap,
  children,
}: {
  notices: ReactNode
  coverImage: string | null
  statusLabel: string
  /** A live (active, open) Circle wears the breathing dot on its status pill. */
  live: boolean
  name: string
  subline: string
  /** QR & Share, the Circle's invite door. */
  invite: ReactNode
  /** Create (members) or Join (visitors), or the Full marker. */
  primary: ReactNode
  /** Edit and Manage, for a manager only. */
  admin: ReactNode
  sister: ReactNode
  nextEvent: CircleUpcomingEvent | null
  myProfileId: string | null
  tabs: { href: string; label: string; count?: number }[]
  /** Boost and the quiet Leave menu, at the right end of the tab row. */
  tabTools: ReactNode
  about: string | null
  hostLine: ReactNode
  memberCount: number
  memberCap: number
  children: ReactNode
}) {
  const open = Math.max(0, memberCap - memberCount)
  return (
    <>
      <Link className="meta fqm-back" href="/circles">
        ← Circles
      </Link>
      <div className="fqm-notices">{notices}</div>

      <section className="ph fqm-cl-hero" style={coverImage ? { backgroundImage: `url('${coverImage}')` } : undefined}>
        <div className="fqm-cl-in">
          <div className="stack">
            <span className={live ? 'tag glass live' : 'tag glass'}>{statusLabel}</span>
            <h1 className="h1">{name}</h1>
            {subline && <span className="fqm-cl-sub">{subline}</span>}
          </div>
          <div className="row wrap">
            {invite}
            {primary}
            {admin}
          </div>
        </div>
      </section>
      {sister}

      <div className="ap-cols sec">
        <div>
          {nextEvent && (
            <Suspense fallback={null}>
              <NextMeetup event={nextEvent} myProfileId={myProfileId} />
            </Suspense>
          )}
          <div className="fqm-tabrow fqm-cl-tabs">
            {tabs.length > 0 ? <FqRouteTabs tabs={tabs} label="Circle sections" /> : <span />}
            <div className="row">{tabTools}</div>
          </div>
          <div className="fqm-pane">{children}</div>
        </div>
        <aside className="side">
          {about && (
            <div className="panel stack">
              <span className="k">About</span>
              <p className="body fqm-about">{about}</p>
              {hostLine && <span className="t2">{hostLine}</span>}
            </div>
          )}
          <div className="panel stack">
            <span className="k">This Circle</span>
            <div className="g2 fqm-stats">
              <div>
                <span className="num">{memberCount}</span>
                <div className="t2">{memberCount === 1 ? 'Member' : 'Members'}</div>
              </div>
              <div>
                <span className="num">{open}</span>
                <div className="t2">{open === 1 ? 'Seat open' : 'Seats open'}</div>
              </div>
            </div>
            {!about && hostLine && <span className="t2">{hostLine}</span>}
          </div>
        </aside>
      </div>
    </>
  )
}
