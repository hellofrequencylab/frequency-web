'use client'

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, useTransition } from 'react'
import Link from 'next/link'
import { MoreHorizontal, PanelRightClose, PanelRightOpen, Plus } from 'lucide-react'
import { StaffCalendar, STAFF_CALENDAR_LAYERS } from '@/app/(main)/spaces/[slug]/settings/calendar/staff-calendar'
import { PlanDrawer } from '@/app/(main)/spaces/[slug]/settings/calendar/plan-drawer'
import { setSpaceTaskDone } from '@/app/(main)/spaces/[slug]/settings/calendar/task-actions'
import {
  CalendarMonthTitle,
  CalendarPaging,
  MonthJumpPanel,
  countByMonthKey,
  monthCount,
} from '@/components/events/calendar-chrome'
import { CalendarSubscribeMenu } from '@/components/events/calendar-subscribe-menu'
import { Checkbox } from '@/components/ui/checkbox'
import { addMonth, monthLabel } from '@/lib/events/calendar-grid'
import { CALENDAR_LAYERS, type CalendarLayerKey } from '@/lib/calendar/registry'
import { planStageLabel, planTargetDef, type SpacePlan } from '@/lib/calendar/plans'
import { isOverdue, sortTasks, type CrmTask } from '@/lib/crm/tasks-core'
import { isError } from '@/lib/action-result'
import type { CalendarEvent } from '@/lib/calendar/item'
import type { DayNote } from '@/lib/calendar/day-notes'
// Type only: astro-markers.ts pulls astronomy-engine (116 KB minified in the browser build).
import type { AstroMarker as SkyMarker } from '@/lib/calendar/astro-markers'

// THE CALENDAR PLANNER (Frequency, owner ask 2026-10-13: "I want this calendar to fill the space and be
// in admin / planning mode"). The Space console's Calendar page under SITE_DESIGN=frequency: ONE toolbar
// (the month and its paging, Month / Agenda, the five layer chips with this month's counts, then New
// event, Pencil it in and a ⋯ menu holding the subscribe feed and the doors to the sections below), the
// grid filling the console's width and the viewport's height, and a collapsible planning side bar (In
// the works, Up next, To-dos) built only from what the Space actually has.
//
// IT DRAWS NOTHING NEW UNDERNEATH. The grid is StaffCalendar with `hostChrome`, so the entry drawer,
// the series questions, the clash check and the drag-to-move seam (PROG-CAL15) are the ones the DAWN
// page uses; this file only hosts them. Every write goes through the actions that page already calls:
// saveCalendarEntry and friends inside StaffCalendar, setSpaceTaskDone for a to-do, the Plan drawer for
// a Plan. DAWN never renders this file.

/** Below this width the grid's cells are too narrow to plan in, so the Agenda opens first. */
const NARROW_QUERY = '(max-width: 719px)'

function subscribeNarrow(onChange: () => void): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {}
  const q = window.matchMedia(NARROW_QUERY)
  q.addEventListener('change', onChange)
  return () => q.removeEventListener('change', onChange)
}
const readNarrow = () => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(NARROW_QUERY).matches
/** The server cannot see the viewport: it renders the Month, and a phone switches on hydration. */
const serverNarrow = () => false

/** How many rows each side bar section lists before pointing at the full section below. */
const SIDE_ROWS = 5

export interface PlannerUpNext {
  id: string
  title: string
  whenLabel: string
  href: string
  isDraft: boolean
}

export function CalendarPlanner({
  slug,
  spaceId,
  brandName,
  events,
  initialYear,
  initialMonth1,
  todayKey,
  canEdit,
  spaceTimeZone,
  dayNotes,
  skyMarkers,
  plans,
  pencilByPlan,
  upNext,
  todos,
  upcomingCount,
  newEventHref,
  httpsUrl,
  webcalUrl,
}: {
  slug: string
  spaceId: string
  brandName: string
  events: CalendarEvent[]
  initialYear: number
  initialMonth1: number
  /** Today in the Space's zone (America/Los_Angeles when it has none), computed on the server. */
  todayKey: string
  canEdit: boolean
  spaceTimeZone: string | null
  dayNotes: DayNote[]
  skyMarkers: readonly SkyMarker[]
  plans: SpacePlan[]
  pencilByPlan: Record<string, string>
  upNext: PlannerUpNext[]
  todos: CrmTask[]
  upcomingCount: number
  newEventHref: string
  httpsUrl: string
  webcalUrl: string
}) {
  const [month, setMonth] = useState({ year: initialYear, month1: initialMonth1 })
  const narrow = useSyncExternalStore(subscribeNarrow, readNarrow, serverNarrow)
  const [chosenView, setChosenView] = useState<'grid' | 'list' | null>(null)
  const view = chosenView ?? (narrow ? 'list' : 'grid')
  const [hidden, setHidden] = useState<ReadonlySet<CalendarLayerKey>>(() => new Set())
  const [monthItems, setMonthItems] = useState<CalendarEvent[]>([])
  const [pencilRequest, setPencilRequest] = useState(0)
  const [moveNotice, setMoveNotice] = useState<string | null>(null)
  const [sideOpen, setSideOpen] = useState(true)
  const [jumpOpen, setJumpOpen] = useState(false)
  const [jumpYear, setJumpYear] = useState(initialYear)
  const [moreOpen, setMoreOpen] = useState(false)
  const moreRef = useRef<HTMLDivElement>(null)
  const monthButtonRef = useRef<HTMLButtonElement>(null)
  const [openPlan, setOpenPlan] = useState<SpacePlan | null>(null)

  const todayYear = Number(todayKey.slice(0, 4))
  const todayMonth1 = Number(todayKey.slice(5, 7))
  const onCurrentMonth = month.year === todayYear && month.month1 === todayMonth1
  const label = monthLabel(month.year, month.month1)

  // THE CHIP COUNTS: what the month showing holds per layer, hidden layers included, so a hidden
  // layer still says how much it is hiding.
  const counts = useMemo(() => {
    const out = new Map<CalendarLayerKey, number>()
    for (const ev of monthItems) {
      const k = (ev.layer ?? 'events') as CalendarLayerKey
      out.set(k, (out.get(k) ?? 0) + 1)
    }
    return out
  }, [monthItems])
  const countByMonth = useMemo(() => countByMonthKey(events), [events])

  const toggleLayer = (key: CalendarLayerKey) =>
    setHidden((cur) => {
      const next = new Set(cur)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  // The ⋯ menu closes on Escape and on a press anywhere outside it.
  useEffect(() => {
    if (!moreOpen) return
    const onDown = (e: MouseEvent) => {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) setMoreOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMoreOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [moreOpen])

  const onMonthItems = useCallback((items: CalendarEvent[]) => setMonthItems(items), [])

  // ── THE SIDE BAR'S THREE LISTS, each only when the Space has something for it ──────────────────
  const inTheWorks = useMemo(() => plans.filter((p) => p.stage !== 'production' && !p.archivedAt), [plans])
  const [todoRows, setTodoRows] = useState<CrmTask[]>(todos)
  const [syncedTodos, setSyncedTodos] = useState(todos)
  if (todos !== syncedTodos) {
    setSyncedTodos(todos)
    setTodoRows(todos)
  }
  const openTodos = useMemo(() => sortTasks(todoRows.filter((t) => t.status !== 'done')), [todoRows])
  const [todoPending, startTodo] = useTransition()
  const [todoError, setTodoError] = useState<string | null>(null)
  const toggleTodo = (taskId: string, done: boolean) => {
    setTodoError(null)
    setTodoRows((cur) => cur.map((t) => (t.id === taskId ? { ...t, status: done ? 'done' : 'open' } : t)))
    startTodo(async () => {
      const res = await setSpaceTaskDone(slug, taskId, done)
      if (isError(res)) {
        setTodoError(res.error)
        // Put the row back: the box must never claim a write that did not land.
        setTodoRows((cur) => cur.map((t) => (t.id === taskId ? { ...t, status: done ? 'open' : 'done' } : t)))
      }
    })
  }
  const hasSide = canEdit && (inTheWorks.length > 0 || upNext.length > 0 || openTodos.length > 0)

  const empty = upcomingCount === 0 && events.length === 0

  return (
    <div className="adp-planner" data-side={hasSide && sideOpen ? 'open' : 'closed'}>
      <div className="adp-plan-bar" role="toolbar" aria-label="Calendar controls">
        <div className="adp-plan-when">
          <div className="adp-plan-month">
            <CalendarMonthTitle
              headingId="calendar-planner-month"
              label={label}
              jumpOpen={jumpOpen}
              onToggleJump={() => {
                setJumpYear(month.year)
                setJumpOpen((o) => !o)
              }}
              buttonRef={monthButtonRef}
            />
            {jumpOpen && (
              <MonthJumpPanel
                shownYear={month.year}
                shownMonth1={month.month1}
                jumpYear={jumpYear}
                onJumpYear={setJumpYear}
                countFor={(y, m1) => monthCount(countByMonth, y, m1)}
                onPick={(next) => {
                  setMonth(next)
                  setJumpOpen(false)
                  monthButtonRef.current?.focus()
                }}
                className="panel adp-plan-pop"
              />
            )}
          </div>
          <CalendarPaging
            onStep={(delta) => setMonth((m) => addMonth(m.year, m.month1, delta))}
            onToday={() => {
              setMonth({ year: todayYear, month1: todayMonth1 })
              monthButtonRef.current?.focus()
            }}
            onCurrentMonth={onCurrentMonth}
          />
        </div>

        <div className="chips adp-plan-seg" role="group" aria-label="Calendar view">
          <button type="button" className={view === 'grid' ? 'chip on' : 'chip'} aria-pressed={view === 'grid'} onClick={() => setChosenView('grid')}>
            Month
          </button>
          <button type="button" className={view === 'list' ? 'chip on' : 'chip'} aria-pressed={view === 'list'} onClick={() => setChosenView('list')}>
            Agenda
          </button>
        </div>

        <div className="chips adp-plan-layers" role="group" aria-label={`Show on the calendar, ${label}`}>
          {CALENDAR_LAYERS.filter((l) => STAFF_CALENDAR_LAYERS.includes(l.key)).map((l) => {
            const on = !hidden.has(l.key)
            const n = counts.get(l.key) ?? 0
            return (
              <button
                key={l.key}
                type="button"
                aria-pressed={on}
                aria-label={`${l.label}, ${n} this month`}
                onClick={() => toggleLayer(l.key)}
                className={on ? 'chip adp-plan-chip on' : 'chip adp-plan-chip'}
                data-layer={l.key}
              >
                <i className="adp-plan-dot" data-layer={l.key} aria-hidden />
                {l.label}
                <b className="adp-plan-n" aria-hidden>
                  {n}
                </b>
              </button>
            )
          })}
        </div>

        <div className="adp-plan-acts">
          {canEdit && (
            <Link href={newEventHref} className="btn pa sm">
              <Plus className="adp-plan-ic" aria-hidden /> New event
            </Link>
          )}
          {canEdit && (
            <button type="button" className="btn sm" onClick={() => setPencilRequest((n) => n + 1)}>
              Pencil it in
            </button>
          )}
          {hasSide && (
            <button
              type="button"
              className="btn sm txt"
              aria-expanded={sideOpen}
              aria-controls="calendar-planning"
              onClick={() => setSideOpen((o) => !o)}
              title={sideOpen ? 'Hide the planning panel' : 'Show the planning panel'}
            >
              {sideOpen ? <PanelRightClose className="adp-plan-ic" aria-hidden /> : <PanelRightOpen className="adp-plan-ic" aria-hidden />}
              <span className="adp-plan-hide-s">Planning</span>
            </button>
          )}
          <div className="adp-plan-more" ref={moreRef}>
            <button
              type="button"
              className="btn sm"
              aria-label="More calendar actions"
              aria-expanded={moreOpen}
              aria-haspopup="true"
              onClick={() => setMoreOpen((o) => !o)}
            >
              <MoreHorizontal className="adp-plan-ic" aria-hidden />
            </button>
            {moreOpen && (
              <div className="panel adp-plan-pop adp-plan-menu">
                <CalendarSubscribeMenu
                  httpsUrl={httpsUrl}
                  webcalUrl={webcalUrl}
                  title={`${brandName} in your calendar`}
                  description={`Subscribe once and ${brandName}'s events show up in Google or Apple Calendar, and stay current on their own.`}
                  buttonClassName="adp-plan-mi"
                />
                <a className="adp-plan-mi" href={httpsUrl} download>
                  Download the calendar file
                </a>
                {canEdit && (
                  <>
                    <a className="adp-plan-mi" href="#calendar-plans" onClick={() => setMoreOpen(false)}>
                      Plans and playbooks
                    </a>
                    <a className="adp-plan-mi" href="#calendar-todos" onClick={() => setMoreOpen(false)}>
                      All to-dos
                    </a>
                  </>
                )}
                <a className="adp-plan-mi" href="#calendar-settings" onClick={() => setMoreOpen(false)}>
                  Time zone, sky and day notes
                </a>
                <a className="adp-plan-mi" href="#calendar-manage-events" onClick={() => setMoreOpen(false)}>
                  Manage events
                </a>
              </div>
            )}
          </div>
        </div>
      </div>

      <p className="t2 adp-plan-note" aria-live="polite">
        {moveNotice ?? ''}
      </p>

      <div className="adp-plan-body">
        <div className="panel adp-plan-cal">
          {empty && (
            <p className="t2 adp-plan-hint">
              {canEdit
                ? 'Nothing on the calendar yet. Pick any day to pencil something in, block time off, or start with New event.'
                : 'Nothing on the calendar yet.'}
            </p>
          )}
          <StaffCalendar
            slug={slug}
            spaceId={spaceId}
            events={events}
            initialYear={initialYear}
            initialMonth1={initialMonth1}
            canEdit={canEdit}
            spaceTimeZone={spaceTimeZone}
            dayNotes={dayNotes}
            skyMarkers={skyMarkers}
            plans={plans}
            month={month}
            onMonthChange={setMonth}
            gridView={view}
            onGridViewChange={setChosenView}
            hiddenLayers={hidden}
            onHiddenLayersChange={setHidden}
            newEntryRequest={pencilRequest}
            pencilButton={false}
            fill
            hostChrome
            moveByDrag
            moveNotice={moveNotice}
            onMoveResult={setMoveNotice}
            dayGrid
            todayKey={todayKey}
            onMonthItems={onMonthItems}
            quickAdd={{ newEventHref }}
          />
        </div>

        {hasSide && (
          <aside id="calendar-planning" className="adp-plan-side" aria-label="Planning" hidden={!sideOpen}>
            {inTheWorks.length > 0 && (
              <section className="panel adp-plan-sec" aria-labelledby="plan-side-works">
                <div className="sec-h">
                  <h3 id="plan-side-works" className="h3">In the works</h3>
                  <span className="t2">{inTheWorks.length}</span>
                </div>
                <ul className="adp-plan-list">
                  {inTheWorks.slice(0, SIDE_ROWS).map((plan) => {
                    const href = planTargetDef(plan.targetKind).createHref?.({
                      spaceId,
                      spaceSlug: slug,
                      planId: plan.id,
                      entryId: pencilByPlan[plan.id],
                    })
                    return (
                      <li key={plan.id} className="adp-plan-item">
                        <button type="button" className="adp-plan-link" onClick={() => setOpenPlan(plan)}>
                          <span className="t1">{plan.title}</span>
                          <span className="t2">
                            {planStageLabel(plan.stage)}
                            {pencilByPlan[plan.id] ? '' : ' · no date yet'}
                          </span>
                        </button>
                        <div className="adp-plan-row">
                          <button type="button" className="btn sm txt" onClick={() => setOpenPlan(plan)}>
                            {pencilByPlan[plan.id] ? 'Open plan' : 'Schedule'}
                          </button>
                          {href && (
                            <a className="btn sm" href={href}>
                              Make it a Production
                            </a>
                          )}
                        </div>
                      </li>
                    )
                  })}
                </ul>
                {inTheWorks.length > SIDE_ROWS && (
                  <a className="t2 adp-plan-all" href="#calendar-plans">
                    All {inTheWorks.length} plans
                  </a>
                )}
              </section>
            )}

            {upNext.length > 0 && (
              <section className="panel adp-plan-sec" aria-labelledby="plan-side-next">
                <div className="sec-h">
                  <h3 id="plan-side-next" className="h3">Up next</h3>
                </div>
                <ul className="adp-plan-list">
                  {upNext.map((ev) => (
                    <li key={ev.id}>
                      <Link className="adp-plan-link" href={ev.href}>
                        <span className="t1">{ev.title}</span>
                        <span className="t2">
                          {ev.whenLabel}
                          {ev.isDraft ? ' · Draft' : ''}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {openTodos.length > 0 && (
              <section className="panel adp-plan-sec" aria-labelledby="plan-side-todos">
                <div className="sec-h">
                  <h3 id="plan-side-todos" className="h3">To-dos</h3>
                  <span className="t2">{openTodos.length} open</span>
                </div>
                <ul className="adp-plan-list">
                  {openTodos.slice(0, SIDE_ROWS).map((t) => (
                    <li key={t.id}>
                      <Checkbox
                        checked={false}
                        disabled={todoPending}
                        onChange={(e) => toggleTodo(t.id, e.target.checked)}
                        label={
                          <span>
                            {t.title}
                            {t.dueAt ? <span className="t2">{` · ${t.dueAt.slice(0, 10)}`}</span> : null}
                            {isOverdue(t) ? <span className="adp-plan-late"> · Overdue</span> : null}
                          </span>
                        }
                      />
                    </li>
                  ))}
                </ul>
                {openTodos.length > SIDE_ROWS && (
                  <a className="t2 adp-plan-all" href="#calendar-todos">
                    All {openTodos.length} to-dos
                  </a>
                )}
                {todoError && (
                  <p role="alert" className="adp-plan-late">
                    {todoError}
                  </p>
                )}
              </section>
            )}
          </aside>
        )}
      </div>

      <PlanDrawer
        slug={slug}
        plan={openPlan}
        entryId={openPlan ? (pencilByPlan[openPlan.id] ?? null) : null}
        open={openPlan !== null}
        onClose={() => setOpenPlan(null)}
      />
    </div>
  )
}
