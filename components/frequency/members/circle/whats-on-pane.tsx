import Link from 'next/link'
import type { ReactNode } from 'react'
import '@/app/themes/active/members-b'
import type { CircleUpcomingEvent } from '@/lib/events/circle-upcoming'
import { goingCountsByEvent } from '@/lib/events/going-counts'
import { HOME_TZ, dayInZone } from '@/lib/time/zone'

// CIRCLE WHAT'S HAPPENING PANE (templates/members/Circle.html, the Events tab): this week's practice,
// the Circle's calendar as day / title / going rows, then the Journey it is walking and its tasks.
// The page keeps every read and gate and passes the action nodes (Log practice, the Journey meter,
// the task list) through untouched.

const DAY_MS = 24 * 60 * 60 * 1000

function dayCell(iso: string, now: Date): string {
  // Stored as the event's wall clock in UTC parts.
  const d = new Date(iso)
  const weekday = d.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' })
  const out = Math.round(
    (Date.parse(`${iso.slice(0, 10)}T00:00:00Z`) - Date.parse(`${dayInZone(now, HOME_TZ)}T00:00:00Z`)) / DAY_MS,
  )
  return out >= 0 && out < 7 ? weekday : `${weekday} ${d.getUTCDate()}`
}

export async function FqWhatsOnPane({
  practice,
  events,
  hasMore,
  journey,
  tasks,
  empty,
}: {
  practice: { title: string; description: string | null; log: ReactNode } | null
  events: CircleUpcomingEvent[]
  hasMore: boolean
  journey: ReactNode
  tasks: ReactNode
  empty: ReactNode | null
}) {
  const counts = events.length > 0 ? await goingCountsByEvent(events.map((e) => e.id)) : {}
  const now = new Date()
  return (
    <div className="stack fqm-secs">
      {empty}
      {practice && (
        <div className="panel stack">
          <span className="k">This week&apos;s practice</span>
          <span className="h3">{practice.title}</span>
          {practice.description && <span className="t2">{practice.description}</span>}
          {practice.log}
        </div>
      )}
      {events.length > 0 && (
        <div className="stack">
          <span className="h2">Coming up</span>
          <div className="list">
            {events.map((e) => (
              <Link key={e.id} href={`/events/${e.slug}`}>
                <span className="t2 fqm-time">{dayCell(e.starts_at, now)}</span>
                <span className="t1 grow">{e.title}</span>
                {(counts[e.id] ?? 0) > 0 && <span className="t2">{counts[e.id]} going</span>}
              </Link>
            ))}
          </div>
          {hasMore && (
            <Link className="btn sm fqm-tag-start" href="/events">
              See all events
            </Link>
          )}
        </div>
      )}
      {journey}
      {tasks}
    </div>
  )
}
