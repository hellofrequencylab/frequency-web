'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import Link from 'next/link'
import {
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  MapPin,
  ArrowUpRight,
  CalendarDays,
  Users,
  LayoutGrid,
  List,
  Plus,
  Pencil,
} from 'lucide-react'
import { Dialog } from '@/components/ui/dialog'
import { buttonClasses } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { monthMatrix, monthLabel, addMonth, WEEKDAY_LABELS } from '@/lib/events/calendar-grid'
import { eventCoverFocusStyle } from '@/lib/events/cover-focus'
import { IconButton } from '@/components/ui/icon-button'
import { CalendarRepeatsStrip } from '@/components/events/calendar-repeats-strip'
import type { CalendarRepeatSeries } from '@/lib/events/calendar-repeats'
import { CALENDAR_LAYERS, itemChipClass, type CalendarLayerKey } from '@/lib/calendar/registry'
import { spanDayKeys } from '@/lib/calendar/entries'
import { notesForDay, type DayNote } from '@/lib/calendar/day-notes'
import { monthKey } from '@/lib/calendar/month-window'
import { stackDay } from '@/lib/calendar/sunday-stack'
import { useMonthGestures } from './use-month-gestures'
import type { CalendarEvent } from '@/lib/calendar/item'

export type { CalendarEvent } from '@/lib/calendar/item'

// The month-grid calendar (Events EC2, upgraded by ADR-1385). Renders a Space's (or the platform's)
// calendar items on a month grid or a list. Every mount gets the same navigation:
//   · arrows, a Today button that appears once you leave the current month, and a month-and-year
//     jump behind the month title
//   · PageUp / PageDown for a month, Shift for a year, anywhere inside the calendar
//   · ArrowLeft / ArrowRight step a month when the calendar itself is focused
//   · Escape closes the month-and-year jump
//   · a sideways trackpad swipe or a touch swipe (and, where the mount opts in, the vertical wheel)
//     through components/events/use-month-gestures.ts
// A mount that passes `loadMonth` fetches each month it has not loaded yet, so browsing back or far
// forward is never a falsely empty grid. The LIST is a list on the left and a preview of the selected
// item on the right once the calendar itself is wide enough (a container query, because these pages
// sit beside the rail); narrower, a row opens the same popup as the grid. Items carry a `layer`
// (lib/calendar/registry.ts): public events, and on the staff calendar the private layers. Pure grid
// math lives in lib/events/calendar-grid. Tokens only, no hardcoded colors.

/** Format an absolute instant in the VIEWER's local zone with native Intl. Null on a bad instant. */
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

/** The viewer's local calendar day as YYYY-MM-DD (the "today" ring). */
function localToday(): string {
  try {
    return new Date().toLocaleDateString('en-CA')
  } catch {
    return new Date().toISOString().slice(0, 10)
  }
}

const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const itemKey = (ev: CalendarEvent) => `${ev.slug}|${ev.dayKey}`

export function EventCalendar({
  events,
  initialYear,
  initialMonth1,
  initialView = 'grid',
  onSelectEvent,
  repeats,
  loadMonth,
  wheelPaging = false,
  swipePaging = true,
  layers,
  onCreateAt,
  onEditEntry,
  refreshKey = 0,
  dayNotes,
  onPickDate,
  month,
  onMonthChange,
  fill = false,
}: {
  events: CalendarEvent[]
  initialYear: number
  initialMonth1: number
  /** Which view opens first: the month grid (default) or the list. */
  initialView?: 'grid' | 'list'
  /** The series behind the Repeats strip (LIVE-081). Scope today is /events/calendar. */
  repeats?: CalendarRepeatSeries[]
  /** When set, opening an EVENT calls this instead of the built-in popup (the host owns the popup). */
  onSelectEvent?: (ev: CalendarEvent) => void
  /** Fetch one month's items the page did not load. Absent = the page's own set is everything. */
  loadMonth?: (year: number, month1: number) => Promise<CalendarEvent[]>
  /** Let the VERTICAL wheel page months over the grid (the staff calendar in the console only). */
  wheelPaging?: boolean
  /** Let a sideways wheel or a touch swipe page months. On everywhere but the Space page's staff
   *  grid, which pages by its buttons only (PROG-CAL12). */
  swipePaging?: boolean
  /** Layers the viewer can toggle. Shown when two or more are passed. */
  layers?: CalendarLayerKey[]
  /** Staff: start a new private entry on a day. */
  onCreateAt?: (dayKey: string) => void
  /** Staff: edit a private entry. */
  onEditEntry?: (item: CalendarEvent) => void
  /** Bump to drop every fetched month (after a save changed what they hold). */
  refreshKey?: number
  /** Quiet per-day labels ("Quiet hours", "Flex day"), ADR-1386. */
  dayNotes?: DayNote[]
  /** Staff: keep this candidate date of a pencil and drop its siblings. */
  onPickDate?: (item: CalendarEvent) => void
  /** CONTROLLED MONTH (PROG-CAL12). When the host passes `month`, the grid shows that month and reports
   *  every step, jump and Today through `onMonthChange` instead of keeping the month itself, so a
   *  header outside the grid (the Calendar console's Prev / Today / Next, its agenda, its keys) and
   *  the grid always agree. Absent, the grid owns its month as it always has. */
  month?: { year: number; month1: number }
  onMonthChange?: (next: { year: number; month1: number }) => void
  /** Stretch to the host's height: the week rows share whatever is left below the header, so a
   *  full-viewport mount (the console) is a wall of days rather than a card with a gap under it. */
  fill?: boolean
}) {
  const [internalMonth, setInternalMonth] = useState({ year: initialYear, month1: initialMonth1 })
  const { year, month1 } = month ?? internalMonth
  const [selected, setSelected] = useState<CalendarEvent | null>(null)
  const [inViewerTz, setInViewerTz] = useState(false)
  const [view, setView] = useState<'grid' | 'list'>(initialView)
  const [activeSeries, setActiveSeries] = useState<string | null>(null)
  const [jumpOpen, setJumpOpen] = useState(false)
  const [jumpYear, setJumpYear] = useState(initialYear)
  const [hiddenLayers, setHiddenLayers] = useState<ReadonlySet<CalendarLayerKey>>(new Set())
  const [previewKey, setPreviewKey] = useState<string | null>(null)
  const [slide, setSlide] = useState<'next' | 'prev' | null>(null)
  // The slide follows the month actually shown, whoever changed it (the arrows here, a swipe, or a
  // controlling host), so a console key press eases in the same way a click on the grid's arrows does.
  const shownKey = monthKey(year, month1)
  const [seenKey, setSeenKey] = useState(shownKey)
  if (seenKey !== shownKey) {
    setSlide(shownKey > seenKey ? 'next' : 'prev')
    setSeenKey(shownKey)
  }

  // Months fetched through loadMonth, keyed 'YYYY-MM'. The page's initial month is already on hand.
  const [fetched, setFetched] = useState<ReadonlyMap<string, CalendarEvent[]>>(new Map())
  const [loading, setLoading] = useState(false)
  const requested = useRef(new Set<string>())
  const [cacheEpoch, setCacheEpoch] = useState(refreshKey)
  if (cacheEpoch !== refreshKey) {
    // A save changed what fetched months hold: drop them (render-time state reset, no effect cascade).
    setCacheEpoch(refreshKey)
    setFetched(new Map())
  }

  useEffect(() => {
    requested.current.clear()
  }, [refreshKey])

  useEffect(() => {
    // The server cannot know the browser's calendar day. Only correct the initial
    // viewport when it was derived from the current UTC month and the viewer's
    // local month differs (the few hours around a month boundary).
    const now = new Date()
    if (initialYear !== now.getUTCFullYear() || initialMonth1 !== now.getUTCMonth() + 1) return
    const local = localToday()
    const localYear = Number(local.slice(0, 4))
    const localMonth1 = Number(local.slice(5, 7))
    if (!localYear || !localMonth1 || (localYear === initialYear && localMonth1 === initialMonth1)) return
    const timer = window.setTimeout(() => {
      setInternalMonth({ year: localYear, month1: localMonth1 })
      onMonthChange?.({ year: localYear, month1: localMonth1 })
      setJumpYear(localYear)
    }, 0)
    return () => window.clearTimeout(timer)
  }, [initialYear, initialMonth1, onMonthChange])

  useEffect(() => {
    if (!loadMonth) return
    const key = monthKey(year, month1)
    if (key === monthKey(initialYear, initialMonth1) && refreshKey === 0) return
    const asked = requested.current
    if (asked.has(key)) return
    asked.add(key)
    let live = true
    let done = false
    setLoading(true)
    loadMonth(year, month1)
      .then((items) => {
        done = true
        if (live) setFetched((cur) => new Map(cur).set(key, items))
      })
      .catch(() => asked.delete(key))
      .finally(() => {
        if (live) setLoading(false)
      })
    return () => {
      live = false
      // Left the month before it arrived: forget the request so coming back fetches it again.
      if (!done) asked.delete(key)
    }
  }, [loadMonth, year, month1, initialYear, initialMonth1, refreshKey])

  const select = useCallback(
    (ev: CalendarEvent) => {
      if (onSelectEvent && (ev.layer ?? 'events') === 'events') onSelectEvent(ev)
      else setSelected(ev)
    },
    [onSelectEvent],
  )

  const today = useMemo(() => localToday(), [])
  const todayYear = Number(today.slice(0, 4))
  const todayMonth1 = Number(today.slice(5, 7))
  const onCurrentMonth = year === todayYear && month1 === todayMonth1

  const goTo = useCallback(
    (next: { year: number; month1: number }) => {
      setInternalMonth(next)
      onMonthChange?.(next)
    },
    [onMonthChange],
  )
  const step = useCallback((delta: number) => goTo(addMonth(year, month1, delta)), [goTo, year, month1])

  const gridRef = useRef<HTMLDivElement>(null)
  useMonthGestures(gridRef, step, { vertical: wheelPaging, horizontal: swipePaging, remountKey: view })

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement
    if (target.closest('input, textarea, select, [contenteditable="true"]')) return
    if (e.key === 'Escape' && jumpOpen) {
      e.preventDefault()
      setJumpOpen(false)
      return
    }
    if (e.key === 'PageDown' || e.key === 'PageUp') {
      e.preventDefault()
      const sign = e.key === 'PageDown' ? 1 : -1
      step(e.shiftKey ? sign * 12 : sign)
      return
    }
    if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && e.target === e.currentTarget) {
      e.preventDefault()
      step(e.key === 'ArrowRight' ? 1 : -1)
    }
  }

  // Every item on hand: the page's set plus fetched months, deduped (months overlap at their edges).
  const all = useMemo(() => {
    const seen = new Set<string>()
    const out: CalendarEvent[] = []
    for (const ev of [...events, ...[...fetched.values()].flat()]) {
      const k = itemKey(ev)
      if (seen.has(k)) continue
      seen.add(k)
      if (hiddenLayers.has(ev.layer ?? 'events')) continue
      out.push(ev)
    }
    return out
  }, [events, fetched, hiddenLayers])

  const series = useMemo(() => repeats ?? [], [repeats])
  const pendingByDay = useMemo(() => {
    const map = new Map<string, CalendarRepeatSeries[]>()
    for (const s of series) {
      for (const key of s.pendingDayKeys) {
        const bucket = map.get(key)
        if (bucket) bucket.push(s)
        else map.set(key, [s])
      }
    }
    return map
  }, [series])

  const weeks = useMemo(() => monthMatrix(year, month1), [year, month1])
  const byDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>()
    for (const ev of all) {
      for (const key of spanDayKeys(ev.dayKey, ev.endDayKey)) {
        const bucket = map.get(key)
        if (bucket) bucket.push(ev)
        else map.set(key, [ev])
      }
    }
    return map
  }, [all])

  // Items per month (by first day) for the jump panel's markers.
  const countByMonth = useMemo(() => {
    const map = new Map<string, number>()
    for (const ev of all) {
      const k = ev.dayKey.slice(0, 7)
      map.set(k, (map.get(k) ?? 0) + 1)
    }
    return map
  }, [all])

  // THE LIST: everything on hand from the first day of the browsed month on, soonest first, grouped
  // by month. It follows the grid, so switching views keeps your place.
  const listFrom = `${monthKey(year, month1)}-01`
  const chronological = useMemo(
    () =>
      all
        .filter((ev) => (ev.endDayKey ?? ev.dayKey) >= listFrom)
        .sort((a, b) => {
          const ak = a.startInstantIso ?? `${a.dayKey}T00:00:00Z`
          const bk = b.startInstantIso ?? `${b.dayKey}T00:00:00Z`
          return a.dayKey < b.dayKey ? -1 : a.dayKey > b.dayKey ? 1 : ak < bk ? -1 : ak > bk ? 1 : 0
        }),
    [all, listFrom],
  )
  const groups = useMemo(() => {
    const out: { key: string; label: string; items: CalendarEvent[] }[] = []
    for (const ev of chronological) {
      const k = ev.dayKey.slice(0, 7)
      const last = out[out.length - 1]
      if (last && last.key === k) last.items.push(ev)
      else out.push({ key: k, label: monthLabel(Number(k.slice(0, 4)), Number(k.slice(5, 7))), items: [ev] })
    }
    return out
  }, [chronological])

  const preview =
    chronological.find((ev) => itemKey(ev) === previewKey) ??
    chronological.find((ev) => (ev.endDayKey ?? ev.dayKey) >= today) ??
    chronological[0] ??
    null
  // Wide: the row fills the preview pane. Narrow (the pane is display:none): it opens the popup.
  const openFromList = (ev: CalendarEvent, row: HTMLElement) => {
    setPreviewKey(itemKey(ev))
    const pane = row.closest('[data-calendar-list]')?.querySelector('[data-calendar-pane]')
    const paneShown = !!pane && window.getComputedStyle(pane).display !== 'none'
    if (!paneShown) select(ev)
  }

  const showLayerToggles = (layers?.length ?? 0) > 1

  return (
    <div
      data-calendar-root
      tabIndex={0}
      aria-label="Calendar"
      className={cn(
        '@container rounded-card border border-border bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
        fill && 'flex h-full min-h-0 flex-col',
      )}
      onKeyDown={onKeyDown}
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div className="relative flex items-center gap-1">
          <button
            type="button"
            onClick={() => {
              setJumpYear(year)
              setJumpOpen((o) => !o)
            }}
            aria-expanded={jumpOpen}
            aria-haspopup="dialog"
            className="inline-flex items-center gap-1 rounded-control px-1.5 py-1 text-body-lg font-semibold text-text transition-colors hover:bg-surface-elevated"
          >
            <span aria-live="polite">{monthLabel(year, month1)}</span>
            <ChevronDown className={cn('h-4 w-4 text-muted transition-transform', jumpOpen && 'rotate-180')} aria-hidden />
          </button>
          {loading && <span className="text-meta text-muted">Loading</span>}
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1">
            <IconButton label="Previous month" onClick={() => step(-1)}>
              <ChevronLeft className="h-4 w-4" aria-hidden />
            </IconButton>
            {!onCurrentMonth && (
              <button
                type="button"
                onClick={() => goTo({ year: todayYear, month1: todayMonth1 })}
                className="rounded-control px-2.5 py-1 text-body-sm font-medium text-muted transition-colors hover:bg-surface-elevated hover:text-text"
              >
                Today
              </button>
            )}
            <IconButton label="Next month" onClick={() => step(1)}>
              <ChevronRight className="h-4 w-4" aria-hidden />
            </IconButton>
          </div>
          <div className="inline-flex items-center rounded-control border border-border p-0.5" role="group" aria-label="Calendar view">
            <IconButton
              label="Grid view"
              variant={view === 'grid' ? 'filled' : 'plain'}
              onClick={() => setView('grid')}
              aria-pressed={view === 'grid'}
            >
              <LayoutGrid className="h-4 w-4" aria-hidden />
            </IconButton>
            <IconButton
              label="List view"
              variant={view === 'list' ? 'filled' : 'plain'}
              onClick={() => setView('list')}
              aria-pressed={view === 'list'}
            >
              <List className="h-4 w-4" aria-hidden />
            </IconButton>
          </div>
        </div>
      </div>

      {/* MONTH + YEAR JUMP: twelve months of a year, each marked when it holds anything on hand. */}
      {jumpOpen && (
        <div role="dialog" aria-label="Jump to a month" className="border-b border-border px-4 py-3">
          <div className="mb-2 flex items-center justify-between">
            <IconButton label="Previous year" onClick={() => setJumpYear((y) => y - 1)}>
              <ChevronLeft className="h-4 w-4" aria-hidden />
            </IconButton>
            <span className="text-body-sm font-semibold text-text tabular-nums">{jumpYear}</span>
            <IconButton label="Next year" onClick={() => setJumpYear((y) => y + 1)}>
              <ChevronRight className="h-4 w-4" aria-hidden />
            </IconButton>
          </div>
          <div className="grid grid-cols-4 gap-1 @md:grid-cols-6">
            {SHORT_MONTHS.map((name, i) => {
              const m1 = i + 1
              const isShown = jumpYear === year && m1 === month1
              const count = countByMonth.get(monthKey(jumpYear, m1)) ?? 0
              return (
                <button
                  key={name}
                  type="button"
                  onClick={() => {
                    goTo({ year: jumpYear, month1: m1 })
                    setJumpOpen(false)
                  }}
                  aria-current={isShown ? 'date' : undefined}
                  aria-label={`${monthLabel(jumpYear, m1)}${count ? `, ${count} on the calendar` : ''}`}
                  className={cn(
                    'flex flex-col items-center gap-0.5 rounded-control px-2 py-1.5 text-body-sm font-medium transition-colors',
                    isShown ? 'bg-primary text-on-primary' : 'text-text hover:bg-surface-elevated',
                  )}
                >
                  {name}
                  <span className={cn('h-1 w-1 rounded-pill', count ? (isShown ? 'bg-on-primary' : 'bg-primary') : 'bg-transparent')} />
                </button>
              )
            })}
          </div>
        </div>
      )}

      {showLayerToggles && (
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2" role="group" aria-label="Show on the calendar">
          {CALENDAR_LAYERS.filter((l) => layers!.includes(l.key)).map((l) => {
            const on = !hiddenLayers.has(l.key)
            return (
              <button
                key={l.key}
                type="button"
                aria-pressed={on}
                onClick={() =>
                  setHiddenLayers((cur) => {
                    const next = new Set(cur)
                    if (next.has(l.key)) next.delete(l.key)
                    else next.add(l.key)
                    return next
                  })
                }
                className={cn(
                  'rounded-pill border px-3 py-1 text-meta font-medium transition-colors',
                  on ? cn('border-transparent', l.chipClass) : 'border-border text-muted hover:text-text',
                )}
              >
                {l.label}
              </button>
            )
          })}
        </div>
      )}

      {view === 'list' && (
        <div data-calendar-list className="@2xl:grid @2xl:grid-cols-5">
          <div className="divide-y divide-border @2xl:col-span-2 @2xl:max-h-[70vh] @2xl:overflow-y-auto @2xl:border-r @2xl:border-border">
            {groups.length === 0 ? (
              <p className="px-4 py-6 text-center text-body-sm text-muted">
                Nothing on the calendar from {monthLabel(year, month1)} on.
              </p>
            ) : (
              groups.map((g) => (
                <section key={g.key} aria-label={g.label}>
                  <h3 className="sticky top-0 z-10 border-b border-border bg-surface-elevated px-4 py-1.5 text-meta font-semibold text-muted">
                    {g.label}
                  </h3>
                  <ul className="divide-y divide-border">
                    {g.items
                      .filter((ev) => !ev.isCancelled)
                      .map((ev) => {
                      const isCurrent = preview !== null && itemKey(ev) === itemKey(preview)
                      const dayNum = Number(ev.dayKey.slice(8, 10))
                      const mon = SHORT_MONTHS[Number(ev.dayKey.slice(5, 7)) - 1]
                      return (
                        <li key={itemKey(ev)}>
                          <button
                            type="button"
                            onClick={(e) => openFromList(ev, e.currentTarget)}
                            aria-current={isCurrent ? 'true' : undefined}
                            className={cn(
                              'flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-elevated',
                              isCurrent && '@2xl:bg-surface-elevated',
                            )}
                          >
                            <span
                              className={cn(
                                'flex w-11 shrink-0 flex-col items-center rounded-control py-1',
                                itemChipClass(ev.layer, ev.stage),
                              )}
                              aria-hidden
                            >
                              <span className="text-2xs font-semibold">{mon}</span>
                              <span className="text-body-lg font-bold leading-none tabular-nums">{dayNum}</span>
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate font-semibold text-text">
                                {ev.title}
                              </span>
                              <span className="mt-0.5 block text-meta text-muted">{ev.whenLabel}</span>
                              {ev.location && <span className="mt-0.5 block truncate text-meta text-muted">{ev.location}</span>}
                              <Badges ev={ev} />
                            </span>
                            {ev.goingCount > 0 && (
                              <span className="mt-0.5 shrink-0 text-meta text-muted tabular-nums">{ev.goingCount} going</span>
                            )}
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                  {g.items.some((ev) => ev.isCancelled) &&
                    cancelledCellFooter(
                      g.items.filter((ev) => ev.isCancelled),
                      select,
                    )}
                </section>
              ))
            )}
          </div>
          <div data-calendar-pane className="hidden @2xl:col-span-3 @2xl:block" aria-live="polite">
            {preview ? (
              <div className="sticky top-0">
                <CalendarPreview
                  item={preview}
                  inViewerTz={inViewerTz}
                  onToggleTz={() => setInViewerTz((v) => !v)}
                  onOpenHost={onSelectEvent}
                  onEditEntry={onEditEntry}
                  onPickDate={onPickDate}
                />
              </div>
            ) : (
              <p className="px-6 py-10 text-center text-body-sm text-muted">Pick something on the list to see it here.</p>
            )}
          </div>
        </div>
      )}

      {view === 'grid' && (
        <>
          <CalendarRepeatsStrip
            series={series}
            activeKey={activeSeries}
            onToggle={(key) => setActiveSeries((cur) => (cur === key ? null : key))}
          />
          <div className="grid grid-cols-7 border-b border-border">
            {WEEKDAY_LABELS.map((label) => (
              <div key={label} className="px-2 py-2 text-center text-2xs font-semibold text-muted">
                <span className="hidden sm:inline">{label}</span>
                <span className="sm:hidden">{label[0]}</span>
              </div>
            ))}
          </div>

          {/* The gesture surface stays mounted across months (its listeners live on it); the inner
              wrapper re-keys per month so the slide replays. */}
          <div ref={gridRef} className={cn('touch-pan-y overflow-hidden', fill && 'flex min-h-0 flex-1 flex-col')}>
          <div
            key={monthKey(year, month1)}
            className={cn(
              slide === 'next' && 'motion-safe:animate-[calendarSlideNext_180ms_ease-out]',
              slide === 'prev' && 'motion-safe:animate-[calendarSlidePrev_180ms_ease-out]',
              fill && 'flex min-h-0 flex-1 flex-col',
            )}
          >
            {weeks.map((week) => (
              <div key={week[0].date} className={cn('grid grid-cols-7 border-b border-border last:border-b-0', fill && 'flex-1')}>
                {week.map((cell) => {
                  const dayEvents = byDay.get(cell.date) ?? []
                  const cancelled = dayEvents.filter((ev) => ev.isCancelled)
                  const liveEvents = dayEvents.filter((ev) => !ev.isCancelled)
                  const cards = liveEvents.filter((ev) => !ev.isLaterDate)
                  const dots = liveEvents.filter((ev) => ev.isLaterDate)
                  const pending = pendingByDay.get(cell.date) ?? []
                  const isToday = cell.date === today
                  const dayNum = Number(cell.date.slice(8, 10))
                  const labels = dayNotes?.length ? notesForDay(dayNotes, cell.date) : []
                  return (
                    <div
                      key={cell.date}
                      className={cn(
                        'group flex min-h-20 flex-col border-r border-border p-1.5 last:border-r-0 sm:min-h-28',
                        !cell.inMonth && 'bg-surface-elevated/40',
                      )}
                    >
                      <div className="mb-1 flex items-center justify-between gap-1">
                        {onCreateAt ? (
                          <IconButton
                            label={`Add an entry on ${cell.date}`}
                            onClick={() => onCreateAt(cell.date)}
                            className="opacity-0 focus-visible:opacity-100 group-hover:opacity-100 pointer-coarse:opacity-100"
                          >
                            <Plus className="h-3.5 w-3.5" aria-hidden />
                          </IconButton>
                        ) : (
                          <span />
                        )}
                        <span
                          aria-current={isToday ? 'date' : undefined}
                          className={cn(
                            'inline-flex h-6 min-w-6 items-center justify-center rounded-pill px-1 text-meta font-medium',
                            isToday ? 'bg-primary text-on-primary' : cell.inMonth ? 'text-text' : 'text-subtle',
                          )}
                        >
                          {dayNum}
                        </span>
                      </div>
                      {labels.length > 0 && (
                        <p className="-mt-0.5 mb-1 truncate px-0.5 text-2xs text-muted" title={labels.join(', ')}>
                          {labels.join(' · ')}
                        </p>
                      )}
                      <div className="flex flex-col gap-1">
                        {/* A SEGMENT PER ITEM (LIVE-467). Back-to-back items stack into one block, and
                            every item in it keeps its own button, so the second gathering on a busy
                            Sunday opens from the grid like the first. Items that only share the day
                            are separate chips, and the count past three always shows. */}
                        {(stackDay(cards.slice(0, 3))[0]?.runs ?? []).map((run) =>
                          run.length > 1 ? (
                            <div
                              key={`stack-${run[0].slug}-${run[0].dayKey}`}
                              role="group"
                              aria-label={`${run.length} back-to-back`}
                              data-calendar-stack
                              className={cn('overflow-hidden rounded-control', itemChipClass(run[0].layer, run[0].stage))}
                            >
                              {run.map((ev, i) => (
                                <button
                                  key={`${ev.slug}-${i}`}
                                  type="button"
                                  onClick={() => select(ev)}
                                  title={ev.title}
                                  className={cn(
                                    'block w-full truncate px-1.5 py-0.5 text-left text-2xs font-medium transition-colors',
                                    i > 0 && 'border-t border-border/60',
                                    activeSeries !== null && ev.seriesKey === activeSeries && 'ring-2 ring-inset ring-primary/50',
                                  )}
                                >
                                  <span className="tabular-nums">{ev.timeLabel}</span> {ev.title}
                                </button>
                              ))}
                            </div>
                          ) : (
                            run.map((ev, i) => (
                              <button
                                key={`${ev.slug}-${i}`}
                                type="button"
                                onClick={() => select(ev)}
                                title={ev.title}
                                className={cn(
                                  'w-full truncate rounded-control px-1.5 py-0.5 text-left text-2xs font-medium transition-colors',
                                  itemChipClass(ev.layer, ev.stage),
                                  activeSeries !== null && ev.seriesKey === activeSeries && 'ring-2 ring-primary/50',
                                )}
                              >
                                <span className="tabular-nums">{ev.timeLabel}</span> {ev.title}
                              </button>
                            ))
                          ),
                        )}
                        {cards.length > 3 && (
                          <button
                            type="button"
                            onClick={() => {
                              goTo({ year: Number(cell.date.slice(0, 4)), month1: Number(cell.date.slice(5, 7)) })
                              setView('list')
                            }}
                            className="px-1.5 text-left text-2xs font-medium text-muted hover:text-text"
                          >
                            +{cards.length - 3} more
                          </button>
                        )}
                        {(dots.length > 0 || pending.length > 0) && (
                          <div className="flex flex-wrap items-center gap-0.5">
                            {dots.map((ev, i) => (
                              <button
                                key={`dot-${ev.slug}-${i}`}
                                type="button"
                                onClick={() => select(ev)}
                                aria-label={`${ev.title}, ${ev.timeLabel}`}
                                title={`${ev.title}, ${ev.timeLabel}`}
                                className="inline-flex h-5 w-5 items-center justify-center rounded-pill transition-colors hover:bg-primary/10"
                              >
                                <span
                                  className={cn(
                                    'h-1.5 w-1.5 rounded-pill',
                                    activeSeries !== null && ev.seriesKey === activeSeries
                                      ? 'bg-primary ring-2 ring-primary/40'
                                      : 'bg-primary/60',
                                  )}
                                />
                              </button>
                            ))}
                            {pending.map((s) => (
                              <span
                                key={`pending-${s.key}`}
                                title={`${s.name}, not open yet`}
                                className="inline-flex h-5 w-5 items-center justify-center"
                              >
                                <span
                                  className={cn(
                                    'h-1.5 w-1.5 rounded-pill border',
                                    activeSeries === s.key ? 'border-primary ring-2 ring-primary/40' : 'border-primary/60',
                                  )}
                                />
                                <span className="sr-only">{s.name}, a date that is not open yet</span>
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      {cancelled.length > 0 && cancelledCellFooter(cancelled, select)}
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
          </div>
        </>
      )}

      <Dialog open={selected !== null} onClose={() => setSelected(null)} ariaLabel="Details" className="max-w-md">
        {selected && (
          <div className="overflow-hidden rounded-card border border-border bg-surface lift-3">
            <CalendarPreview
              item={selected}
              inViewerTz={inViewerTz}
              onToggleTz={() => setInViewerTz((v) => !v)}
              onClose={() => setSelected(null)}
              onEditEntry={
                onEditEntry
                  ? (item) => {
                      setSelected(null)
                      onEditEntry(item)
                    }
                  : undefined
              }
              onPickDate={
                onPickDate
                  ? (item) => {
                      setSelected(null)
                      onPickDate(item)
                    }
                  : undefined
              }
            />
          </div>
        )}
      </Dialog>
    </div>
  )
}

/** Small muted titles at the bottom of a date square. Not a chip. Not struck through. */
function cancelledCellFooter(items: CalendarEvent[], onSelect: (ev: CalendarEvent) => void) {
  return (
    <ul data-calendar-cancelled-footer className="mt-auto flex flex-col gap-0.5 pt-1">
      {items.map((ev) => (
        <li key={`${ev.slug}-${ev.dayKey}`}>
          <button
            type="button"
            onClick={() => onSelect(ev)}
            title={ev.title}
            className="w-full truncate rounded-control text-left text-2xs text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <span className="sr-only">Cancelled. </span>
            {ev.title}
          </button>
        </li>
      ))}
    </ul>
  )
}

function Badges({ ev }: { ev: CalendarEvent }) {
  if (!ev.sourceLabel && !ev.statusLabel) return null
  return (
    <span className="mt-1 flex flex-wrap items-center gap-1">
      {ev.statusLabel && (
        <span className="inline-block rounded-control bg-surface-elevated px-1.5 py-0.5 text-2xs font-semibold text-muted">
          {ev.statusLabel}
        </span>
      )}
      {ev.sourceLabel && (
        <span className="inline-block rounded-control bg-surface-elevated px-1.5 py-0.5 text-2xs font-medium text-muted">
          {ev.sourceLabel}
        </span>
      )}
    </span>
  )
}

/** One calendar item in full: the popup body AND the list's preview pane, so the two never drift. */
function CalendarPreview({
  item,
  inViewerTz,
  onToggleTz,
  onClose,
  onOpenHost,
  onEditEntry,
  onPickDate,
}: {
  item: CalendarEvent
  inViewerTz: boolean
  onToggleTz: () => void
  onClose?: () => void
  /** The host-owned popup (the Space page Events block), opened from the preview pane. */
  onOpenHost?: (ev: CalendarEvent) => void
  onEditEntry?: (item: CalendarEvent) => void
  onPickDate?: (item: CalendarEvent) => void
}) {
  const isEvent = (item.layer ?? 'events') === 'events'
  const viewerLabel = viewerZoneLabel(item.startInstantIso)
  const showViewer = inViewerTz && viewerLabel !== null
  const whenText = showViewer ? viewerLabel : item.whenLabel
  return (
    <div>
      {item.coverUrl && (
        // eslint-disable-next-line @next/next/no-img-element -- external public bucket URL, not a local asset
        <img
          src={item.coverUrl}
          alt=""
          className="h-40 w-full object-cover"
          style={eventCoverFocusStyle(item.coverFocus)}
          loading="lazy"
        />
      )}
      <div className="p-6">
        {item.isCancelled && <p className="mb-2 text-meta font-semibold text-danger">Cancelled</p>}
        <h3 className="text-lead font-bold leading-tight text-text">{item.title}</h3>
        <Badges ev={item} />
        <div className="mt-3 flex items-start gap-2 text-body-sm text-muted">
          <CalendarDays className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>{whenText}</span>
        </div>
        {viewerLabel !== null && (
          <button
            type="button"
            onClick={onToggleTz}
            className="ml-6 mt-1 text-meta font-medium text-primary-strong underline-offset-2 hover:underline"
          >
            {showViewer ? 'Show in event timezone' : 'Show in my timezone'}
          </button>
        )}
        {item.location && (
          <div className="mt-1.5 flex items-start gap-2 text-body-sm text-muted">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span>{item.location}</span>
          </div>
        )}
        {item.goingCount > 0 && (
          <div className="mt-1.5 flex items-start gap-2 text-body-sm text-muted">
            <Users className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span>
              <span className="font-semibold text-text tabular-nums">{item.goingCount}</span> going
            </span>
          </div>
        )}
        {item.description && (
          <div className="mt-3">
            {!isEvent && <p className="text-meta font-semibold text-muted">Description</p>}
            <p className="whitespace-pre-line text-body-sm text-text">{item.description}</p>
          </div>
        )}
        {item.notes && (
          <div className="mt-3">
            {!isEvent && <p className="text-meta font-semibold text-muted">Team notes</p>}
            <p className="whitespace-pre-line text-body-sm text-text">{item.notes}</p>
          </div>
        )}
        <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
          {onClose && (
            <button type="button" onClick={onClose} className={buttonClasses('secondary', 'sm')}>
              Close
            </button>
          )}
          {!isEvent && item.entryId && item.optionGroup && onPickDate && (
            <button type="button" onClick={() => onPickDate(item)} className={buttonClasses('secondary', 'sm')}>
              Keep this date
            </button>
          )}
          {!isEvent && item.entryId && onEditEntry && (
            <button type="button" onClick={() => onEditEntry(item)} className={buttonClasses('primary', 'sm')}>
              <Pencil className="h-4 w-4" aria-hidden />
              Edit
            </button>
          )}
          {isEvent &&
            (item.editHref ? (
              <>
                <Link href={`/events/${item.slug}`} className={buttonClasses('secondary', 'sm')}>
                  View
                  <ArrowUpRight className="h-4 w-4" aria-hidden />
                </Link>
                <Link href={item.editHref} className={buttonClasses('primary', 'sm')}>
                  Edit event
                </Link>
              </>
            ) : onOpenHost ? (
              <button type="button" onClick={() => onOpenHost(item)} className={buttonClasses('primary', 'sm')}>
                Details
              </button>
            ) : (
              <Link href={`/events/${item.slug}`} className={buttonClasses('primary', 'sm')}>
                Go to event
                <ArrowUpRight className="h-4 w-4" aria-hidden />
              </Link>
            ))}
        </div>
      </div>
    </div>
  )
}
