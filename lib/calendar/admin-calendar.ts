import 'server-only'
import { listCalendarEngagement, listEventsForSpace, listSpaceCalendarEvents } from '@/lib/events/store'
import { formatEventWhen, eventInstant } from '@/lib/time/zone'
import { eventDayKey } from '@/lib/events/calendar-grid'
import { listStaffCalendarItems } from './entries-store'
import { listDayNotes } from './day-notes-store'
import { listDueDateItems } from './due-dates-store'
import { monthGridWindow } from './month-window'
import { listSpacePlans } from './plans-store'
import type { DayNote } from './day-notes'
import type { CalendarEvent } from './item'
import type { SpacePlan } from './plans'

// THE ADMIN CALENDAR, loaded once (ADR-1385, ADR-1389, ADR-1467). What a Space's team sees: every event under the
// Space (drafts, past and cancelled included), the events other hosts co-host here, the private layer for
// the year window, and the day notes. Shared by the Calendar settings console and the operator Calendar
// tab so the two never disagree about what the team's calendar holds.
//
// 🔴 Call this ONLY for a viewer who manages the Space (or platform staff previewing it). It reads
// unpublished events; the private layer and day notes are additionally locked by RLS. Unsigned
// visitors never reach this function.

type OwnedRow = Awaited<ReturnType<typeof listEventsForSpace>>[number]

export interface AdminCalendar {
  events: CalendarEvent[]
  /** Every event under the Space, for the console's counts and its manage table. */
  ownedRows: OwnedRow[]
  dayNotes: DayNote[]
  plans: SpacePlan[]
}

export async function loadAdminCalendar(
  spaceId: string,
  opts: {
    canManage: boolean
    year: number
    month1: number
    now: Date
    /** Wider than the visible month for List and Projects. Default is the month grid window. */
    entryWindow?: { fromDay: string; toDay: string }
  },
): Promise<AdminCalendar> {
  const { canManage, year, month1, now, entryWindow } = opts
  const nowIso = now.toISOString()

  // includeUnpublished: the team's calendar badges drafts on purpose. Every public reader takes the gated
  // default of listEventsForSpace (lib/events/store.ts).
  const ownedRows = await listEventsForSpace(spaceId, { limit: 200, includeUnpublished: true })
  const ownedIds = new Set(ownedRows.map((r) => r.id))
  const sharedRows = (await listSpaceCalendarEvents(spaceId, { fromDay: `${year - 1}-01-01` })).filter(
    (r) => !ownedIds.has(r.id),
  )
  const engagement =
    ownedRows.length || sharedRows.length
      ? await listCalendarEngagement([...ownedRows.map((r) => r.id), ...sharedRows.map((r) => r.id)])
      : new Map()

  // Only a manager gets the click-to-edit affordance; a staff preview stays read-only.
  const editHrefFor = (evSlug: string) => (canManage ? `/events/${evSlug}/manage?section=settings` : null)

  const events: CalendarEvent[] = [
    ...ownedRows.map((ev): CalendarEvent | null => {
      const dayKey = eventDayKey(ev.starts_at)
      if (!dayKey) return null
      const eng = engagement.get(ev.id)
      const isPast = ev.starts_at < nowIso
      return {
        slug: ev.slug,
        title: ev.title,
        dayKey,
        endDayKey: ev.ends_at ? eventDayKey(ev.ends_at) : null,
        timeLabel: formatEventWhen(ev.starts_at, ev.time_zone, { style: 'time', withZone: false }),
        whenLabel: formatEventWhen(ev.starts_at, ev.time_zone, { style: 'full' }),
        startInstantIso: eventInstant(ev.starts_at, ev.time_zone)?.toISOString() ?? null,
        location: ev.location,
        goingCount: eng?.going ?? 0,
        coverUrl: eng?.coverUrl ?? null,
        coverFocus: eng?.coverFocus ?? null,
        statusLabel: ev.status === 'draft' ? 'Draft' : isPast ? 'Past' : null,
        editHref: editHrefFor(ev.slug),
        isCancelled: !!ev.is_cancelled,
        eventId: ev.id,
        publicationState: ev.status === 'published' ? 'published' : 'unpublished',
        planId: ev.plan_id ?? null,
      }
    }),
    ...sharedRows.map((ev): CalendarEvent | null => {
      const dayKey = eventDayKey(ev.starts_at)
      if (!dayKey) return null
      const eng = engagement.get(ev.id)
      return {
        slug: ev.slug,
        title: ev.title,
        dayKey,
        endDayKey: ev.ends_at ? eventDayKey(ev.ends_at) : null,
        timeLabel: formatEventWhen(ev.starts_at, ev.time_zone, { style: 'time', withZone: false }),
        whenLabel: formatEventWhen(ev.starts_at, ev.time_zone, { style: 'full' }),
        startInstantIso: eventInstant(ev.starts_at, ev.time_zone)?.toISOString() ?? null,
        location: ev.location,
        goingCount: eng?.going ?? 0,
        coverUrl: eng?.coverUrl ?? null,
        coverFocus: eng?.coverFocus ?? null,
        sourceLabel: 'Co-hosted here',
        isCancelled: !!ev.is_cancelled,
        eventId: ev.id,
        publicationState: 'published',
        planId: ev.plan_id ?? null,
      }
    }),
  ].filter((e): e is CalendarEvent => e !== null)

  // THE PRIVATE LAYER: this month's entries. Other months load as the calendar browses. Read on the
  // caller's own session, so RLS decides what a viewer sees.
  const grid = entryWindow ?? monthGridWindow(year, month1)
  const [entryItems, dayNotes, dueItems, plans] = await Promise.all([
    listStaffCalendarItems(spaceId, grid.fromDay, grid.toDay, { editable: canManage }),
    listDayNotes(spaceId),
    listDueDateItems(spaceId, grid.fromDay, grid.toDay),
    canManage ? listSpacePlans(spaceId) : Promise.resolve([]),
  ])
  events.push(...entryItems, ...dueItems)

  return { events, ownedRows, dayNotes, plans }
}

/** THE SPACE'S EVENTS FOR THE PLAN PICKER (PROG-CAL3): id, title, when, and the Plan each already
 *  belongs to. The repair door in the Plan drawer lists these so a broken `events.plan_id` can be
 *  fixed in the app rather than in SQL.
 *
 *  🔴 IT LIVES HERE, AND NOT IN plan-actions.ts, BECAUSE OF THE PUBLICATION GATE. `listEventsForSpace`
 *  reads through the service-role client, so its own query is the only gate there is (the 2026-08-20
 *  regression: drafts and private events rendered on public Space profiles). `includeUnpublished` is
 *  the named opt-out, and lib/events/space-events-gate.test.ts freezes the set of files allowed to
 *  pass it to exactly ONE — this one. A second opt-out elsewhere is how that list stops meaning
 *  anything, so the unsafe read stays in the module the gate already names.
 *
 *  Drafts are the POINT here, not an oversight: a Production is draft until a person presses publish
 *  in the Spark (ADR-1386's invariant), so the events most likely to need their Plan link repaired
 *  are precisely the unpublished ones. Same manager-only contract as `loadAdminCalendar` above —
 *  the caller gates on managing the Space before calling. */
export async function listPlanLinkableEventRows(
  spaceId: string,
): Promise<{ id: string; title: string; whenLabel: string; planId: string | null }[]> {
  const rows = await listEventsForSpace(spaceId, { limit: 100, includeUnpublished: true })
  return rows.map((ev) => ({
    id: ev.id,
    title: ev.title,
    whenLabel: formatEventWhen(ev.starts_at, ev.time_zone, { style: 'date' }),
    planId: ev.plan_id ?? null,
  }))
}
