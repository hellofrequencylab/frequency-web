import { notFound } from 'next/navigation'
import Link from 'next/link'
import { CalendarPlus, CalendarDays } from 'lucide-react'
import { getMyProfileId } from '@/lib/auth'
import { loadCircleShell } from '@/lib/circles/store'
import { circleCapabilities } from '@/lib/circles/detail-access'
import { SectionHeader } from '@/components/ui/section-header'
import { EmptyState } from '@/components/ui/empty-state'
import { buttonClasses } from '@/components/ui/button'
import { UpcomingEventRows } from '@/components/events/upcoming-event-rows'
import { circleEventInsider, loadCircleUpcomingEvents } from '../tab-facts'

// ── THE EVENTS TAB ──────────────────────────────────────────────────────────────────────────────
//
// A BODY, not a shell: the cover, the title and the tab strip belong to the route-segment layout
// one directory up, which owns the single page <h1> (composing a template here would emit a second
// one and trip `check:headers`).
//
// WHAT CHANGED. This used to be a five-row teaser in the Circle's info rail with a "See all events"
// link that pointed at the GLOBAL events index, so the honest answer to "what is this Circle doing
// next month" was on a page about everybody's events. On its own tab it is the Circle's calendar:
// the same selection rules, the same rows, thirty of them instead of five.
//
// THE TAB ONLY EXISTS WHEN THERE IS SOMETHING ON IT (lib/circles/tabs.ts), so the empty state below
// is not the resting state a visitor lands on. It is the race a manager can hit by cancelling the
// last event in another window, plus the belt-and-braces case where the strip's memoized count and
// this read disagree. Both callers derive the same `insider` key precisely so they usually cannot.
//
// SELECTION RULES (which events belong to a Circle, who may see them listed, how a repeating series
// folds to one row) are pure and unit-tested in lib/events/circle-upcoming.ts + lib/events/series.ts.
// The read is the shell's own memoized loader, so this tab costs nothing the header did not already
// pay for.

export const metadata = { title: 'Events' }

export default async function CircleEventsPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params

  // The same request-memoized load the shell made: a hit, not a second pair of queries.
  const shell = await loadCircleShell(slug)
  if (!shell) notFound()
  const { circle, members } = shell

  const [myProfileId, caps] = await Promise.all([getMyProfileId(), circleCapabilities(circle.id)])
  const isMember = !!myProfileId && members.some((m) => m.profile?.id === myProfileId)
  const isHost = !!myProfileId && circle.host?.id === myProfileId
  const canManage = caps.has('circle.editSettings')

  // Same key the shell used, so this is a memo hit and the strip's count and this list agree.
  const { events, hasMore } = await loadCircleUpcomingEvents(
    circle.id,
    circleEventInsider({ isMember, isHost }),
  )

  return (
    <section aria-labelledby="circle-events-heading" className="space-y-4">
      <SectionHeader
        id="circle-events-heading"
        title="Coming up"
        count={events.length || undefined}
        description={
          isMember || canManage
            ? 'Every gathering this circle has booked, soonest first. A repeating event shows its next date.'
            : 'The gatherings this circle has booked, soonest first.'
        }
      />

      {events.length === 0 ? (
        canManage ? (
          <EmptyState
            icon={CalendarPlus}
            title="Nothing on the calendar yet"
            description="Pick a date, add the details, and post it. It shows up here and on the Events page."
            action={
              <Link href={`/events/new?circle=${circle.id}`} className={buttonClasses('primary', 'sm')}>
                Create an event
              </Link>
            }
          />
        ) : (
          <EmptyState
            icon={CalendarDays}
            title="Nothing on the calendar yet"
            description="Gatherings for this circle show up here as soon as the host books one."
          />
        )
      ) : (
        <>
          <UpcomingEventRows events={events} />
          {hasMore && (
            <p className="px-1">
              <Link href="/events" className="text-meta font-medium text-primary-strong hover:underline">
                See all events
              </Link>
            </p>
          )}
        </>
      )}
    </section>
  )
}
