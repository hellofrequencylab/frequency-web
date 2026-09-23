'use client'

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import { Maximize2, X } from 'lucide-react'
import { EventCalendar } from '@/components/events/event-calendar'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { IconButton } from '@/components/ui/icon-button'
import { StaffCalendar } from '@/app/(main)/spaces/[slug]/settings/calendar/staff-calendar'
import { CalendarModeToggle } from '@/components/spaces/calendar-mode-toggle'
import { CalendarListView } from '@/components/spaces/calendar-list-view'
import { CalendarWorkflowView } from '@/components/spaces/calendar-workflow-view'
import { CalendarConsole, keyTargetIsTyping } from '@/components/spaces/calendar-console'
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
import { VeraCalendarBox } from '@/components/spaces/vera-calendar-box'
import { cn } from '@/lib/utils'

// OPERATOR CALENDAR SHELL (ADR-1467). Guest and Admin data load once on the
// server. Switching a view slides the already-mounted panels. The last view
// is a cookie. Unsigned visitors never receive this shell with admin events.
//
// THE CONSOLE (PROG-CAL12). The same panel set, placed in one of two homes: inline on the page, or
// inside CalendarConsole, a viewport-filling Dialog. There is ONE panel tree and ONE Plan drawer
// either way; the workspace keeps the month, the view, the List selection and the open Plan, and
// the panels read them wherever they sit. On the page the staff grid pages by its buttons only
// (owner ruling); in the console the wheel and a swipe page too. `?console=1` travels with `view`,
// `item` and `plan`, pushed as a history entry on open so the Back button is an exit.

/** Marks the history entry the console pushed, so popstate can tell Back from any other traversal. */
const CONSOLE_STATE = '__frequencyCalendarConsole'

// FIRST-VISIT HINT. One line under the header until dismissed; the dismissal is a per-browser
// convenience in localStorage, read through useSyncExternalStore so the server render (no hint) and
// the client agree, and every touch of storage is wrapped: a blocked store means no hint, never a
// throw. It only ever says the console exists; it never opens it.
const HINT_KEY = 'freq-cal-console-hint'
const hintListeners = new Set<() => void>()
function readHintDismissed(): boolean {
  try {
    return window.localStorage.getItem(HINT_KEY) === '1'
  } catch {
    return true
  }
}
function subscribeHint(cb: () => void): () => void {
  hintListeners.add(cb)
  window.addEventListener('storage', cb)
  return () => {
    hintListeners.delete(cb)
    window.removeEventListener('storage', cb)
  }
}
function dismissHint(): void {
  try {
    window.localStorage.setItem(HINT_KEY, '1')
  } catch {
    // a blocked store: the hint goes for this render and comes back next visit, which is fine
  }
  hintListeners.forEach((cb) => cb())
}
const hintDismissedOnServer = () => true

export function CalendarWorkspace({
  slug,
  spaceId,
  brandName,
  adminAllowed,
  canManage,
  initialView,
  initialListItem,
  initialPlanId,
  initialConsole = false,
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
  /** `?console=1`: open the console on load, on the same view and drawer the link names. */
  initialConsole?: boolean
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
  // The shown month, owned here so the grids, the console header and its agenda read one value.
  const [month, setMonth] = useState({ year: initialYear, month1: initialMonth1 })
  const [consoleOpen, setConsoleOpen] = useState(adminAllowed && initialConsole)
  const [newEntryRequest, setNewEntryRequest] = useState(0)
  const [currentPlans, setCurrentPlans] = useState(plans)
  const [currentAdminEvents, setCurrentAdminEvents] = useState(adminEvents)
  const [serverSnapshot, setServerSnapshot] = useState({ plans, adminEvents })
  // Bumped when Vera's accepted proposal lands (PROG-CAL10): the month grid drops its fetched
  // months the same way it does after a drawer save. The fresh plans and entries for the page's
  // own month arrive as props in the action's round trip (revalidate), as every save's do.
  const [veraRefreshKey, setVeraRefreshKey] = useState(0)
  if (plans !== serverSnapshot.plans || adminEvents !== serverSnapshot.adminEvents) {
    setServerSnapshot({ plans, adminEvents })
    setCurrentPlans(plans)
    setCurrentAdminEvents(adminEvents)
  }
  const openControlRef = useRef<HTMLButtonElement>(null)
  // Set by every exit; the effect below puts focus back on the control that opened the console once
  // the console's own Dialog has finished restoring (its cleanup runs first).
  const restoreFocusRef = useRef(false)
  const hintDismissed = useSyncExternalStore(subscribeHint, readHintDismissed, hintDismissedOnServer)

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

  // Archive (HYG-120) mirrors the store: the Plan leaves the board, its pencilled dates leave the
  // grid, a date that became an event stays and forgets the Plan. The server re-render that follows
  // the action's revalidatePath then confirms this from the row, through serverSnapshot above.
  const planArchived = useCallback((archivedPlanId: string) => {
    setCurrentPlans((all) => all.filter((plan) => plan.id !== archivedPlanId))
    setCurrentAdminEvents((all) => all
      .filter((event) => !(event.planId === archivedPlanId && !event.eventId))
      .map((event) => (event.planId === archivedPlanId ? { ...event, planId: null } : event)))
  }, [])

  // The URL mirrors view, item, plan and the console flag, and the console's own marker survives a
  // view switch or a drawer opened inside it.
  //
  // ⚠️ NEVER HAND NEXT'S OWN STATE BACK TO replaceState. Next patches history (app-router.js) and its
  // patch returns EARLY, without telling the router the URL moved, whenever the state it is given
  // already carries `__NA`. The router's canonicalUrl then stays on the old address and its next
  // commit replaceStates the browser back to it, so `?plan=` written while a drawer opened vanished a
  // moment later (caught by test/e2e/operator-calendar.spec.ts). Passing OUR marker alone, or null,
  // keeps the patch on its normal path: it copies `__NA` and the internals tree onto whatever object
  // it is handed, so nothing of Next's is lost and the router learns the new URL.
  const consoleStateOnly = useCallback(() => {
    const state = window.history.state as Record<string, unknown> | null
    return state && state[CONSOLE_STATE] ? { [CONSOLE_STATE]: true } : null
  }, [])

  const syncUrl = useCallback(
    (next: CalendarAdminView, extras?: { item?: string | null; plan?: string | null; year?: number; month1?: number }) => {
      if (typeof window === 'undefined') return
      window.history.replaceState(
        consoleStateOnly(),
        '',
        adminViewHref(slug, next, { ...extras, plan: extras?.plan === undefined ? planId : extras.plan, console: consoleOpen }),
      )
    },
    [slug, planId, consoleOpen, consoleStateOnly],
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

  // An agenda row selects the same item the List view selects, on whichever view is showing.
  const selectAgendaItem = useCallback(
    (key: string) => {
      setListKey(key)
      syncUrl(view, { item: key })
    },
    [syncUrl, view],
  )

  // ENTER. Only from the control or the F key: a pushState so Back is an exit, the URL carrying the
  // view, item and plan the console opens on.
  const openConsole = useCallback(() => {
    if (!adminAllowed || consoleOpen) return
    setConsoleOpen(true)
    if (typeof window === 'undefined') return
    window.history.pushState(
      { [CONSOLE_STATE]: true },
      '',
      adminViewHref(slug, view, { item: view === 'list' ? listKey : null, plan: planId, console: true }),
    )
  }, [adminAllowed, consoleOpen, slug, view, listKey, planId])

  // EXIT. When the entry on top of the stack is the console's own, Back pops it and the URL comes
  // back on its own; a pasted `?console=1` link has no such entry, so the flag is rewritten in place.
  const closeConsole = useCallback(() => {
    if (!consoleOpen) return
    restoreFocusRef.current = true
    setConsoleOpen(false)
    if (typeof window === 'undefined') return
    const state = window.history.state as Record<string, unknown> | null
    if (state && state[CONSOLE_STATE]) window.history.back()
    else {
      // null, not `state`: see the warning on syncUrl. The marker is being dropped here anyway.
      window.history.replaceState(
        null,
        '',
        adminViewHref(slug, view, { item: view === 'list' ? listKey : null, plan: planId, console: false }),
      )
    }
  }, [consoleOpen, slug, view, listKey, planId])

  // Esc is layered. The Dialog stack already hands Esc to the drawer when it opened over the console;
  // this covers a drawer that was already open when the console came up: it closes first, and a
  // second Esc closes the console.
  const requestConsoleClose = useCallback(() => {
    if (planId) closePlan()
    else closeConsole()
  }, [planId, closePlan, closeConsole])

  // BROWSER BACK (and Forward). Our entry leaving the stack closes the console; arriving on it again
  // reopens it. The URL is rewritten without the flag on the way out, so a drawer or List selection
  // that opened inside the console keeps its address.
  useEffect(() => {
    if (!adminAllowed) return
    const onPop = (e: PopStateEvent) => {
      const state = e.state as Record<string, unknown> | null
      const marked = !!(state && state[CONSOLE_STATE])
      if (consoleOpen && !marked) {
        restoreFocusRef.current = true
        setConsoleOpen(false)
        // null, not `state`: see the warning on syncUrl. The entry we landed on is not the console's.
        window.history.replaceState(
          null,
          '',
          adminViewHref(slug, view, { item: view === 'list' ? listKey : null, plan: planId, console: false }),
        )
      } else if (!consoleOpen && marked) {
        setConsoleOpen(true)
      }
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [adminAllowed, consoleOpen, slug, view, listKey, planId])

  // F opens the console from the page when focus is not in a field or in a dialog.
  useEffect(() => {
    if (!adminAllowed || consoleOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || (e.key !== 'f' && e.key !== 'F') || e.ctrlKey || e.metaKey || e.altKey) return
      if (keyTargetIsTyping(e.target)) return
      const target = e.target as HTMLElement | null
      if (target && typeof target.closest === 'function' && target.closest('[role="dialog"]')) return
      e.preventDefault()
      openConsole()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [adminAllowed, consoleOpen, openConsole])

  // Focus returns to the control that opened the console, whichever way it closed. Runs after the
  // console Dialog's own cleanup (a child's unmount effects run before a parent's effects).
  useEffect(() => {
    if (consoleOpen || !restoreFocusRef.current) return
    restoreFocusRef.current = false
    openControlRef.current?.focus()
  }, [consoleOpen])

  const pencilIn = useCallback(() => setNewEntryRequest((n) => n + 1), [])

  const guestBody = (
    <>
      <EventCalendar
        events={guestEvents}
        initialYear={initialYear}
        initialMonth1={initialMonth1}
        loadMonth={loadGuestMonth}
        month={month}
        onMonthChange={setMonth}
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

  // One definition of the view controls, rendered in the page heading and again in the console header.
  // Gated on the viewer here, once, for both homes.
  const viewControls = (
    <>
      {adminAllowed && (
        <>
          <Button
            type="button"
            size="sm"
            variant={view === 'guest' ? 'primary' : 'secondary'}
            aria-pressed={view === 'guest'}
            onClick={() => selectView('guest')}
          >
            Guest preview
          </Button>
          <CalendarModeToggle mode={view} onSelect={selectView} />
        </>
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
        {viewControls}
        {adminAllowed && (
          <IconButton
            ref={openControlRef}
            data-calendar-console-open
            label="Open the console"
            title="Open the console (F)"
            variant="bordered"
            onClick={openConsole}
          >
            <Maximize2 className="h-4 w-4" aria-hidden />
          </IconButton>
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

  const vera = canManage ? (
    <VeraCalendarBox
      slug={slug}
      year={month.year}
      month1={month.month1}
      plans={currentPlans}
      events={currentAdminEvents}
      onApplied={() => setVeraRefreshKey((k) => k + 1)}
    />
  ) : null

  // THE PANEL SET. In the console the wrapper is the scroll container (x clipped for the slide, y its
  // own, overscroll contained) and the grid fills whatever height the row has.
  //
  // ONLY THE SHOWING PANEL HAS A HEIGHT (LIVE-469). The four sit in one flex row, and a row is as
  // tall as its tallest child, so a long List index once left Calendar, Guest and Workflow scrolling
  // into blank space beneath them. `items-start` stops the row stretching the others to match, and
  // an inert panel is `h-0 overflow-hidden` so it adds no height at all. In the console the showing
  // panel stretches itself instead (`self-stretch`), which is what lets the grid fill the row.
  const panels = (
    <div className={cn('overflow-hidden', consoleOpen && 'h-full overflow-x-hidden overflow-y-auto overscroll-contain')}>
      <div
        className={cn('flex items-start transition-transform duration-300 ease-out motion-reduce:transition-none', consoleOpen && 'min-h-full')}
        style={{ transform: `translateX(-${index * 100}%)` }}
      >
        {CALENDAR_ADMIN_VIEWS.map((panel) => {
          const active = panel === view
          return (
            <section
              key={panel}
              className={cn('w-full shrink-0', active ? consoleOpen && 'self-stretch' : 'h-0 overflow-hidden')}
              aria-hidden={!active}
              {...(!active ? { inert: true } : {})}
              data-calendar-panel={panel}
            >
              {panel === 'guest' ? guestBody : null}
              {panel === 'admin' ? (
                <div data-calendar-admin-grid className={consoleOpen ? 'h-full' : undefined}>
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
                    externalRefreshKey={veraRefreshKey}
                    wheelPaging={consoleOpen}
                    month={month}
                    onMonthChange={setMonth}
                    newEntryRequest={newEntryRequest}
                    pencilButton={!consoleOpen}
                    fill={consoleOpen}
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
  )

  return (
    <div className="space-y-4" data-calendar-workspace data-calendar-view={view} data-calendar-console-open={consoleOpen || undefined}>
      {heading}
      {!hintDismissed && (
        <div data-calendar-console-hint className="flex items-center justify-between gap-2 rounded-control border border-border bg-surface-elevated px-3 py-1.5 text-meta text-muted">
          <span>Press F or open the console for the full editor.</span>
          <IconButton label="Dismiss the hint" onClick={dismissHint}>
            <X className="h-3.5 w-3.5" aria-hidden />
          </IconButton>
        </div>
      )}
      {consoleOpen ? (
        <CalendarConsole
          open
          onClose={requestConsoleClose}
          month={month}
          onMonthChange={setMonth}
          view={view}
          viewControls={viewControls}
          items={items}
          selectedKey={selected?.key ?? null}
          onSelectItem={selectAgendaItem}
          onOpenPlan={selectPlan}
          onPencil={canManage ? pencilIn : undefined}
          vera={vera}
        >
          {panels}
        </CalendarConsole>
      ) : (
        <>
          {vera}
          {panels}
        </>
      )}
      <PlanDrawer
        slug={slug}
        plan={openPlan}
        entryId={planEntryId}
        open={openPlan !== null}
        onClose={closePlan}
        onSaved={(savedPlanId, stage) => stageChanged(savedPlanId, stage)}
        onArchived={planArchived}
        deepSettingsHref={`/spaces/${slug}/settings/calendar?plan=${planId ?? ''}`}
      />
    </div>
  )
}
