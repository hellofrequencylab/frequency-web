import Link from 'next/link'
import type { ReactNode } from 'react'
import '@/app/themes/active/members-b'
import '@/app/themes/active/members-circle'
import type { CircleUpcomingEvent } from '@/lib/events/circle-upcoming'
import { loadMeetupPicks } from '@/lib/circles/page-facts'
import { meetupParts } from '@/lib/circles/meetup-when'
import { FqIcon } from '@/components/frequency/icon'
import { GoButton } from '@/components/frequency/members/go-button'

// CIRCLE WHAT'S HAPPENING PANE (templates/circles/Circles.dc.html, the What's happening tab): This week
// (the practice), Coming up (the Circle's calendar as date-tile rows with a Go toggle), the Journey it is
// walking, then How to help. Each section hides when it has nothing. The page keeps every read and gate and
// passes the action nodes (Log practice, the Journey meter, the task list) through untouched. The Go
// toggles share their answers with the Meetups panel: both write the viewer's RSVP.

export async function FqWhatsOnPane({
  practice,
  events,
  hasMore,
  journey,
  tasks,
  empty,
  viewerId = null,
}: {
  practice: { title: string; description: string | null; log: ReactNode } | null
  events: CircleUpcomingEvent[]
  hasMore: boolean
  journey: ReactNode
  tasks: ReactNode
  empty: ReactNode | null
  /** The viewer, for their own Go / Going answers. */
  viewerId?: string | null
}) {
  const now = new Date()
  const rows = events.length > 0 ? await loadMeetupPicks(events, viewerId, false, events.length) : []
  const byId = new Map(rows.map((r) => [r.id, r]))
  return (
    <div className="stack fqm-secs fqc-whats">
      {empty}
      {practice && (
        <section className="stack fqc-sec" aria-label="This week">
          <div>
            <h2 className="h2">This week</h2>
            <p className="fqc-sec-sub">Log it any day, anywhere.</p>
          </div>
          <div className="panel fqc-practice">
            <span className="fq-icon-tile fqc-tile-soft">
              <FqIcon name="breath" />
            </span>
            <div className="fqc-practice-body">
              <span className="t1">{practice.title}</span>
              {practice.description && <span className="t2">{practice.description}</span>}
            </div>
            {practice.log}
          </div>
        </section>
      )}
      {events.length > 0 && (
        <section className="stack fqc-sec" aria-label="Coming up">
          <div className="fqc-sec-head">
            <div>
              <h2 className="h2">
                Coming up <span className="fqc-sec-n">{events.length}</span>
              </h2>
              <p className="fqc-sec-sub">Every gathering this circle has booked, soonest first. A repeating event shows its next date.</p>
            </div>
            <Link className="fqc-meet-all" href="/events">
              All events
            </Link>
          </div>
          <ul className="panel fqc-rows">
            {events.map((e) => {
              const r = byId.get(e.id)
              const parts = meetupParts(e.starts_at, now)
              const meta = [parts.time, e.location, r && r.going > 0 ? `${r.going} going` : null].filter(Boolean).join(' · ')
              return (
                <li key={e.id}>
                  <span className="fqc-daytile">
                    <span>{parts.weekday}</span>
                    <b>{parts.day}</b>
                  </span>
                  <Link className="fqc-row-main" href={`/events/${e.slug}`}>
                    <span className="t1">{e.title}</span>
                    <span className="t2">{meta}</span>
                  </Link>
                  {viewerId ? <GoButton eventId={e.id} slug={e.slug} going={r?.mine === 'going'} /> : null}
                </li>
              )
            })}
          </ul>
          {hasMore && (
            <Link className="btn sm fqm-tag-start" href="/events">
              See all events
            </Link>
          )}
        </section>
      )}
      {journey && <section className="stack fqc-sec fqc-journey">{journey}</section>}
      {tasks && (
        <section className="stack fqc-sec fqc-help" aria-label="How to help">
          <div>
            <h2 className="h2">How to help</h2>
            <p className="fqc-sec-sub">Small jobs that keep the circle going. Claim one.</p>
          </div>
          {tasks}
        </section>
      )}
    </div>
  )
}
