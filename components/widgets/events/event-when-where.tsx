import { CalendarClock } from 'lucide-react'
import { getEventContext } from '@/lib/events/active-event'
import { createAdminClient } from '@/lib/supabase/admin'
import { recurrenceLabel } from '@/lib/events/recurrence'
import { AddToCalendar } from '@/components/events/add-to-calendar'

// The EVENT DETAILS card (the `event-when-where` layout module, paired with the Place & Time
// editor). Owner spec: the one place the schedule facts live — the date and time each on their
// OWN labeled row (never one run-on line), the repeat cadence for a recurring series, the booking
// window (when RSVPs open and close), and the add-to-calendar links relocated out of the RSVP box
// so they're available regardless of RSVP state. A zero-prop RSC: the date/time facts + calendar
// URLs come pre-built from the request-scoped context (lib/events/active-event.ts `schedule` —
// the SAME links the RSVP box used to carry), and only the RSVP window is self-fetched (no other
// block surfaces it). Always renders on an event page. DAWN tokens only; container-query themed
// so it fits any slot.

type Row = {
  details: Record<string, unknown> | null
}

// Event times are stored UTC-naive (the host's wall-clock kept in UTC parts; see
// lib/events/datetime). Formatting in the UTC zone reads those parts back as the same wall-clock
// the host set — no tz-lookup needed, so this block stays out of that dependency's import graph.
function formatWall(iso: string | null, opts: Intl.DateTimeFormatOptions): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  try {
    return new Intl.DateTimeFormat('en-US', { ...opts, timeZone: 'UTC' }).format(d)
  } catch {
    return null
  }
}

const DATE_OPTS: Intl.DateTimeFormatOptions = { weekday: 'short', month: 'short', day: 'numeric' }
const LONG_DATE_OPTS: Intl.DateTimeFormatOptions = {
  weekday: 'long',
  month: 'long',
  day: 'numeric',
  year: 'numeric',
}
const TIME_OPTS: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit' }
const FULL_OPTS: Intl.DateTimeFormatOptions = { ...DATE_OPTS, ...TIME_OPTS }

// Same-calendar-day check on the stored UTC parts (a multi-day event splits into Starts/Ends rows).
function sameWallDay(aIso: string, bIso: string): boolean {
  return aIso.slice(0, 10) === bIso.slice(0, 10)
}

function readWindow(details: Record<string, unknown> | null): { opensAt: string | null; closesAt: string | null } {
  const w = details && typeof details === 'object' ? (details.rsvpWindow as unknown) : null
  if (!w || typeof w !== 'object') return { opensAt: null, closesAt: null }
  const o = w as Record<string, unknown>
  return {
    opensAt: typeof o.opensAt === 'string' ? o.opensAt : null,
    closesAt: typeof o.closesAt === 'string' ? o.closesAt : null,
  }
}

// One labeled fact row — the label column is what keeps dates and times unmistakably apart.
function FactRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-3">
      <dt className="w-14 shrink-0 text-2xs font-semibold uppercase tracking-wide text-muted">
        {label}
      </dt>
      <dd className="min-w-0 text-sm font-medium text-text">{children}</dd>
    </div>
  )
}

export const EventWhenWhere = async () => {
  const ctx = getEventContext()
  if (!ctx) return null
  const { schedule } = ctx

  const admin = createAdminClient()
  // details sits outside the generated types → untyped read (repo convention; the event data
  // layer does the same). Only the RSVP window is read here — everything else rides the context.
  const { data } = await (admin as unknown as {
    from: (t: string) => {
      select: (cols: string) => {
        eq: (c: string, v: string) => { maybeSingle: () => Promise<{ data: Row | null }> }
      }
    }
  })
    .from('events')
    .select('details')
    .eq('id', ctx.event.id)
    .maybeSingle()

  const { opensAt, closesAt } = readWindow(data?.details ?? null)
  const opensLine = formatWall(opensAt, FULL_OPTS)
  const closesLine = formatWall(closesAt, FULL_OPTS)

  const repeats =
    schedule.recurrenceType !== 'none'
      ? recurrenceLabel(schedule.recurrenceType)
      : schedule.partOfSeries
        ? 'Part of a recurring series'
        : null
  const until = schedule.recurrenceType !== 'none' ? formatWall(schedule.recurrenceUntil, DATE_OPTS) : null
  const nextLine = formatWall(schedule.nextOccurrenceIso, DATE_OPTS)

  // A multi-day event gets explicit Starts/Ends rows (date + time each); a same-day event keeps
  // the cleaner Date row + Time row split.
  const multiDay = !!schedule.endsAt && !sameWallDay(schedule.startsAt, schedule.endsAt)
  const startTime = formatWall(schedule.startsAt, TIME_OPTS)
  const endTime = formatWall(schedule.endsAt, TIME_OPTS)

  // Calendar links are RSVP-state-free but NOT lifecycle-free: never invite someone to calendar a
  // cancelled event, or one that already ended with no upcoming occurrence (the RSVP box's old
  // calendar rows were gated the same way — cancelled nulled the box, and every branch was pre-end).
  const showCalendar = !ctx.event.is_cancelled && (!ctx.hasEnded || !!schedule.nextOccurrenceIso)

  return (
    <div className="@container rounded-2xl border border-border bg-surface p-4">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-text">
        <CalendarClock className="h-4 w-4 shrink-0 text-primary-strong" />
        Event Details
      </h3>
      <dl className="space-y-2">
        {multiDay ? (
          <>
            <FactRow label="Starts">
              {formatWall(schedule.startsAt, LONG_DATE_OPTS)}
              <span className="text-muted"> at {startTime} {schedule.tzAbbrev}</span>
            </FactRow>
            <FactRow label="Ends">
              {formatWall(schedule.endsAt, LONG_DATE_OPTS)}
              <span className="text-muted"> at {endTime} {schedule.tzAbbrev}</span>
            </FactRow>
          </>
        ) : (
          <>
            <FactRow label="Date">{formatWall(schedule.startsAt, LONG_DATE_OPTS)}</FactRow>
            <FactRow label="Time">
              {startTime}
              {endTime && <> to {endTime}</>} {schedule.tzAbbrev}
            </FactRow>
          </>
        )}
        {repeats && (
          <FactRow label="Series">
            {repeats}
            {until && <span className="text-muted"> until {until}</span>}
          </FactRow>
        )}
        {/* Recurring anchor whose date has passed: the next upcoming occurrence, so the series
            never reads as a one-off that already happened. */}
        {nextLine && <FactRow label="Next">{nextLine}</FactRow>}
      </dl>
      {(opensLine || closesLine) && (
        <ul className="mt-3 space-y-1 text-sm text-muted">
          {opensLine && (
            <li>
              <span className="font-medium text-text">RSVPs open</span> {opensLine}
            </li>
          )}
          {closesLine && (
            <li>
              <span className="font-medium text-text">RSVPs close</span> {closesLine}
            </li>
          )}
        </ul>
      )}
      {/* The relocated calendar buttons — same links the RSVP box carried, now RSVP-state-free
          (but still lifecycle-gated: see showCalendar above). */}
      {showCalendar && (
        <div className="mt-3 border-t border-border pt-3">
          <AddToCalendar icsHref={schedule.icsHref} googleUrl={schedule.googleUrl} emphasis />
        </div>
      )}
    </div>
  )
}
