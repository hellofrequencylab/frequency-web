'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { MONDAY_FIRST, type CalendarMonth } from './calendar-month'

// THE EVENTS CALENDAR VIEW (templates/members/app/events.js drawCal, ported to React). A month grid
// of the real matching dates, built on the server (calendar-month.ts), so this island owns only
// focus: an ARIA grid with one roving tab stop. Arrows move a day or a week, Home / End go to the
// ends of the week, Page Up / Page Down turn the month (a URL change, `?month=`), and Tab goes into
// the focused day's events. A day with more than three shows "+N more", which opens the rest there.
// On a phone a day's events are 6px marks too small to tap, so a tap picks the day and its events
// list under the grid (`.ev-cal-day`, shown under 720px), the same rows the keyboard focus picks.

const SHOWN = 3

export function FqEventsCalendar({
  month,
  prevHref,
  nextHref,
  subscribe,
  emptyHref,
}: {
  month: CalendarMonth
  prevHref: string | null
  nextHref: string | null
  /** The Subscribe control (a server-rendered menu). */
  subscribe: ReactNode
  /** Where "see everything" goes when this month is empty (the list view). */
  emptyHref: string
}) {
  const router = useRouter()
  const cells = month.weeks.flat()
  const days = cells.map((c, i) => (c.key ? i : -1)).filter((i) => i >= 0)
  const todayIdx = cells.findIndex((c) => c.today)
  const firstWithEvents = cells.findIndex((c) => c.key && !c.past && c.events.length > 0)
  const start = todayIdx >= 0 ? todayIdx : firstWithEvents >= 0 ? firstWithEvents : days[0]
  const [focus, setFocus] = useState(start)
  const [open, setOpen] = useState<Record<string, boolean>>({})
  const refs = useRef<(HTMLDivElement | null)[]>([])
  const picked = cells[focus]

  function move(to: number) {
    const lo = days[0]
    const hi = days[days.length - 1]
    const next = Math.max(lo, Math.min(hi, to))
    setFocus(next)
    refs.current[next]?.focus()
  }

  function onKey(e: KeyboardEvent<HTMLDivElement>, i: number) {
    // Keys typed inside a chip link belong to the link.
    if (e.target !== e.currentTarget) return
    const col = i % 7
    const map: Record<string, () => void> = {
      ArrowRight: () => move(i + 1),
      ArrowLeft: () => move(i - 1),
      ArrowDown: () => move(i + 7),
      ArrowUp: () => move(i - 7),
      Home: () => move(i - col),
      End: () => move(i + (6 - col)),
      PageDown: () => nextHref && router.push(nextHref, { scroll: false }),
      PageUp: () => prevHref && router.push(prevHref, { scroll: false }),
    }
    const run = map[e.key]
    if (run) {
      e.preventDefault()
      run()
    }
  }

  return (
    <section className="ev-cal" aria-labelledby="ev-cal-title">
      <div className="ev-cal-h">
        <h2 id="ev-cal-title" className="h2" aria-live="polite">
          {month.title}
        </h2>
        <div className="row">
          {prevHref ? (
            <Link className="btn sm" href={prevHref} scroll={false} aria-label="Previous month">
              Previous
            </Link>
          ) : (
            <span className="btn sm" aria-disabled="true">
              Previous
            </span>
          )}
          {nextHref ? (
            <Link className="btn sm" href={nextHref} scroll={false} aria-label="Next month">
              Next
            </Link>
          ) : (
            <span className="btn sm" aria-disabled="true">
              Next
            </span>
          )}
        </div>
        {subscribe}
      </div>

      {month.total === 0 && (
        <div className="ev-cal-empty">
          <span className="h3">No events this month.</span>
          <span className="t2">
            Nothing matching is on for {month.title} yet.{nextHref ? ' Try the next month, or see everything coming up.' : ''}
          </span>
          <Link className="btn sm" href={emptyHref}>
            See everything coming up
          </Link>
        </div>
      )}

      <div className="ev-cal-g" role="grid" aria-labelledby="ev-cal-title">
        <div className="ev-cal-row" role="row">
          {MONDAY_FIRST.map((d) => (
            <span key={d} className="k" role="columnheader">
              {d}
            </span>
          ))}
        </div>
        {month.weeks.map((week, w) => (
          <div key={w} className="ev-cal-row" role="row">
            {week.map((c, d) => {
              const i = w * 7 + d
              if (!c.key) return <div key={i} className="ev-cell out" role="gridcell" aria-hidden="true" />
              const all = open[c.key] || c.events.length <= SHOWN + 1
              const shown = all ? c.events : c.events.slice(0, SHOWN)
              const cls = ['ev-cell', c.past && 'past', c.today && 'today'].filter(Boolean).join(' ')
              const spoken = `${c.label}${c.today ? ', today' : ''}, ${c.events.length === 0 ? 'no events' : c.events.length === 1 ? '1 event' : `${c.events.length} events`}`
              return (
                <div
                  key={c.key}
                  ref={(el) => {
                    refs.current[i] = el
                  }}
                  className={cls}
                  role="gridcell"
                  tabIndex={i === focus ? 0 : -1}
                  aria-label={spoken}
                  aria-current={c.today ? 'date' : undefined}
                  onKeyDown={(e) => onKey(e, i)}
                  onFocus={(e) => {
                    if (e.target === e.currentTarget) setFocus(i)
                  }}
                  onClick={(e) => {
                    if (!(e.target as HTMLElement).closest('a, button')) setFocus(i)
                  }}
                  data-picked={i === focus ? '' : undefined}
                >
                  <span className="ev-cd" aria-hidden="true">
                    {c.day}
                  </span>
                  {shown.map((ev) => (
                    <Link key={ev.id} href={ev.href} className={ev.going ? 'ev-cal-chip going' : 'ev-cal-chip'} title={`${ev.time} ${ev.title}`}>
                      <b>{ev.time}</b>
                      <span>
                        {ev.title}
                        {ev.going ? ' (going)' : ''}
                      </span>
                    </Link>
                  ))}
                  {!all && (
                    <button type="button" className="btn txt sm" onClick={() => setOpen((o) => ({ ...o, [c.key!]: true }))}>
                      +{c.events.length - SHOWN} more
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        ))}
      </div>
      {picked?.key && (
        <div className="ev-cal-day" aria-live="polite">
          <span className="k">{picked.label}</span>
          {picked.events.length === 0 ? (
            <span className="t2">Nothing on this day.</span>
          ) : (
            picked.events.map((ev) => (
              <Link key={ev.id} href={ev.href} className={ev.going ? 'ev-cal-row-ev going' : 'ev-cal-row-ev'}>
                <b>{ev.time}</b>
                <span>{ev.title}</span>
                {ev.going && <span className="tag">Going</span>}
              </Link>
            ))
          )}
        </div>
      )}
      <span className="t2">
        Every upcoming event that matches, by day. Subscribe once and the public calendar shows up in Google or Apple
        Calendar. Arrow keys move between days; Page Up and Page Down change the month.
      </span>
    </section>
  )
}
