import { listSharedCollaboratorEvents } from '@/lib/spaces/collaborator-calendar'
import { listCalendarEngagement } from '@/lib/events/store'
import { formatEventWhen, eventInstant } from '@/lib/time/zone'
import { eventDayKey } from '@/lib/events/calendar-grid'
import { SectionHeader } from '@/components/ui/section-header'
import { EventCalendar, type CalendarEvent } from '@/components/events/event-calendar'

// SHARED COLLABORATOR CALENDAR SECTION (ADR-799 B3, first slice). A steward-only combined calendar of this
// Space PLUS its accepted collaborators' upcoming PUBLIC events, so partnered/co-located spaces coordinate
// from one view. Server component: reads the merged (already public-gated) events, pre-formats times so the
// timezone lib never ships to the client, and tags each event with its source space. Renders nothing when
// there are no accepted collaborators (or no upcoming events), so it only appears once it earns its place.

export async function SharedCollaboratorCalendar({
  spaceId,
  ownName,
}: {
  spaceId: string
  ownName: string
}) {
  const now = new Date()
  const initialYear = now.getUTCFullYear()
  const initialMonth1 = now.getUTCMonth() + 1
  const fromDay = `${initialYear}-${String(initialMonth1).padStart(2, '0')}-01`

  const rows = await listSharedCollaboratorEvents(spaceId, ownName, { fromDay })
  if (rows.length === 0) return null

  const engagement = await listCalendarEngagement(rows.map((r) => r.id))

  const events: CalendarEvent[] = rows
    .map((ev): CalendarEvent | null => {
      const dayKey = eventDayKey(ev.starts_at)
      if (!dayKey) return null
      const eng = engagement.get(ev.id)
      return {
        slug: ev.slug,
        title: ev.title,
        dayKey,
        timeLabel: formatEventWhen(ev.starts_at, ev.time_zone, { style: 'time', withZone: false }),
        whenLabel: formatEventWhen(ev.starts_at, ev.time_zone, { style: 'full' }),
        startInstantIso: eventInstant(ev.starts_at, ev.time_zone)?.toISOString() ?? null,
        location: ev.location,
        goingCount: eng?.going ?? 0,
        coverUrl: eng?.coverUrl ?? null,
        // Own events carry no badge; a collaborator's events show the partner space's name.
        sourceLabel: ev.isOwn ? null : ev.sourceName,
        isCancelled: !!ev.is_cancelled,
      }
    })
    .filter((e): e is CalendarEvent => e !== null)

  if (events.length === 0) return null

  return (
    <section className="mt-8">
      <SectionHeader title="Shared calendar" />
      <p className="mb-3 text-sm text-muted">
        Upcoming public events from this space and the businesses that collaborate with it, in one place. A
        collaborator&rsquo;s private events never appear here.
      </p>
      <EventCalendar events={events} initialYear={initialYear} initialMonth1={initialMonth1} />
    </section>
  )
}
