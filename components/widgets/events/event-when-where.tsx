import { CalendarClock, Repeat } from 'lucide-react'
import { getEventContext } from '@/lib/events/active-event'
import { createAdminClient } from '@/lib/supabase/admin'
import { recurrenceLabel, type RecurrenceType } from '@/lib/events/recurrence'

// The movable WHEN block (the `event-when-where` layout module, paired with the Place & Time
// editor). A zero-prop self-fetching RSC: it reads the active event id from the request-scoped
// context (lib/events/active-event.ts), then self-fetches the two facts no other event block
// surfaces — the repeat cadence and the booking window (when RSVPs open and close). It returns
// null for a plain one-off with no window, so it never leaves an empty slot or duplicates the
// facts card. DAWN tokens only; container-query themed so it fits any slot.

type Row = {
  time_zone: string | null
  recurrence_type: string | null
  recurrence_until: string | null
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
    return new Intl.DateTimeFormat(undefined, { ...opts, timeZone: 'UTC' }).format(d)
  } catch {
    return null
  }
}

const DATE_OPTS: Intl.DateTimeFormatOptions = { weekday: 'short', month: 'short', day: 'numeric' }
const FULL_OPTS: Intl.DateTimeFormatOptions = {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
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

export const EventWhenWhere = async () => {
  const ctx = getEventContext()
  if (!ctx) return null

  const admin = createAdminClient()
  // time_zone / recurrence_* / details sit outside the generated types → untyped read (repo
  // convention; the event data layer does the same).
  const { data } = await (admin as unknown as {
    from: (t: string) => {
      select: (cols: string) => {
        eq: (c: string, v: string) => { maybeSingle: () => Promise<{ data: Row | null }> }
      }
    }
  })
    .from('events')
    .select('time_zone, recurrence_type, recurrence_until, details')
    .eq('id', ctx.event.id)
    .maybeSingle()
  if (!data) return null

  const repeats =
    data.recurrence_type && data.recurrence_type !== 'none'
      ? recurrenceLabel(data.recurrence_type as RecurrenceType)
      : null
  const until = repeats ? formatWall(data.recurrence_until, DATE_OPTS) : null

  const { opensAt, closesAt } = readWindow(data.details)
  const opensLine = formatWall(opensAt, FULL_OPTS)
  const closesLine = formatWall(closesAt, FULL_OPTS)

  // Nothing additive to show → render nothing (the facts card already carries the one-off when).
  if (!repeats && !opensLine && !closesLine) return null

  return (
    <div className="@container rounded-2xl border border-border bg-surface p-4">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-text">
        <CalendarClock className="h-4 w-4 shrink-0 text-primary-strong" />
        When it runs
      </h3>
      <ul className="space-y-2 text-sm text-muted">
        {repeats && (
          <li className="flex items-start gap-2">
            <Repeat className="mt-0.5 h-4 w-4 shrink-0 text-subtle" />
            <span>
              {repeats}
              {until && <span className="text-subtle"> until {until}</span>}
            </span>
          </li>
        )}
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
    </div>
  )
}
