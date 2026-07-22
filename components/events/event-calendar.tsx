'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { ChevronLeft, ChevronRight, MapPin, ArrowUpRight, CalendarDays, Users } from 'lucide-react'
import { Dialog } from '@/components/ui/dialog'
import { buttonClasses } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { monthMatrix, monthLabel, addMonth, WEEKDAY_LABELS } from '@/lib/events/calendar-grid'

// The month-grid events calendar (Events EC2). Renders a Space's (or the platform's) events on a month
// grid; clicking an event opens a TRUNCATED popup (title, when, where) with a "Go to Event" link that
// leaves the calendar for the full event page. Month nav is client-side over the already-loaded set (the
// server loads a bounded window). Pure grid math lives in lib/events/calendar-grid (unit-tested); this owns
// only the interaction + presentation. Tokens only — no hardcoded colors.

/** An event as the calendar renders it. The server pre-formats the when-labels (so the timezone lib never
 *  ships to the client) and resolves the day key. */
export interface CalendarEvent {
  slug: string
  title: string
  /** YYYY-MM-DD, the event's calendar day (lib/events/calendar-grid eventDayKey). */
  dayKey: string
  /** Short time for the day-cell chip, e.g. "7:00 PM" (no zone abbrev — the chip is compact). */
  timeLabel: string
  /** Full when-line for the popup, e.g. "Mon, Jul 20, 7:00 PM PDT" (with zone), in the EVENT's own zone. */
  whenLabel: string
  /** The true instant as an absolute ISO (with offset), for the viewer-timezone toggle. The client
   *  reformats THIS in the viewer's own zone via native Intl (no project tz lib on the client). Null when
   *  the instant could not be resolved. */
  startInstantIso: string | null
  location: string | null
  /** Confirmed 'going' RSVP count (social proof); 0 hides the line. */
  goingCount: number
  /** Cover image URL (public bucket), or null. */
  coverUrl: string | null
  isCancelled: boolean
}

/** Format an absolute instant in the VIEWER's local zone with native Intl (never the project tz lib, so
 *  nothing tz-related ships to the client beyond a plain instant). Returns null on a bad/absent instant. */
function viewerZoneLabel(instantIso: string | null): string | null {
  if (!instantIso) return null
  const d = new Date(instantIso)
  if (Number.isNaN(d.getTime())) return null
  try {
    return new Intl.DateTimeFormat(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZoneName: 'short',
    }).format(d)
  } catch {
    return null
  }
}

/** The viewer's local calendar day as YYYY-MM-DD (for the "today" ring). Client-only; the grid itself is
 *  timezone-neutral (it buckets by the event's own stored day). */
function localToday(): string {
  try {
    return new Date().toLocaleDateString('en-CA')
  } catch {
    return new Date().toISOString().slice(0, 10)
  }
}

export function EventCalendar({
  events,
  initialYear,
  initialMonth1,
}: {
  events: CalendarEvent[]
  initialYear: number
  initialMonth1: number
}) {
  const [{ year, month1 }, setMonth] = useState({ year: initialYear, month1: initialMonth1 })
  const [selected, setSelected] = useState<CalendarEvent | null>(null)
  // Times default to the event's own zone (server-formatted whenLabel); the viewer can flip to their own.
  const [inViewerTz, setInViewerTz] = useState(false)

  const weeks = useMemo(() => monthMatrix(year, month1), [year, month1])
  const byDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>()
    for (const ev of events) {
      const bucket = map.get(ev.dayKey)
      if (bucket) bucket.push(ev)
      else map.set(ev.dayKey, [ev])
    }
    return map
  }, [events])
  const today = useMemo(() => localToday(), [])

  return (
    <div className="rounded-xl border border-border bg-surface">
      {/* Header: month label + prev / today / next */}
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <h2 className="text-lg font-semibold text-text">{monthLabel(year, month1)}</h2>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setMonth(addMonth(year, month1, -1))}
            aria-label="Previous month"
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-elevated hover:text-text"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => setMonth({ year: initialYear, month1: initialMonth1 })}
            className="rounded-lg px-2.5 py-1 text-sm font-medium text-muted transition-colors hover:bg-surface-elevated hover:text-text"
          >
            Today
          </button>
          <button
            type="button"
            onClick={() => setMonth(addMonth(year, month1, 1))}
            aria-label="Next month"
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-elevated hover:text-text"
          >
            <ChevronRight className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </div>

      {/* Weekday header */}
      <div className="grid grid-cols-7 border-b border-border">
        {WEEKDAY_LABELS.map((label) => (
          <div key={label} className="px-2 py-2 text-center text-2xs font-semibold uppercase tracking-wide text-subtle">
            <span className="hidden sm:inline">{label}</span>
            <span className="sm:hidden">{label[0]}</span>
          </div>
        ))}
      </div>

      {/* The grid */}
      <div>
        {weeks.map((week) => (
          <div key={week[0].date} className="grid grid-cols-7 border-b border-border last:border-b-0">
            {week.map((cell) => {
              const dayEvents = byDay.get(cell.date) ?? []
              const isToday = cell.date === today
              const dayNum = Number(cell.date.slice(8, 10))
              return (
                <div
                  key={cell.date}
                  className={cn(
                    'min-h-[76px] border-r border-border p-1.5 last:border-r-0 sm:min-h-[104px]',
                    !cell.inMonth && 'bg-surface-elevated/40',
                  )}
                >
                  <div className="mb-1 flex justify-end">
                    <span
                      className={cn(
                        'inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-xs font-medium',
                        isToday ? 'bg-primary text-on-primary' : cell.inMonth ? 'text-text' : 'text-subtle',
                      )}
                    >
                      {dayNum}
                    </span>
                  </div>
                  <div className="flex flex-col gap-1">
                    {dayEvents.slice(0, 3).map((ev, i) => (
                      <button
                        key={`${ev.slug}-${i}`}
                        type="button"
                        onClick={() => setSelected(ev)}
                        title={ev.title}
                        className={cn(
                          'w-full truncate rounded px-1.5 py-0.5 text-left text-2xs font-medium transition-colors',
                          ev.isCancelled
                            ? 'bg-surface-elevated text-subtle line-through'
                            : 'bg-primary/10 text-primary-strong hover:bg-primary/20',
                        )}
                      >
                        <span className="tabular-nums">{ev.timeLabel}</span> {ev.title}
                      </button>
                    ))}
                    {dayEvents.length > 3 && (
                      <span className="px-1.5 text-2xs font-medium text-subtle">+{dayEvents.length - 3} more</span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        ))}
      </div>

      {/* The truncated event popup with the Go to Event link. */}
      <Dialog open={selected !== null} onClose={() => setSelected(null)} ariaLabel="Event details" className="max-w-md">
        {selected && (() => {
          const viewerLabel = viewerZoneLabel(selected.startInstantIso)
          const showViewer = inViewerTz && viewerLabel !== null
          const whenText = showViewer ? viewerLabel : selected.whenLabel
          return (
          <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-xl">
            {selected.coverUrl && (
              // eslint-disable-next-line @next/next/no-img-element -- external public bucket URL, not a local asset
              <img
                src={selected.coverUrl}
                alt=""
                className="h-32 w-full object-cover"
                loading="lazy"
              />
            )}
            <div className="p-6">
            {selected.isCancelled && (
              <p className="mb-2 text-2xs font-semibold uppercase tracking-wide text-danger">Cancelled</p>
            )}
            <h3 className="text-xl font-bold leading-tight text-text">{selected.title}</h3>
            <div className="mt-3 flex items-start gap-2 text-sm text-muted">
              <CalendarDays className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <span>{whenText}</span>
            </div>
            {viewerLabel !== null && (
              <button
                type="button"
                onClick={() => setInViewerTz((v) => !v)}
                className="mt-1 ml-6 text-2xs font-medium text-primary-strong underline-offset-2 hover:underline"
              >
                {showViewer ? 'Show in event timezone' : 'Show in my timezone'}
              </button>
            )}
            {selected.location && (
              <div className="mt-1.5 flex items-start gap-2 text-sm text-muted">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                <span>{selected.location}</span>
              </div>
            )}
            {selected.goingCount > 0 && (
              <div className="mt-1.5 flex items-start gap-2 text-sm text-muted">
                <Users className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                <span>
                  <span className="font-semibold text-text tabular-nums">{selected.goingCount}</span>{' '}
                  going
                </span>
              </div>
            )}
            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setSelected(null)}
                className={buttonClasses('secondary', 'sm')}
              >
                Close
              </button>
              <Link href={`/events/${selected.slug}`} className={buttonClasses('primary', 'sm')}>
                Go to event
                <ArrowUpRight className="h-4 w-4" aria-hidden />
              </Link>
            </div>
            </div>
          </div>
        )})()}
      </Dialog>
    </div>
  )
}
