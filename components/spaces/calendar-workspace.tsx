'use client'

import { useCallback, useMemo, useState, useTransition, type ReactNode } from 'react'
import { EventCalendar } from '@/components/events/event-calendar'
import { EmptyState } from '@/components/ui/empty-state'
import { StaffCalendar } from '@/app/(main)/spaces/[slug]/settings/calendar/staff-calendar'
import { CalendarModeToggle } from '@/components/spaces/calendar-mode-toggle'
import { CalendarListView } from '@/components/spaces/calendar-list-view'
import { CalendarTimelineView } from '@/components/spaces/calendar-timeline-view'
import { CalendarProjectsView } from '@/components/spaces/calendar-projects-view'
import {
  adminViewHref,
  calendarViewBlurb,
  CALENDAR_ADMIN_VIEWS,
  rememberCalendarView,
  type CalendarAdminView,
} from '@/lib/calendar/admin-views'
import { listIndexItems, selectListItem } from '@/lib/calendar/list-index'
import { monthTimelineBars, monthTimelineDays } from '@/lib/calendar/month-timeline'
import { projectBoard } from '@/lib/calendar/project-board'
import type { CalendarEvent } from '@/lib/calendar/item'
import type { DayNote } from '@/lib/calendar/day-notes'
import type { SpacePlan } from '@/lib/calendar/plans'

// OPERATOR CALENDAR SHELL (ADR-1467). Guest and Admin data load once on the
// server. Switching a view slides the already-mounted panels. The last view
// is a cookie. Unsigned visitors never receive this shell with admin events.

export function CalendarWorkspace({
  slug,
  spaceId,
  brandName,
  adminAllowed,
  canManage,
  initialView,
  initialListItem,
  initialYear,
  initialMonth1,
  timelineYear: timelineYearStart,
  timelineMonth1: timelineMonthStart,
  todayKey,
  guestEvents,
  guestFirstUse,
  adminEvents,
  dayNotes,
  plans,
  subscribe,
  loadGuestMonth,
  loadAdminMonth,
}: {
  slug: string
  spaceId: string
  brandName: string
  adminAllowed: boolean
  canManage: boolean
  initialView: CalendarAdminView
  initialListItem: string | null
  initialYear: number
  initialMonth1: number
  timelineYear: number
  timelineMonth1: number
  todayKey: string
  guestEvents: CalendarEvent[]
  guestFirstUse: boolean
  adminEvents: CalendarEvent[]
  dayNotes: DayNote[]
  plans: SpacePlan[]
  subscribe: ReactNode
  loadGuestMonth: (year: number, month1: number) => Promise<CalendarEvent[]>
  loadAdminMonth: (year: number, month1: number) => Promise<CalendarEvent[]>
}) {
  const [view, setView] = useState<CalendarAdminView>(adminAllowed ? initialView : 'guest')
  const [listKey, setListKey] = useState<string | null>(initialListItem)
  const [timelineYear, setTimelineYear] = useState(timelineYearStart)
  const [timelineMonth1, setTimelineMonth1] = useState(timelineMonthStart)
  const [timelineEvents, setTimelineEvents] = useState(adminEvents)
  const [timelinePending, startTimelineTransition] = useTransition()

  const items = useMemo(() => (adminAllowed ? listIndexItems(adminEvents) : []), [adminAllowed, adminEvents])
  const selected = useMemo(() => selectListItem(items, listKey), [items, listKey])
  const timelineDays = useMemo(
    () => monthTimelineDays(timelineYear, timelineMonth1, todayKey),
    [timelineYear, timelineMonth1, todayKey],
  )
  const timelineBars = useMemo(
    () => monthTimelineBars(timelineEvents, timelineYear, timelineMonth1),
    [timelineEvents, timelineYear, timelineMonth1],
  )
  const columns = useMemo(() => (adminAllowed ? projectBoard(adminEvents) : []), [adminAllowed, adminEvents])

  const syncUrl = useCallback(
    (next: CalendarAdminView, extras?: { item?: string | null; year?: number; month1?: number }) => {
      if (typeof window === 'undefined') return
      window.history.replaceState(null, '', adminViewHref(slug, next, extras))
    },
    [slug],
  )

  const selectView = useCallback(
    (next: CalendarAdminView) => {
      if (!adminAllowed) return
      setView(next)
      rememberCalendarView(slug, next)
      if (next === 'list') syncUrl(next, { item: listKey ?? selected?.key })
      else if (next === 'timeline') syncUrl(next, { year: timelineYear, month1: timelineMonth1 })
      else syncUrl(next)
    },
    [adminAllowed, slug, listKey, selected?.key, timelineYear, timelineMonth1, syncUrl],
  )

  const selectList = useCallback(
    (key: string) => {
      setListKey(key)
      syncUrl('list', { item: key })
    },
    [syncUrl],
  )

  const changeTimelineMonth = useCallback(
    (year: number, month1: number) => {
      setTimelineYear(year)
      setTimelineMonth1(month1)
      syncUrl('timeline', { year, month1 })
      setTimelineEvents([])
      startTimelineTransition(async () => {
        try {
          setTimelineEvents(await loadAdminMonth(year, month1))
        } catch {
          setTimelineEvents([])
        }
      })
    },
    [loadAdminMonth, syncUrl],
  )

  const guestBody = (
    <>
      <EventCalendar
        events={guestEvents}
        initialYear={initialYear}
        initialMonth1={initialMonth1}
        loadMonth={loadGuestMonth}
      />
      {guestFirstUse && (
        <EmptyState
          variant="first-use"
          title="Nothing on the calendar yet."
          description={`${brandName} has not published a gathering. Subscribe and new dates will land in your own calendar.`}
        />
      )}
    </>
  )

  const heading = (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 className="text-lead font-bold text-text">Calendar</h2>
        <p className="text-body-sm text-muted">{calendarViewBlurb(view, brandName)}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {adminAllowed && <CalendarModeToggle mode={view} onSelect={selectView} />}
        {subscribe}
      </div>
    </div>
  )

  if (!adminAllowed) {
    return (
      <div className="space-y-4" data-calendar-workspace data-calendar-view="guest">
        {heading}
        {guestBody}
      </div>
    )
  }

  const index = Math.max(0, CALENDAR_ADMIN_VIEWS.indexOf(view))

  return (
    <div className="space-y-4" data-calendar-workspace data-calendar-view={view}>
      {heading}
      <div className="overflow-hidden">
        <div
          className="flex transition-transform duration-300 ease-out"
          style={{ transform: `translateX(-${index * 100}%)` }}
        >
          {CALENDAR_ADMIN_VIEWS.map((panel) => {
            const active = panel === view
            return (
              <section
                key={panel}
                className="w-full shrink-0"
                aria-hidden={!active}
                {...(!active ? { inert: true } : {})}
                data-calendar-panel={panel}
              >
                {panel === 'guest' ? guestBody : null}
                {panel === 'admin' ? (
                  <div data-calendar-admin-grid>
                    <StaffCalendar
                      slug={slug}
                      spaceId={spaceId}
                      events={adminEvents}
                      initialYear={initialYear}
                      initialMonth1={initialMonth1}
                      canEdit={canManage}
                      dayNotes={dayNotes}
                      plans={plans}
                    />
                  </div>
                ) : null}
                {panel === 'list' ? (
                  <CalendarListView items={items} selected={selected} onSelect={selectList} />
                ) : null}
                {panel === 'timeline' ? (
                  <CalendarTimelineView
                    year={timelineYear}
                    month1={timelineMonth1}
                    days={timelineDays}
                    bars={timelineBars}
                    onMonthChange={changeTimelineMonth}
                    loading={timelinePending}
                  />
                ) : null}
                {panel === 'projects' ? (
                  <CalendarProjectsView slug={slug} columns={columns} canManage={canManage} />
                ) : null}
              </section>
            )
          })}
        </div>
      </div>
    </div>
  )
}

