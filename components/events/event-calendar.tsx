'use client'

import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import Link from 'next/link'
import {
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  MapPin,
  ArrowUpRight,
  CalendarDays,
  Users,
  Plus,
  Pencil,
} from 'lucide-react'
import { Dialog } from '@/components/ui/dialog'
import { buttonClasses } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { monthMatrix, monthLabel, addMonth, calendarChrome, cellFloorClass, WEEKDAY_LABELS, SHORT_MONTH_LABELS } from '@/lib/events/calendar-grid'
import { CalendarLayerChips, CalendarViewSwitch, MonthJumpPanel, countByMonthKey, monthCount } from '@/components/events/calendar-chrome'
import { eventCoverFocusStyle } from '@/lib/events/cover-focus'
import { IconButton } from '@/components/ui/icon-button'
import { CalendarRepeatsStrip } from '@/components/events/calendar-repeats-strip'
import type { CalendarRepeatSeries } from '@/lib/events/calendar-repeats'
import { itemChipClass, type CalendarLayerKey } from '@/lib/calendar/registry'
import { spanDayKeys } from '@/lib/calendar/entries'
import { notesForDay, type DayNote } from '@/lib/calendar/day-notes'
import { monthKey } from '@/lib/calendar/month-window'
import { stackDay } from '@/lib/calendar/sunday-stack'
import { shortDateLabel } from '@/lib/calendar/short-date'
import { useMonthGestures } from './use-month-gestures'
import { DAY_CELL_ATTR, useDateMove } from './use-date-move'
import { withMovedDay, type EntryMove } from '@/lib/calendar/date-move'
import type { CalendarEvent } from '@/lib/calendar/item'

export type { CalendarEvent } from '@/lib/calendar/item'

// The month-grid calendar (Events EC2, upgraded by ADR-1385). Renders a Space's (or the platform's)
// calendar items on a month grid or a list. Every mount gets the same navigation:
//   · arrows, a Today button that stays put (disabled while the current month is showing, so a
//     keyboard user never loses the control under their focus), and a month-and-year jump behind
//     the month title
//   · PageUp / PageDown for a month, Shift for a year, anywhere inside the calendar
//   · ArrowLeft / ArrowRight step a month when the calendar itself is focused
//   · Escape closes the month-and-year jump
//   · a sideways trackpad swipe or a touch swipe (and, where the mount opts in, the vertical wheel)
//     through components/events/use-month-gestures.ts
// FOCUS NEVER DROPS TO THE BODY (LIVE-469): Today, a month picked in the jump panel and Escape on
// that panel all land focus on the month title button, the one control that is always there and
// that reads the month just shown.
// A mount that passes `loadMonth` fetches each month it has not loaded yet, so browsing back or far
// forward is never a falsely empty grid: a fetch that fails says so above the grid, with a retry,
// instead of quietly showing an empty month. The LIST is a list on the left and a preview of the selected
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

const SHORT_MONTHS = SHORT_MONTH_LABELS
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
  onMoveEntry,
  moveNotice,
  month,
  onMonthChange,
  view: viewProp,
  onViewChange,
  hiddenLayers: hiddenLayersProp,
  onHiddenLayersChange,
  fill = false,
  hostChrome = false,
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
  /** MOVING A DATE BY HAND (PROG-CAL15), the console's edit and nowhere else's. Passed, every chip
   *  can be dragged onto another day and a focused chip moves with Shift and an arrow; absent, the
   *  grid is click-to-open exactly as it always was. The grid never writes: it hands the host a
   *  planned move (or a refusal, with the line to show) and the host takes it to the move seam. */
  onMoveEntry?: (move: EntryMove) => void
  /** The one line the host has to say about the last move, announced here because this is where the
   *  move happened. The console shows the same sentence in its header. */
  moveNotice?: string | null
  /** CONTROLLED MONTH (PROG-CAL12). When the host passes `month`, the grid shows that month and reports
   *  every step, jump and Today through `onMonthChange` instead of keeping the month itself, so a
   *  header outside the grid (the Calendar console's Prev / Today / Next, its agenda, its keys) and
   *  the grid always agree. Absent, the grid owns its month as it always has. */
  month?: { year: number; month1: number }
  onMonthChange?: (next: { year: number; month1: number }) => void
  /** CONTROLLED VIEW AND CONTROLLED LAYERS (LIVE-485), the same shape `month` already has. The
   *  Calendar console's header draws the grid / list switcher and the layer chips now, so the host
   *  has to hold what they toggle; absent, the grid keeps both itself exactly as it always has. */
  view?: 'grid' | 'list'
  onViewChange?: (next: 'grid' | 'list') => void
  hiddenLayers?: ReadonlySet<CalendarLayerKey>
  onHiddenLayersChange?: (next: ReadonlySet<CalendarLayerKey>) => void
  /** Stretch to the host's height: the week rows share whatever is left below the header, so a
   *  full-viewport mount (the console) is a wall of days rather than a card with a gap under it.
   *  A day with more items than its share can show scrolls inside its own cell. */
  fill?: boolean
  /** THE HOST DRAWS THE MONTH (PROG-CAL13, corrected by LIVE-475). The month label and the Prev /
   *  Today / Next cluster come off, because the host's own header already carries both: inside the
   *  Calendar console the page was paying for each of them twice and the month itself was cut off
   *  partway through the fourth week. The grid / list switcher and the month-and-year jump STAY,
   *  because no host draws either of them and dropping them left the console a dead end (see THE
   *  CHROME THE HOST CANNOT DRAW, below). The filters, the failed-month line and every key stay too.
   *  On the page, where nothing else owns them, this is off and the grid draws its full header. */
  hostChrome?: boolean
}) {
  const [internalMonth, setInternalMonth] = useState({ year: initialYear, month1: initialMonth1 })
  const { year, month1 } = month ?? internalMonth
  const [selected, setSelected] = useState<CalendarEvent | null>(null)
  const [inViewerTz, setInViewerTz] = useState(false)
  const [internalView, setInternalView] = useState<'grid' | 'list'>(initialView)
  const view = viewProp ?? internalView
  const setView = useCallback(
    (next: 'grid' | 'list') => {
      setInternalView(next)
      onViewChange?.(next)
    },
    [onViewChange],
  )
  const [activeSeries, setActiveSeries] = useState<string | null>(null)
  const [jumpOpen, setJumpOpen] = useState(false)
  const [jumpYear, setJumpYear] = useState(initialYear)
  const [internalHiddenLayers, setInternalHiddenLayers] = useState<ReadonlySet<CalendarLayerKey>>(new Set())
  const hiddenLayers = hiddenLayersProp ?? internalHiddenLayers
  const toggleLayer = useCallback(
    (key: CalendarLayerKey) => {
      const next = new Set(hiddenLayers)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      setInternalHiddenLayers(next)
      onHiddenLayersChange?.(next)
    },
    [hiddenLayers, onHiddenLayersChange],
  )
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
  // The month whose fetch failed, if the shown one did. Its error line (with Try again) is the
  // difference between "nothing this month" and "the month never arrived".
  const [failedKey, setFailedKey] = useState<string | null>(null)
  const [retryTick, setRetryTick] = useState(0)
  const requested = useRef(new Set<string>())
  const rootRef = useRef<HTMLDivElement>(null)
  const monthButtonRef = useRef<HTMLButtonElement>(null)
  const popupTitleId = useId()
  // Dates this grid has moved and the server has not confirmed yet: entry id -> its new day.
  // Dropped with the fetched months, because the same `refreshKey` bump is the host saying the
  // answer is on the server now (PROG-CAL15).
  const [heldMoves, setHeldMoves] = useState<ReadonlyMap<string, string>>(new Map())
  const [cacheEpoch, setCacheEpoch] = useState(refreshKey)
  if (cacheEpoch !== refreshKey) {
    // A save changed what fetched months hold: drop them (render-time state reset, no effect cascade).
    setCacheEpoch(refreshKey)
    setFetched(new Map())
    if (heldMoves.size > 0) setHeldMoves(new Map())
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
    setFailedKey(null)
    loadMonth(year, month1)
      .then((items) => {
        done = true
        if (live) setFetched((cur) => new Map(cur).set(key, items))
      })
      .catch(() => {
        // Forget the request so Try again (or coming back) fetches it, and say so: an empty grid
        // that is really a failed fetch is the one thing this component promises never to show.
        asked.delete(key)
        if (live) setFailedKey(key)
      })
      .finally(() => {
        if (live) setLoading(false)
      })
    return () => {
      live = false
      // Left the month before it arrived: forget the request so coming back fetches it again.
      if (!done) asked.delete(key)
    }
  }, [loadMonth, year, month1, initialYear, initialMonth1, refreshKey, retryTick])

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

  /** Where focus lands after Today, a month picked in the jump panel and Escape on that panel
   *  (LIVE-469: it must never fall to the body). The month title is that anchor, and when the host
   *  draws the title instead the calendar itself takes it: it is `tabIndex={0}` and reads "Calendar". */
  const focusMonthAnchor = useCallback(() => {
    ;(monthButtonRef.current ?? rootRef.current)?.focus()
  }, [])

  const gridRef = useRef<HTMLDivElement>(null)
  useMonthGestures(gridRef, step, { vertical: wheelPaging, horizontal: swipePaging, remountKey: view })

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement
    if (target.closest('input, textarea, select, [contenteditable="true"]')) return
    if (e.key === 'Escape' && jumpOpen) {
      e.preventDefault()
      setJumpOpen(false)
      focusMonthAnchor()
      return
    }
    if (e.key === 'PageDown' || e.key === 'PageUp') {
      e.preventDefault()
      const sign = e.key === 'PageDown' ? 1 : -1
      step(e.shiftKey ? sign * 12 : sign)
      return
    }
    // MONTHS RUN DOWN THE PAGE, NOT ACROSS (owner ask 2026-09-23). Down is the next month and Up is
    // the one before, matching the vertical wheel; Left and Right keep doing exactly what they did.
    // Only when the calendar itself holds focus, so arrowing between controls inside it is untouched.
    if (
      (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'ArrowDown') &&
      e.target === e.currentTarget
    ) {
      e.preventDefault()
      step(e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : -1)
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
      const held = ev.entryId ? heldMoves.get(ev.entryId) : undefined
      out.push(held ? withMovedDay(ev, held) : ev)
    }
    return out
  }, [events, fetched, hiddenLayers, heldMoves])

  // MOVING A DATE BY HAND (PROG-CAL15). Off unless the host passed `onMoveEntry`. A planned move is
  // held here on the way past, so the chip is on its new day in the same frame the person let go of
  // it, and a second Shift press is measured from where the date now is.
  const handleMove = useCallback(
    (planned: EntryMove) => {
      if (planned.ok) setHeldMoves((cur) => new Map(cur).set(planned.entryId, planned.toDayKey))
      onMoveEntry?.(planned)
    },
    [onMoveEntry],
  )
  const move = useDateMove(onMoveEntry ? handleMove : undefined, { year, month1 }, rootRef, all)

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
  const countByMonth = useMemo(() => countByMonthKey(all), [all])

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
  // What this grid draws for itself under a host that owns the chrome. Pure, and in
  // lib/events/calendar-grid.ts so it can be RUN rather than read (see the note there).
  const chrome = calendarChrome(hostChrome)

  // THIS GRID'S OWN VIEW SWITCHER: the month grid, or the same calendar as a chronological list.
  // The markup is components/events/calendar-chrome.tsx, because the Calendar console's header
  // draws the very same control now and two copies of it would drift (LIVE-485).
  const viewSwitch = <CalendarViewSwitch view={view} onView={setView} />

  return (
    <div
      ref={rootRef}
      data-calendar-root
      tabIndex={0}
      aria-label="Calendar"
      className={cn(
        '@container rounded-card border border-border bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
        fill && 'flex min-h-0 flex-1 flex-col',
      )}
      onKeyDown={onKeyDown}
    >
      {/* THE MOVE IS SPOKEN HERE (PROG-CAL15). Always mounted, empty until a date is moved: a live
          region only announces changes to what it already holds, so it has to be in the tree before
          the first sentence arrives. It is the same sentence the console header shows, said once. */}
      <p data-calendar-move-live aria-live="polite" className="sr-only">
        {moveNotice ?? ''}
      </p>
      {/* THE HEADER IS THE HOST'S WHEN THERE IS ONE (PROG-CAL13, widened by LIVE-485). Inside the
          Calendar console every one of these controls is drawn once, in the console's own header
          bar: the month label, the Prev / Today / Next cluster, the month-and-year jump, the grid /
          list switcher and the layer chips. So the grid draws none of them and the month gets back
          the four bands of furniture they were costing it.

          🔴 A HOST MAY ONLY TAKE A CONTROL IT DRAWS (LIVE-475). The first cut of `hostChrome`
          dropped this whole header, and the switcher and the jump went with it although NOTHING
          outside this component drew either one. That shipped a reachable dead end: switch the page
          grid to List, press Fullscreen, and you were in list mode inside a full-screen console
          with no way back to the month and no way to move more than one month at a time, with
          closing the console the only exit. The console header genuinely carries both now, which is
          what lets them come off here, and `HOST_DRAWN_CONTROL_MARKS` in lib/events/calendar-grid.ts
          is the gate that keeps that true rather than a promise in a comment.

          The Loading live region is NOT chrome: a month that has not arrived has to be announced
          wherever the grid is mounted, so it stays either way, and under a host it is the only
          thing left of this header. */}
      {!chrome.monthTitle && !chrome.paging && !chrome.viewSwitch && !chrome.monthJump ? (
        <span role="status" className="sr-only">
          {loading ? 'Loading' : null}
        </span>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
          <div className="relative flex items-center gap-1">
            <button
              ref={monthButtonRef}
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
            {/* Always mounted: a live region announces changes to what it already holds, so it has
                to be in the tree before Loading appears in it. */}
            <span role="status" className="text-meta text-muted">
              {loading ? 'Loading' : null}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1">
              <IconButton label="Previous month" onClick={() => step(-1)}>
                <ChevronLeft className="h-4 w-4" aria-hidden />
              </IconButton>
              {/* Stays mounted on the current month (disabled), so it never vanishes from under the
                  focus that just pressed it; that focus moves to the month title, which reads the
                  month it landed on. */}
              <button
                type="button"
                disabled={onCurrentMonth}
                onClick={() => {
                  goTo({ year: todayYear, month1: todayMonth1 })
                  focusMonthAnchor()
                }}
                className="tap-target rounded-control px-2.5 py-1 text-body-sm font-medium text-muted transition-colors hover:bg-surface-elevated hover:text-text disabled:cursor-default disabled:opacity-50 disabled:hover:bg-transparent disabled:hover:text-muted"
              >
                Today
              </button>
              <IconButton label="Next month" onClick={() => step(1)}>
                <ChevronRight className="h-4 w-4" aria-hidden />
              </IconButton>
            </div>
            {chrome.viewSwitch && viewSwitch}
          </div>
        </div>
      )}

      {/* MONTH + YEAR JUMP: twelve months of a year, each marked when it holds anything on hand.
          The panel itself is components/events/calendar-chrome.tsx, shared with the console header's
          own jump so the two mark the same months and carry the same names. */}
      {jumpOpen && chrome.monthJump && (
        <MonthJumpPanel
          shownYear={year}
          shownMonth1={month1}
          jumpYear={jumpYear}
          onJumpYear={setJumpYear}
          countFor={(y, m1) => monthCount(countByMonth, y, m1)}
          onPick={(next) => {
            goTo(next)
            setJumpOpen(false)
            // The panel unmounts with this button in it: focus goes to the month title.
            focusMonthAnchor()
          }}
          className="border-b border-border px-4 py-3"
        />
      )}

      {/* A FAILED MONTH says so. The grid below still paints, holding only what the page had on
          hand, and this line is what keeps that from reading as an empty month. */}
      {failedKey === shownKey && (
        <p role="alert" data-calendar-load-error className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2 text-body-sm text-danger">
          <span>{monthLabel(year, month1)} did not load.</span>
          <button
            type="button"
            onClick={() => {
              setFailedKey(null)
              setRetryTick((n) => n + 1)
            }}
            className={buttonClasses('secondary', 'sm')}
          >
            Try again
          </button>
        </p>
      )}

      {/* THE LAYER CHIPS, where no host draws them. Inside the console they are in its header bar
          (LIVE-485), which is what took this band off the top of the month. */}
      {showLayerToggles && chrome.layerFilters && (
        <CalendarLayerChips
          layers={layers!}
          hidden={hiddenLayers}
          onToggle={toggleLayer}
          className="border-b border-border px-4 py-2"
        />
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
            // 🔴 THE CLASS MUST NOT OUTLIVE THE ANIMATION (PROG-CAL13). `slide` used to be set on a
            // month change and never cleared, so this wrapper carried its animation class forever.
            // The console's whole point is that its panel set is MOVED between two DOM homes, and
            // taking an element out of the document cancels its animations while putting it back
            // starts them again from zero: every open and every close replayed the month slide under
            // the dialog's own entrance. That is the flicker left after LIVE-472. Clearing it here
            // means the class is present only while it is actually animating.
            onAnimationEnd={(e) => {
              if (e.target === e.currentTarget) setSlide(null)
            }}
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
                  // Three at most in a cell that has a floor and sends the rest to the List; every one
                  // of them when the cell fills and scrolls its own overflow instead.
                  const shown = fill ? cards : cards.slice(0, 3)
                  const dots = liveEvents.filter((ev) => ev.isLaterDate)
                  const pending = pendingByDay.get(cell.date) ?? []
                  const isToday = cell.date === today
                  const dayNum = Number(cell.date.slice(8, 10))
                  const labels = dayNotes?.length ? notesForDay(dayNotes, cell.date) : []
                  const isDropTarget = move.dropDay === cell.date
                  return (
                    <div
                      key={cell.date}
                      // THE DAY IS THE TARGET (PROG-CAL15). The cell takes the drop, and says so
                      // while something is over it: a ring drawn INSIDE its own border, so the
                      // highlight never nudges a neighbour or reflows the week.
                      {...{ [DAY_CELL_ATTR]: cell.date }}
                      data-drop-target={isDropTarget || undefined}
                      onDragOver={move.enabled ? (e) => move.overDay(e, cell.date) : undefined}
                      onDragLeave={move.enabled ? (e) => move.leaveDay(e, cell.date) : undefined}
                      onDrop={move.enabled ? (e) => move.dropOnDay(e, cell.date) : undefined}
                      className={cn(
                        'group flex flex-col border-r border-border p-1.5 last:border-r-0',
                        // A FILLING GRID HAS NO FLOOR (PROG-CAL13). Six rows share the height the host
                        // gives them, so a cell that insisted on 20/28 units of its own is what pushed
                        // the last week of the month off the bottom of the console. The decision is
                        // pure and lives in lib/events/calendar-grid.ts, where a probe can run it.
                        cellFloorClass(fill),
                        !cell.inMonth && 'bg-surface-elevated/40',
                        isDropTarget && 'bg-primary/10 ring-2 ring-inset ring-primary',
                      )}
                    >
                      <div className="mb-1 flex items-center justify-between gap-1">
                        {/* Below sm a 44px touch target plus the day pill does not fit a ~46px
                            cell, so the per-day + steps aside: "Pencil it in" above the grid (or
                            in the console header) is the phone's door, and the day pill keeps its
                            right edge on its own. */}
                        {onCreateAt ? (
                          <span className="hidden sm:contents">
                            <IconButton
                              label={`Add a date on ${shortDateLabel(cell.date)}`}
                              onClick={() => onCreateAt(cell.date)}
                              className="opacity-0 focus-visible:opacity-100 group-hover:opacity-100 pointer-coarse:opacity-100"
                            >
                              <Plus className="h-3.5 w-3.5" aria-hidden />
                            </IconButton>
                          </span>
                        ) : (
                          <span />
                        )}
                        <span
                          aria-current={isToday ? 'date' : undefined}
                          className={cn(
                            'ml-auto inline-flex h-6 min-w-6 items-center justify-center rounded-pill px-1 text-meta font-medium',
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
                      {/* THE OVERFLOW LIVES IN THE CELL. Filling, the day's items scroll here rather
                          than sending the reader to another view, and the wheel that scrolls them is
                          the one gesture that does not page the month (use-month-gestures). */}
                      <div className={cn('flex flex-col gap-1', fill && 'min-h-0 flex-1 overflow-y-auto overscroll-contain')}>
                        {/* A SEGMENT PER ITEM (LIVE-467). Back-to-back items stack into one block, and
                            every item in it keeps its own button, so the second gathering on a busy
                            Sunday opens from the grid like the first. Items that only share the day
                            are separate chips, and the count past three always shows.
                            🔴 EVERY GROUP, NOT THE FIRST. A cell is one date, but its items are not
                            all keyed to it: spanDayKeys files a multi-day item under every date it
                            covers while the item keeps its START dayKey, so a cell can hold two
                            dayKeys. stackDay groups by dayKey and sorts ascending, so reading only
                            [0] drew the continuing item and dropped the date's own, which is how a
                            freshly pencilled date could vanish behind a retreat that began earlier
                            (caught by test/e2e/operator-calendar.spec.ts). Flatten every group. */}
                        {stackDay(shown).flatMap((day) => day.runs).map((run) =>
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
                                  draggable={move.enabled || undefined}
                                  data-move-chip={move.enabled ? ev.entryId ?? undefined : undefined}
                                  onDragStart={move.enabled ? (e) => move.startDrag(e, ev, itemKey(ev)) : undefined}
                                  onDragEnd={move.enabled ? move.endDrag : undefined}
                                  onPointerDown={move.enabled ? (e) => move.pressChip(e, ev, itemKey(ev)) : undefined}
                                  onKeyDown={move.enabled ? (e) => move.chipKeyDown(e, ev) : undefined}
                                  className={cn(
                                    'block w-full truncate px-1.5 py-0.5 text-left text-2xs font-medium transition-colors',
                                    i > 0 && 'border-t border-border/60',
                                    activeSeries !== null && ev.seriesKey === activeSeries && 'ring-2 ring-inset ring-primary/50',
                                    // A CARRIED CHIP OWNS ITS TOUCH (PROG-CAL15). touch-action is read
                                    // when the finger lands, not when the long press fires, so it has to
                                    // be off the chip BEFORE the press: otherwise the grid pans away
                                    // under the very finger that is carrying a date. Only the chip, and
                                    // only where moving is on, so the cell and the month still scroll.
                                    move.enabled && 'touch-none',
                                    move.carrying === itemKey(ev) && 'opacity-60',
                                  )}
                                >
                                  {/* Below sm a cell is about 46px wide: the time alone would fill it and truncate the title to
                                      nothing, so the time stays for a screen reader and steps out of the visible chip
                                      until there is room for both (LIVE-469). */}
                                  <span className="sr-only tabular-nums sm:not-sr-only">{ev.timeLabel} </span>
                                  {ev.title}
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
                                draggable={move.enabled || undefined}
                                data-move-chip={move.enabled ? ev.entryId ?? undefined : undefined}
                                onDragStart={move.enabled ? (e) => move.startDrag(e, ev, itemKey(ev)) : undefined}
                                onDragEnd={move.enabled ? move.endDrag : undefined}
                                onPointerDown={move.enabled ? (e) => move.pressChip(e, ev, itemKey(ev)) : undefined}
                                onKeyDown={move.enabled ? (e) => move.chipKeyDown(e, ev) : undefined}
                                className={cn(
                                  'w-full truncate rounded-control px-1.5 py-0.5 text-left text-2xs font-medium transition-colors',
                                  itemChipClass(ev.layer, ev.stage),
                                  activeSeries !== null && ev.seriesKey === activeSeries && 'ring-2 ring-primary/50',
                                  // See the note on the stacked chip above: touch-action is read when
                                  // the finger lands, so a chip that can be carried never pans the grid.
                                  move.enabled && 'touch-none',
                                  move.carrying === itemKey(ev) && 'opacity-60',
                                )}
                              >
                                {/* Below sm a cell is about 46px wide: the time alone would fill it and truncate the title to
                                      nothing, so the time stays for a screen reader and steps out of the visible chip
                                      until there is room for both (LIVE-469). */}
                                  <span className="sr-only tabular-nums sm:not-sr-only">{ev.timeLabel} </span>
                                  {ev.title}
                              </button>
                            ))
                          ),
                        )}
                        {!fill && cards.length > 3 && (
                          /* THE COUNT NAMES WHAT IT HIDES. A cell draws at most three chips, so on a busy
                             day everything past the third was reachable only by opening the List and had
                             no name at all: a sighted reader saw "+27 more" and a screen reader heard the
                             same. The hidden titles ride the button's own name, so hovering says what is
                             under there and assistive tech reads it out. */
                          <button
                            type="button"
                            onClick={() => {
                              goTo({ year: Number(cell.date.slice(0, 4)), month1: Number(cell.date.slice(5, 7)) })
                              setView('list')
                            }}
                            aria-label={`${cards.length - 3} more on this day: ${cards.slice(3).map((ev) => ev.title).join(', ')}`}
                            title={cards.slice(3).map((ev) => ev.title).join(', ')}
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

      {/* Named by the entry's own title, so a screen reader hears "New moon sit, dialog" rather
          than one "Details" for every popup on the grid. */}
      <Dialog open={selected !== null} onClose={() => setSelected(null)} ariaLabelledBy={popupTitleId} className="max-w-md">
        {selected && (
          <div className="overflow-hidden rounded-card border border-border bg-surface lift-3">
            <CalendarPreview
              item={selected}
              titleId={popupTitleId}
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
  titleId,
}: {
  item: CalendarEvent
  inViewerTz: boolean
  onToggleTz: () => void
  onClose?: () => void
  /** The popup's `aria-labelledby` target: the title names the dialog. Absent in the list pane. */
  titleId?: string
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
        <h3 id={titleId} className="text-lead font-bold leading-tight text-text">{item.title}</h3>
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
            {showViewer ? 'Show in event time zone' : 'Show in my time zone'}
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
