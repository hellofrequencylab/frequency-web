'use client'

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { Maximize2 } from 'lucide-react'
import { EventCalendar } from '@/components/events/event-calendar'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
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
// THE CONSOLE (PROG-CAL12, redesigned 2026-09-22). The same panel set, shown in one of two homes:
// inline on the page, or inside CalendarConsole, a full-screen overlay. There is ONE panel tree and
// ONE Plan drawer either way; the workspace keeps the month, the view, the List selection and the
// open Plan, and the panels read them wherever they sit. On the page the staff grid pages by its
// buttons only (owner ruling); in the console the wheel and a swipe page too. `?console=1` travels
// with `view`, `item` and `plan`, pushed as a history entry on open so the Back button is an exit.
//
// 🔴 THE BLINK, AND WHY THE STAGE IS A PORTAL NOW (owner report 2026-09-22: "both event edit and
// full screen calendar console are super glitchy, blinking on and off"). The panel set used to be
// written into the tree TWICE, once as `<CalendarConsole>{panels}</CalendarConsole>` and once as a
// bare `<>{vera}{panels}</>`, with a ternary choosing between them. React reconciles children by
// their POSITION under a parent, so flipping that ternary is not a move: it unmounts the whole
// calendar and mounts a fresh one. Every open and every close destroyed both EventCalendar grids,
// StaffCalendar, VeraCalendarBox, every month those grids had fetched, and (because the entry form
// is a Dialog rendered by StaffCalendar) the entry being edited, then rebuilt all of it while the
// console's own panel replayed its 0.3s slide. Proven in calendar-workspace.render.test.tsx by DOM
// node identity: the `[data-calendar-root]` node before the toggle was not the node after it.
//
// The fix is to stop moving it in the React tree. The set is rendered at ONE position, into a
// portal whose container (`makeStageHost`) is a plain div this component owns and React never
// renders; a layout effect appends that div to the page slot or to the console's stage. The React
// parent never changes, so nothing unmounts, and because the move happens in the layout phase of
// the same commit the browser paints once. The host is held back until after hydration (the
// `isClient` shape components/ui/dialog.tsx already uses) so the server still ships the calendar
// inside its page slot and the first client render matches that HTML exactly.
//
// TWO HOSTS, NOT ONE (PROG-CAL13). Ask Vera used to ride inside the stage, which put it in a
// full-width band above the grid in both homes. The owner asked for it at the FOOT OF THE SIDE BAR,
// which is a different place in the console and the same place on the page, so it gets a host of its
// own and travels the same live way: one React position, one DOM move, the same node either side.
// Moving it by writing it into two places would be the very bug this file exists to document.

/** Marks the history entry the console pushed, so popstate can tell Back from any other traversal. */
const CONSOLE_STATE = '__frequencyCalendarConsole'

// True on the client, false during SSR + the first hydration pass, without a setState-in-effect.
const emptySubscribe = () => () => {}
const onTheClient = () => true
const duringHydration = () => false

// The layout phase on the client, a plain effect on the server, where react-dom/server warns about
// useLayoutEffect and the move below has no DOM to make anyway. The idiom dock-bar.tsx and the
// space-canvas editor mount already use.
const useIsoLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect

/** The stage's portal container: a plain div this component owns and React never renders, so moving
 *  it between homes is a DOM move and nothing in the tree above or below it unmounts. `display:
 *  contents` as an inline style, not a class, because no class scanner would ever see it. */
function makeStageHost(): HTMLDivElement | null {
  if (typeof document === 'undefined') return null
  const el = document.createElement('div')
  el.style.display = 'contents'
  return el
}

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

  // THE STAGE HOST. See the 🔴 note at the top of this file: one panel set, one React parent, and a
  // plain div that moves between the page slot and the console's stage.
  const isClient = useSyncExternalStore(emptySubscribe, onTheClient, duringHydration)
  const [stageHostEl] = useState(makeStageHost)
  const [veraHostEl] = useState(makeStageHost)
  // Held back until after hydration so the server's HTML (the panels rendered straight into their
  // page slot) is exactly what the first client render produces. Guests never get one: they have no
  // console to move a stage into, and a viewer who cannot edit gets no Vera host.
  const stageHost = isClient && adminAllowed ? stageHostEl : null
  const veraHost = isClient && adminAllowed && canManage ? veraHostEl : null
  const stageSlotRef = useRef<HTMLDivElement>(null)
  const veraSlotRef = useRef<HTMLDivElement>(null)
  const consoleStageRef = useRef<HTMLDivElement>(null)
  const consoleVeraRef = useRef<HTMLDivElement>(null)

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

  // THE MOVE. Layout phase, so it lands before the browser paints: the console's DOM went in during
  // the same commit's mutation phase, and its ref is attached by the time a parent's layout effect
  // runs. One paint, no torn frame, and nothing in the panel set unmounts either way.
  useIsoLayoutEffect(() => {
    const moves: [HTMLDivElement | null, HTMLDivElement | null, HTMLDivElement | null][] = [
      [stageHost, consoleStageRef.current, stageSlotRef.current],
      [veraHost, consoleVeraRef.current, veraSlotRef.current],
    ]
    for (const [host, consoleHome, pageHome] of moves) {
      if (!host) continue
      const target = (consoleOpen ? consoleHome : pageHome) ?? pageHome
      if (target && host.parentNode !== target) target.appendChild(host)
    }
    return () => {
      // The console is going away this commit; put both hosts back on the page before it does.
      for (const [host, , pageHome] of moves) {
        if (host && pageHome && host.parentNode !== pageHome) pageHome.appendChild(host)
      }
    }
  }, [consoleOpen, stageHost, veraHost])

  const pencilIn = useCallback(() => setNewEntryRequest((n) => n + 1), [])

  const guestBody = (
    <div className={consoleOpen ? 'flex h-full min-h-0 flex-col gap-3' : 'space-y-4'}>
      <EventCalendar
        events={guestEvents}
        initialYear={initialYear}
        initialMonth1={initialMonth1}
        loadMonth={loadGuestMonth}
        month={month}
        onMonthChange={setMonth}
        fill={consoleOpen}
        hostChrome={consoleOpen}
      />
      {guestFirstUse && (
        <EmptyState
          variant="first-use"
          title="Nothing on the calendar yet."
          description={`${brandName} has not published a gathering. Subscribe and new dates will land in your own calendar.`}
        />
      )}
    </div>
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

  // TWO LINES, NOT FIVE (owner ask 2026-09-22). Line one is the name of the page with the blurb
  // beside it from `sm` up; line two is every control, in one wrapping row. The first-visit hint
  // that used to sit on a third line is gone: it only ever said the console exists and how to reach
  // it, which is what the Fullscreen control's own title says, so the sentence moved onto the
  // control and the row (and its localStorage dismissal) retired.
  const heading = (
    <div className="space-y-2">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="text-lead font-bold text-text">Calendar</h2>
        <p className="text-body-sm text-muted">{calendarViewBlurb(view, brandName)}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {viewControls}
        {adminAllowed && (
          <Button
            ref={openControlRef}
            type="button"
            size="sm"
            variant="secondary"
            data-calendar-console-open
            title="Open the console (F)"
            onClick={openConsole}
          >
            <Maximize2 className="h-4 w-4" aria-hidden /> Fullscreen
          </Button>
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
    <div className={cn('overflow-hidden', consoleOpen && 'min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain')}>
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
                    hostChrome={consoleOpen}
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
      {/* The page's homes for the two travelling hosts, in the order the page reads: Ask Vera above
          the panels. Before hydration each renders straight into its slot; after, each slot holds a
          portal host, which the layout effect above parks here or in the console. */}
      <div data-calendar-stage className={cn('space-y-4', consoleOpen && 'hidden')}>
        {vera ? <div ref={veraSlotRef}>{veraHost ? null : vera}</div> : null}
        <div ref={stageSlotRef}>{stageHost ? null : panels}</div>
      </div>
      {veraHost ? createPortal(vera, veraHost) : null}
      {stageHost ? createPortal(panels, stageHost) : null}
      {consoleOpen ? (
        <CalendarConsole
          open
          onClose={requestConsoleClose}
          month={month}
          onMonthChange={setMonth}
          viewControls={viewControls}
          items={items}
          selectedKey={selected?.key ?? null}
          onSelectItem={selectAgendaItem}
          onOpenPlan={selectPlan}
          onPencil={canManage ? pencilIn : undefined}
          stageRef={consoleStageRef}
          veraRef={veraHost ? consoleVeraRef : undefined}
        />
      ) : null}
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
