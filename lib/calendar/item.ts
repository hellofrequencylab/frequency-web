import type { CalendarLayerKey } from './registry'
import type { EntryInput } from './entries'

// THE CALENDAR ITEM (Events EC2, widened by ADR-1385). What the month grid, the list and the preview
// render, whichever layer it came from. The server pre-formats every when-label so the timezone lib
// never ships to the client. Moved here from components/events/event-calendar.tsx (which re-exports
// it) so server adapters in lib/ can build items without importing a component.

export interface CalendarEvent {
  /** The event slug. Private entries use `entry-<id>` so keys stay unique; they never link by it. */
  slug: string
  title: string
  /** YYYY-MM-DD, the item's first calendar day (lib/events/calendar-grid eventDayKey). */
  dayKey: string
  /** YYYY-MM-DD, the item's LAST day when it spans several (inclusive). Absent = one day. */
  endDayKey?: string | null
  /** Short time for the day-cell chip, e.g. "7:00 PM" ("All day" for an all-day entry). */
  timeLabel: string
  /** Full when-line, e.g. "Mon, Jul 20, 7:00 PM PDT", in the item's own zone. */
  whenLabel: string
  /** The true instant as an absolute ISO, for the viewer-timezone toggle. Null when unresolved or
   *  meaningless (an all-day entry). */
  startInstantIso: string | null
  location: string | null
  /** Confirmed 'going' RSVP count (social proof); 0 hides the line. */
  goingCount: number
  /** Cover image URL (public bucket), or null. */
  coverUrl: string | null
  /** The host-picked focal point for that cover as a CSS object-position. */
  coverFocus?: string | null
  /** Optional source label (e.g. the collaborator space in a combined calendar). */
  sourceLabel?: string | null
  /** Optional status badge for MANAGE surfaces ("Draft", "Past", "Tentative"). */
  statusLabel?: string | null
  /** MANAGE mode: the edit page for this event. */
  editHref?: string | null
  isCancelled: boolean
  /** REPEATS (LIVE-081): the series this date belongs to, or absent for a one-off. */
  seriesKey?: string | null
  /** REPEATS: true when this is NOT the next date of its series (renders as a dot). */
  isLaterDate?: boolean
  /** Which layer this item belongs to (lib/calendar/registry.ts). Absent = 'events'. */
  layer?: CalendarLayerKey
  /** A private entry's id (space_calendar_entries.id) when the viewer may edit it. */
  entryId?: string | null
  /** A private entry's notes, shown in the staff preview only. */
  notes?: string | null
  /** A pencil's candidate-date group (ADR-1386); siblings share it. */
  optionGroup?: string | null
  /** A private entry as the staff form edits it. Present only when `entryId` is. */
  entryInput?: EntryInput | null
}
