'use client'

import { useId, useState } from 'react'
import { Dialog } from '@/components/ui/dialog'
import { CalendarPreview } from '@/components/events/event-calendar'
import type { CalendarEvent } from '@/lib/calendar/item'

// THE WEBSITE CALENDAR'S EVENT LIST (LIVE-873, owner ask 2026-10-08: "Put the list of events in a tight
// column on the left of the calendar. Each item should open a pop up with an event preview, similar to
// frequency."). The Space's next gatherings, soonest first, one compact row each. A row opens the same
// preview the month grid's popup shows (CalendarPreview), so the two never drift; its one link out is the
// event's page on Frequency (eventOrigin), where RSVPs live.

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export function SiteCalendarAgenda({ events, eventOrigin }: { events: CalendarEvent[]; eventOrigin: string }) {
  const [open, setOpen] = useState<CalendarEvent | null>(null)
  const [inViewerTz, setInViewerTz] = useState(false)
  const titleId = useId()
  const headingId = useId()
  return (
    <section aria-labelledby={headingId} data-site-calendar-agenda className="min-w-0">
      <h2 id={headingId} className="text-lead font-bold text-text">
        Upcoming
      </h2>
      {events.length === 0 ? (
        <p className="mt-2 text-body-sm text-muted">Nothing on the calendar yet.</p>
      ) : (
        <ul className="mt-3 divide-y divide-border rounded-card border border-border bg-surface">
          {events.map((ev) => (
            <li key={`${ev.slug}-${ev.dayKey}`}>
              <button
                type="button"
                onClick={() => setOpen(ev)}
                className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-surface-elevated focus-visible:outline-2 focus-visible:outline-primary"
              >
                <span className="flex w-10 shrink-0 flex-col items-center leading-none" aria-hidden>
                  <span className="text-2xs font-semibold uppercase text-primary-strong">
                    {MONTHS[Number(ev.dayKey.slice(5, 7)) - 1]}
                  </span>
                  <span className="mt-0.5 text-body font-bold text-text tabular-nums">{Number(ev.dayKey.slice(8, 10))}</span>
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-body-sm font-semibold text-text">{ev.title}</span>
                  <span className="block truncate text-meta text-muted">
                    {ev.isCancelled ? 'Cancelled' : ev.whenLabel}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <Dialog open={open !== null} onClose={() => setOpen(null)} ariaLabelledBy={titleId} className="max-w-md">
        {open && (
          <div className="overflow-hidden rounded-card border border-border bg-surface lift-3">
            <CalendarPreview
              item={open}
              eventOrigin={eventOrigin}
              titleId={titleId}
              inViewerTz={inViewerTz}
              onToggleTz={() => setInViewerTz((v) => !v)}
              onClose={() => setOpen(null)}
            />
          </div>
        )}
      </Dialog>
    </section>
  )
}
