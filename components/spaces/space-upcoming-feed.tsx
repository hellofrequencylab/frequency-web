import { SectionHeader } from '@/components/ui/section-header'
import { UpcomingEventRows } from '@/components/events/upcoming-event-rows'
import type { UpcomingFeedRow } from '@/lib/calendar/member-calendar'

// ─────────────────────────────────────────────────────────────────────────────
// THE UP NEXT BAND (LIVE-520, owner ask: "Upcoming events should be featured in a feed").
//
// The band that opens the merged Calendar & Events page: what is next at this Space, soonest
// first, above the control bar and the month grid. A FEED and not a second grid — one gathering
// per full-width row, in reading order — because a card grid above a month grid is two grids,
// which is what a reader has to sort out rather than read.
//
// IT COMPOSES `UpcomingEventRows`, the row list the Channel strip and the Circle module already
// render, rather than authoring a fourth kind of event row (docs/PAGE-FRAMEWORK.md: compose, never
// hand-roll). So "what is next" reads the same wherever a member meets it, and the date chip, the
// when line and the place line keep tracking one definition.
//
// SERVER-RENDERED, and passed into the calendar workspace as a slot the way `subscribe` already is.
// The workspace is a client component; the rows carry stored wall-clock times, and formatting them
// here keeps that work — and the timezone convention behind it — off every phone.
//
// HONEST-EMPTY: no rows, no band. Not a heading over nothing, and not an empty state either — the
// grid below already says the one true thing when a Space has published nothing
// (`guestFirstUse`), and a second empty box saying it again is a page apologising twice.
// ─────────────────────────────────────────────────────────────────────────────

const HEADING_ID = 'space-calendar-up-next'

export function SpaceUpcomingFeed({ rows }: { rows: UpcomingFeedRow[] }) {
  if (rows.length === 0) return null
  return (
    <section data-space-upcoming-feed aria-labelledby={HEADING_ID}>
      <SectionHeader id={HEADING_ID} title="Up next" count={rows.length} />
      <UpcomingEventRows events={rows} />
    </section>
  )
}
