'use client'

import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { LayoutDashboard } from 'lucide-react'
import { EventCalendar } from '@/components/events/event-calendar'
import {
  CalendarLayerChips,
  CalendarMonthTitle,
  CalendarPaging,
  MonthJumpPanel,
  countByMonthKey,
  monthCount,
} from '@/components/events/calendar-chrome'
import { addMonth, monthLabel } from '@/lib/events/calendar-grid'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { CalendarModeToggle } from '@/components/spaces/calendar-mode-toggle'
import { calendarViewBlurb, surfaceHasMonth, surfaceOf, viewForSurface, type CalendarSurface } from '@/lib/calendar/admin-views'
import { MEMBER_SURFACES } from '@/lib/calendar/member-calendar'
import { audienceHref } from '@/lib/calendar/audience'
import type { CalendarEvent } from '@/lib/calendar/item'
import type { CalendarLayerKey } from '@/lib/calendar/registry'
import type { AstroMarker as SkyMarker } from '@/lib/calendar/astro-markers'

// THE PUBLIC CALENDAR TAB (SCAN-1344, owner ruling 2026-11-25: "Public only, link to team").
//
// /spaces/<slug>/calendar is the calendar a guest sees, and it is the same calendar for EVERYONE,
// the Space's own team included. It used to carry a second team calendar for operators (the older
// staff grid, a List index, a Workflow board, a full-screen console and Ask Vera) beside the team
// calendar at /spaces/<slug>/settings/calendar, so a team member learned two tools that shared
// data but not behaviour. The team's tools live in one place now. A viewer who may run the Space's
// events gets one button, "Open team calendar", that goes there; nobody else sees it.
//
// What stays here is what a visitor needs: the Up next band, one control bar (the month, paging,
// the jump panel, the member's filter, Grid or List, and Subscribe), and the month grid. The bar
// draws the month controls, so the grid runs with `hostChrome` and draws none of its own.

export function CalendarWorkspace({
  slug,
  brandName,
  showTeamLink = false,
  initialYear,
  initialMonth1,
  monthPinned = false,
  guestEvents,
  guestFirstUse,
  subscribe,
  upcoming = null,
  memberLayers = [],
  skyMarkers,
  loadGuestMonth,
  eventOrigin,
}: {
  eventOrigin?: string
  slug: string
  brandName: string
  /** The viewer may run this Space's events: draw the one button to the team calendar. */
  showTeamLink?: boolean
  initialYear: number
  initialMonth1: number
  /** The link named the month (`?y=&m=`): the browser leaves it where the link put it. */
  monthPinned?: boolean
  guestEvents: CalendarEvent[]
  guestFirstUse: boolean
  subscribe: ReactNode
  /** THE UP NEXT BAND (LIVE-520), server-rendered: what is next at this Space, above the control
   *  bar. Null (or a component that renders null) when nothing is ahead, so no heading over nothing. */
  upcoming?: ReactNode
  /** The layers a member may filter by, already reduced to the ones that would filter something
   *  (`memberLayerChoices`). Empty means no chips at all: a one-option filter changes nothing. */
  memberLayers?: readonly CalendarLayerKey[]
  /** THE SKY (LIVE-526), server-computed and handed straight to the grid. */
  skyMarkers?: readonly SkyMarker[]
  loadGuestMonth: (year: number, month1: number) => Promise<CalendarEvent[]>
}) {
  const [month, setMonth] = useState({ year: initialYear, month1: initialMonth1 })
  const [gridView, setGridView] = useState<'grid' | 'list'>('grid')
  const [hiddenLayers, setHiddenLayers] = useState<ReadonlySet<CalendarLayerKey>>(() => new Set())
  const toggleLayer = useCallback((key: CalendarLayerKey) => {
    setHiddenLayers((cur) => {
      const next = new Set(cur)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])

  // Grid or List, the member's two surfaces (MEMBER_SURFACES). No cookie and no URL write: the
  // grid/list choice has never been in the address, so a share link stays clean.
  const surface = surfaceOf('guest', gridView)
  const selectSurface = useCallback((next: CalendarSurface) => {
    if (!MEMBER_SURFACES.includes(next)) return
    setGridView(viewForSurface(next, 'month', 'guest').gridView)
  }, [])

  const monthButtonRef = useRef<HTMLButtonElement | null>(null)
  const [jumpOpen, setJumpOpen] = useState(false)
  const [jumpYear, setJumpYear] = useState(month.year)
  const countByMonth = useMemo(() => countByMonthKey(guestEvents), [guestEvents])
  const closeJump = () => {
    setJumpOpen(false)
    monthButtonRef.current?.focus()
  }
  const step = (delta: number) => setMonth(addMonth(month.year, month.month1, delta))
  const today = () => {
    const now = new Date()
    setMonth({ year: now.getFullYear(), month1: now.getMonth() + 1 })
  }
  const now = new Date()
  const onCurrentMonth = month.year === now.getFullYear() && month.month1 === now.getMonth() + 1
  const hasMonth = surfaceHasMonth(surface, 'month')

  const heading = (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
      <h2 className="text-lead font-bold text-text">What&rsquo;s happening</h2>
      <p className="text-body-sm text-muted">{calendarViewBlurb('guest', brandName)}</p>
    </div>
  )

  // TWO ROWS (LIVE-494): row one is what you are looking at (the month and the filter), row two is
  // what you do about it (the way of looking, the team door, Subscribe). The bar is drawn for every
  // viewer, signed out included: the grid draws no month controls of its own here, so without the
  // bar a visitor could not leave the month the page opened on.
  const pageBar = (
    <div data-calendar-page-header className="flex flex-col gap-2.5 rounded-card border border-border bg-surface px-4 py-3 sm:px-5">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div data-calendar-page-month data-calendar-page-month-jump className="relative flex min-w-0 items-center gap-1.5">
          <CalendarMonthTitle
            label={monthLabel(month.year, month.month1)}
            hasMonth={hasMonth}
            fallbackTitle="Gatherings"
            jumpOpen={jumpOpen}
            onToggleJump={() => {
              setJumpYear(month.year)
              setJumpOpen((o) => !o)
            }}
            buttonRef={monthButtonRef}
          />
          {hasMonth ? (
            <div data-calendar-page-paging className="shrink-0">
              <CalendarPaging onStep={step} onToday={today} onCurrentMonth={onCurrentMonth} />
            </div>
          ) : null}
        </div>
        {memberLayers.length > 0 ? (
          <div data-calendar-page-layers className="flex shrink-0 items-center">
            <CalendarLayerChips layers={memberLayers} hidden={hiddenLayers} onToggle={toggleLayer} density="micro" />
          </div>
        ) : (
          <span />
        )}
      </div>

      <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div data-calendar-page-view-switch className="flex min-w-0 flex-wrap items-center gap-2">
          <CalendarModeToggle surface={surface} onSelect={selectSurface} surfaces={MEMBER_SURFACES} />
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {showTeamLink && (
            <Button size="sm" variant="secondary" asChild>
              <Link
                href={audienceHref(slug, 'team')}
                title="Plan, pencil and run events on the team calendar"
                data-calendar-manager-link
                data-calendar-team-link
              >
                <LayoutDashboard className="h-4 w-4" aria-hidden />
                Open team calendar
              </Link>
            </Button>
          )}
          {subscribe}
        </div>
      </div>

      {/* The jump panel spans the bar under both rows, so opening it never reflows the controls.
          Escape closes it and hands focus back to the month button. */}
      {jumpOpen && hasMonth ? (
        <div
          className="border-t border-border pb-1 pt-2"
          onKeyDown={(e) => {
            if (e.key !== 'Escape') return
            e.preventDefault()
            e.stopPropagation()
            closeJump()
          }}
        >
          <MonthJumpPanel
            shownYear={month.year}
            shownMonth1={month.month1}
            jumpYear={jumpYear}
            onJumpYear={setJumpYear}
            countFor={(y, m1) => monthCount(countByMonth, y, m1)}
            onPick={(next) => {
              setMonth(next)
              closeJump()
            }}
          />
        </div>
      ) : null}
    </div>
  )

  return (
    <div className="space-y-4" data-calendar-workspace data-calendar-view="guest">
      {heading}
      {/* ABOVE THE CONTROL BAR (LIVE-520): the band is content, the bar is chrome for the grid under it. */}
      {upcoming}
      {pageBar}
      <div className="space-y-4">
        <EventCalendar
          events={guestEvents}
          eventOrigin={eventOrigin}
          skyMarkers={skyMarkers}
          initialYear={initialYear}
          initialMonth1={initialMonth1}
          monthPinned={monthPinned}
          loadMonth={loadGuestMonth}
          month={month}
          onMonthChange={setMonth}
          view={gridView}
          onViewChange={setGridView}
          hiddenLayers={hiddenLayers}
          onHiddenLayersChange={setHiddenLayers}
          /* THE MONTHS SCROLL (LIVE-530): one continuous run of months instead of flipped pages. */
          monthFlow="scroll"
          /* The bar above draws the month, the paging, the jump and the chips, so the grid draws none. */
          hostChrome
          hostViewSwitch
        />
        {guestFirstUse && (
          <EmptyState
            variant="first-use"
            title="Nothing on the calendar yet."
            description={`${brandName} has not published a gathering. Subscribe and new dates will land in your own calendar.`}
          />
        )}
      </div>
    </div>
  )
}
