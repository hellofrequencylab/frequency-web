'use client'

import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { EventCalendar } from '@/components/events/event-calendar'
import { EmptyState } from '@/components/ui/empty-state'
import { StaffCalendar } from '@/app/(main)/spaces/[slug]/settings/calendar/staff-calendar'
import { CalendarModeToggle } from '@/components/spaces/calendar-mode-toggle'
import { CalendarListView } from '@/components/spaces/calendar-list-view'
import { CalendarWorkflowView } from '@/components/spaces/calendar-workflow-view'
import {
  adminViewHref,
  calendarViewBlurb,
  CALENDAR_ADMIN_VIEWS,
  rememberCalendarView,
  type CalendarAdminView,
} from '@/lib/calendar/admin-views'
import { listIndexItems, selectListItem } from '@/lib/calendar/list-index'
import { workflowBoard } from '@/lib/calendar/workflow-board'
import type { CalendarEvent } from '@/lib/calendar/item'
import type { DayNote } from '@/lib/calendar/day-notes'
import type { SpacePlan } from '@/lib/calendar/plans'
import type { WorkflowStage } from '@/lib/calendar/workflow-board'
import { PlanDrawer } from '@/app/(main)/spaces/[slug]/settings/calendar/plan-drawer'

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
  initialPlanId,
  initialYear,
  initialMonth1,
  guestEvents,
  guestFirstUse,
  adminEvents,
  dayNotes,
  plans,
  subscribe,
  loadGuestMonth,
}: {
  slug: string
  spaceId: string
  brandName: string
  adminAllowed: boolean
  canManage: boolean
  initialView: CalendarAdminView
  initialListItem: string | null
  initialPlanId: string | null
  initialYear: number
  initialMonth1: number
  guestEvents: CalendarEvent[]
  guestFirstUse: boolean
  adminEvents: CalendarEvent[]
  dayNotes: DayNote[]
  plans: SpacePlan[]
  subscribe: ReactNode
  loadGuestMonth: (year: number, month1: number) => Promise<CalendarEvent[]>
}) {
  const [view, setView] = useState<CalendarAdminView>(adminAllowed ? initialView : 'guest')
  const [listKey, setListKey] = useState<string | null>(initialListItem)
  const [planId, setPlanId] = useState<string | null>(initialPlanId)
  const [planEntryId, setPlanEntryId] = useState<string | null>(null)
  const [currentPlans, setCurrentPlans] = useState(plans)
  const [currentAdminEvents, setCurrentAdminEvents] = useState(adminEvents)
  const [serverSnapshot, setServerSnapshot] = useState({ plans, adminEvents })
  if (plans !== serverSnapshot.plans || adminEvents !== serverSnapshot.adminEvents) {
    setServerSnapshot({ plans, adminEvents })
    setCurrentPlans(plans)
    setCurrentAdminEvents(adminEvents)
  }

  const items = useMemo(() => (adminAllowed ? listIndexItems(currentAdminEvents) : []), [adminAllowed, currentAdminEvents])
  const selected = useMemo(() => selectListItem(items, listKey), [items, listKey])
  const workflowColumns = useMemo(() => (adminAllowed ? workflowBoard(currentPlans, currentAdminEvents) : []), [adminAllowed, currentPlans, currentAdminEvents])
  const openPlan = useMemo(() => currentPlans.find((plan) => plan.id === planId) ?? null, [currentPlans, planId])

  const stageChanged = useCallback((changedPlanId: string, stage: WorkflowStage) => {
    const planStage = stage === 'cancelled' ? 'plan' : stage
    setCurrentPlans((all) => stage === 'cancelled'
      ? all.filter((plan) => plan.id !== changedPlanId)
      : all.map((plan) => plan.id === changedPlanId ? { ...plan, stage: planStage } : plan))
    setCurrentAdminEvents((all) => all.map((event) => event.planId === changedPlanId
      ? {
          ...event,
          stage: stage === 'plan' ? 'planning' : stage,
          isCancelled: stage === 'cancelled',
          sourceLabel: stage === 'plan' ? 'Planning' : stage[0].toUpperCase() + stage.slice(1),
        }
      : event))
  }, [])

  const syncUrl = useCallback(
    (next: CalendarAdminView, extras?: { item?: string | null; plan?: string | null; year?: number; month1?: number }) => {
      if (typeof window === 'undefined') return
      window.history.replaceState(null, '', adminViewHref(slug, next, { ...extras, plan: extras?.plan === undefined ? planId : extras.plan }))
    },
    [slug, planId],
  )

  const selectPlan = useCallback((nextPlanId: string, entryId?: string | null) => {
    setPlanId(nextPlanId)
    setPlanEntryId(entryId ?? null)
    syncUrl(view, { item: view === 'list' ? listKey : null, plan: nextPlanId })
  }, [listKey, syncUrl, view])

  const closePlan = useCallback(() => {
    setPlanId(null)
    setPlanEntryId(null)
    syncUrl(view, { item: view === 'list' ? listKey : null, plan: null })
  }, [listKey, syncUrl, view])

  const selectView = useCallback(
    (next: CalendarAdminView) => {
      if (!adminAllowed) return
      setView(next)
      rememberCalendarView(slug, next)
      if (next === 'list') syncUrl(next, { item: listKey ?? selected?.key })
      else syncUrl(next)
    },
     [adminAllowed, slug, listKey, selected?.key, syncUrl],
  )

  const selectList = useCallback(
    (key: string) => {
      setListKey(key)
      syncUrl('list', { item: key })
    },
    [syncUrl],
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
        {adminAllowed && (
          <>
            <button type="button" aria-pressed={view === 'guest'} onClick={() => selectView('guest')} className="rounded-control border border-border px-3 py-1 text-body-sm font-semibold text-muted hover:text-text">
              Guest preview
            </button>
            <CalendarModeToggle mode={view} onSelect={selectView} />
          </>
        )}
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
                      events={currentAdminEvents}
                      initialYear={initialYear}
                      initialMonth1={initialMonth1}
                      canEdit={canManage}
                      dayNotes={dayNotes}
                      plans={currentPlans}
                      onOpenPlan={selectPlan}
                    />
                  </div>
                ) : null}
                {panel === 'list' ? (
                  <CalendarListView items={items} selected={selected} onSelect={selectList} onOpenPlan={selectPlan} />
                ) : null}
                {panel === 'workflow' ? (
                  <CalendarWorkflowView columns={workflowColumns} slug={slug} canManage={canManage} onOpenPlan={selectPlan} onStageChanged={stageChanged} />
                ) : null}
              </section>
            )
          })}
        </div>
      </div>
      <PlanDrawer
        slug={slug}
        plan={openPlan}
        entryId={planEntryId}
        open={openPlan !== null}
        onClose={closePlan}
        onSaved={(savedPlanId, stage) => stageChanged(savedPlanId, stage)}
        deepSettingsHref={`/spaces/${slug}/settings/calendar?plan=${planId ?? ''}`}
      />
    </div>
  )
}

