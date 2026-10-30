'use client'

import { useId, useMemo, useState, useSyncExternalStore } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Dialog } from '@/components/ui/dialog'
import { IconButton } from '@/components/ui/icon-button'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { CalendarPreview } from '@/components/events/event-calendar'
import { SITE_MONTH_CSS } from '@/components/sites/site-month-css'
import { monthName, monthWeeks, shiftMonth } from '@/lib/calendar/planner/month'
import { siteDayItems, siteMonthAgenda, type SiteMonthItem } from '@/lib/calendar/site-month'
import type { CalendarEvent } from '@/lib/calendar/item'

// THE WEBSITE MONTH (calendar suite pass 10). The suite's month look on a Space's stand-alone website: day
// cells, an event chip per gathering, a marker on today, the Unavailable hatch, paging, and the Agenda, which a
// phone (under 720px) opens on. PUBLIC DATA ONLY: it is handed items already narrowed to what a visitor may see
// (lib/calendar/site-month.ts), so no Pencil, Plan, Production date, to-do or shared-layer item is ever in its
// props. It makes no request: the server render loads the whole window, so the page stays cached and anonymous.
// Its sheet is components/sites/site-month-css.ts, scoped to this component. An event opens the same preview
// popup the Upcoming list opens, whose one link out is the event's page on Frequency (where RSVPs live).

/** Chips a day shows before "+N more". */
const DAY_CHIPS = 3
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const
const DAY_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const

type View = 'auto' | 'month' | 'agenda'

/** A phone, as the sheet counts one: under 720px wide. The server draws it false; the browser corrects it. */
const PHONE = '(max-width: 719.98px)'
function onPhoneChange(notify: () => void) {
  if (typeof window.matchMedia !== 'function') return () => {}
  const q = window.matchMedia(PHONE)
  q.addEventListener('change', notify)
  return () => q.removeEventListener('change', notify)
}
function dayNow(timeZone: string | null): string | null {
  try {
    const now = new Date().toLocaleDateString('en-CA', { timeZone: timeZone ?? undefined })
    return /^\d{4}-\d{2}-\d{2}$/.test(now) ? now : null
  } catch {
    return null
  }
}
const isPhone = () => typeof window.matchMedia === 'function' && window.matchMedia(PHONE).matches
type Open = { kind: 'event'; ev: CalendarEvent } | { kind: 'day'; day: string } | null

/** The word under a chip's title: when it starts, or that a run carries on. */
function chipMeta(i: SiteMonthItem, day: string): string {
  if (i.kind === 'cancelled') return 'Cancelled'
  if (i.item.dayKey < day) return 'Continues'
  return i.item.timeLabel
}

function Chip({ i, day, onOpen }: { i: SiteMonthItem; day: string; onOpen: (ev: CalendarEvent) => void }) {
  const meta = chipMeta(i, day)
  const label = `${i.item.title}, ${i.kind === 'unavailable' ? 'unavailable' : i.item.whenLabel}${i.kind === 'cancelled' ? ', cancelled' : ''}`
  return (
    <button
      type="button"
      className="sm-chip"
      data-kind={i.kind}
      aria-label={label}
      title={label}
      // An Unavailable span says only that the time is taken; there is nothing to open.
      {...(i.kind === 'unavailable' ? { 'aria-disabled': true, tabIndex: -1 } : { onClick: () => onOpen(i.item) })}
    >
      <span className="sm-chip-t">{i.item.title}</span>
      <span className="sm-chip-m">{meta}</span>
    </button>
  )
}

export function SiteMonth({
  items,
  today: serverToday,
  timeZone,
  openYm,
  minYm,
  maxYm,
  eventOrigin,
  brandName,
}: {
  items: SiteMonthItem[]
  /** The Space's current day when the page was drawn; corrected in the browser, since the page is cached. */
  today: string
  timeZone: string | null
  openYm: string
  minYm: string
  maxYm: string
  eventOrigin: string
  brandName: string
}) {
  const [ym, setYm] = useState(openYm)
  const [view, setView] = useState<View>('auto')
  const [open, setOpen] = useState<Open>(null)
  const [inViewerTz, setInViewerTz] = useState(false)
  const titleId = useId()
  const dayTitleId = useId()
  // Before anyone chooses, the panel shown is the sheet's call (month wide, Agenda on a phone); the control
  // says the same, so what is pressed is what is on screen.
  const phone = useSyncExternalStore(onPhoneChange, isPhone, () => false)
  const current: 'month' | 'agenda' = view === 'auto' ? (phone ? 'agenda' : 'month') : view

  // The page is cached, so "today" is whatever day it was when it was drawn. Ask the clock, in the Space's zone;
  // the server's day stands for the first paint and wherever the zone cannot be read.
  const today = useSyncExternalStore(
    () => () => {},
    () => dayNow(timeZone) ?? serverToday,
    () => serverToday,
  )

  const weeks = useMemo(() => monthWeeks(ym), [ym])
  const agenda = useMemo(() => siteMonthAgenda(items, ym), [items, ym])
  const year = ym.slice(0, 4)
  const atMin = ym <= minYm
  const atMax = ym >= maxYm
  const empty = agenda.length === 0
  const todayYm = today.slice(0, 7)
  const dayOpen = open?.kind === 'day' ? open.day : null

  function go(delta: number) {
    const next = shiftMonth(ym, delta)
    if (next >= minYm && next <= maxYm) setYm(next)
  }

  return (
    <section data-site-month data-view={view} aria-label={`${brandName} calendar`}>
      <style>{SITE_MONTH_CSS}</style>
      <div className="sm-bar">
        <h3 className="sm-title" aria-live="polite">
          {monthName(ym)} <span>{year}</span>
        </h3>
        <div className="sm-tools">
          <button type="button" className="sm-today" disabled={ym === todayYm || todayYm < minYm || todayYm > maxYm} onClick={() => setYm(todayYm)}>
            Today
          </button>
          <span className="sm-step">
            <IconButton label="Previous month" variant="bordered" disabled={atMin} onClick={() => go(-1)}>
              <ChevronLeft className="h-4 w-4" aria-hidden />
            </IconButton>
            <IconButton label="Next month" variant="bordered" disabled={atMax} onClick={() => go(1)}>
              <ChevronRight className="h-4 w-4" aria-hidden />
            </IconButton>
          </span>
          <SegmentedControl
            label="Calendar view"
            value={current}
            onChange={setView}
            segments={[
              { value: 'month', label: 'Month' },
              { value: 'agenda', label: 'Agenda' },
            ]}
          />
        </div>
      </div>

      <div className="sm-month-panel">
        <div className="sm-card" role="grid" aria-label={`${monthName(ym)} ${year}`}>
          <div className="sm-weekdays" aria-hidden>
            {WEEKDAYS.map((d) => (
              <span key={d}>{d}</span>
            ))}
          </div>
          {weeks.map((week) => (
            <div className="sm-week" role="row" key={week[0]}>
              {week.map((day) => {
                if (day.slice(0, 7) !== ym) return <div className="sm-day" data-out role="gridcell" aria-hidden key={day} />
                const here = siteDayItems(items, day)
                const shown = here.slice(0, DAY_CHIPS)
                const more = here.length - shown.length
                return (
                  <div className="sm-day" role="gridcell" key={day} data-today={day === today || undefined} data-past={day < today || undefined}>
                    <span className="sm-num" aria-label={`${DAY_ABBR[Number(day.slice(5, 7)) - 1]} ${Number(day.slice(8, 10))}${day === today ? ', today' : ''}`}>
                      {Number(day.slice(8, 10))}
                    </span>
                    {shown.map((i) => (
                      <Chip key={`${i.item.slug}-${day}`} i={i} day={day} onOpen={(ev) => setOpen({ kind: 'event', ev })} />
                    ))}
                    {more > 0 ? (
                      <button type="button" className="sm-more" onClick={() => setOpen({ kind: 'day', day })}>
                        +{more} more
                      </button>
                    ) : null}
                  </div>
                )
              })}
            </div>
          ))}
        </div>
        {empty ? <p className="sm-note">Nothing on the calendar in {monthName(ym)} yet.</p> : null}
      </div>

      <div className="sm-agenda-panel">
        {empty ? (
          <p className="sm-note">Nothing on the calendar in {monthName(ym)} yet.</p>
        ) : (
          <ul className="sm-agenda">
            {agenda.map(({ day, items: rows }) => (
              <li key={day}>
                <span className="sm-adate" data-today={day === today || undefined} aria-hidden>
                  <span>{DAY_ABBR[Number(day.slice(5, 7)) - 1]}</span>
                  <span>{Number(day.slice(8, 10))}</span>
                </span>
                <div className="sm-arows">
                  {rows.map((i) => (
                    <p className="sm-arow" key={`${i.item.slug}-${day}`}>
                      <Chip i={i} day={day} onOpen={(ev) => setOpen({ kind: 'event', ev })} />
                    </p>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
      {atMax ? <p className="sm-note">This is as far ahead as the calendar loads.</p> : null}

      <Dialog open={open?.kind === 'event'} onClose={() => setOpen(null)} ariaLabelledBy={titleId} className="max-w-md">
        {open?.kind === 'event' && (
          <div data-site-month="preview" className="overflow-hidden rounded-card border border-border bg-surface lift-3">
            <CalendarPreview
              item={open.ev}
              eventOrigin={eventOrigin}
              titleId={titleId}
              inViewerTz={inViewerTz}
              onToggleTz={() => setInViewerTz((v) => !v)}
              onClose={() => setOpen(null)}
            />
          </div>
        )}
      </Dialog>

      <Dialog open={dayOpen !== null} onClose={() => setOpen(null)} ariaLabelledBy={dayTitleId} className="max-w-md">
        {dayOpen && (
          <div className="overflow-hidden rounded-card border border-border bg-surface p-4 lift-3">
            <h3 id={dayTitleId} className="text-lead font-bold text-text">
              {DAY_ABBR[Number(dayOpen.slice(5, 7)) - 1]} {Number(dayOpen.slice(8, 10))}
            </h3>
            <ul className="mt-3 divide-y divide-border">
              {siteDayItems(items, dayOpen).map((i) => (
                <li key={`${i.item.slug}-${dayOpen}`}>
                  {i.kind === 'unavailable' ? (
                    <p className={`py-2 text-body-sm text-muted`}>Unavailable, {i.item.timeLabel}</p>
                  ) : (
                    <button type="button" onClick={() => setOpen({ kind: 'event', ev: i.item })} className="block w-full py-2 text-left hover:bg-surface-elevated focus-visible:outline-2 focus-visible:outline-primary">
                      <span className={`block truncate text-body-sm font-semibold text-text ${i.kind === 'cancelled' ? 'line-through' : ''}`}>{i.item.title}</span>
                      <span className="block truncate text-meta text-muted">{i.kind === 'cancelled' ? 'Cancelled' : i.item.whenLabel}</span>
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </Dialog>
    </section>
  )
}
