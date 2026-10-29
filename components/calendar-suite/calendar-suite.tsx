'use client'

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import Link from 'next/link'
import { CalendarClock, Sparkles } from 'lucide-react'
import { moveSpaceTodo } from '@/app/(main)/spaces/[slug]/settings/calendar/task-actions'
import { saveCalendarEntry, saveCalendarEntryOccurrence } from '@/app/(main)/spaces/[slug]/settings/calendar/entry-actions'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import type { AstroMarker } from '@/lib/calendar/astro-markers'
import type { DayNote } from '@/lib/calendar/day-notes'
import { calendarViewCookieName } from '@/lib/calendar/admin-views'
import type { AdaptedCalendar } from '@/lib/calendar/planner/adapters'
import { findClashes } from '@/lib/calendar/planner/clash'
import { addDays } from '@/lib/calendar/planner/days'
import { needsYou } from '@/lib/calendar/planner/needs-you'
import { shiftMonth, sunSignOn } from '@/lib/calendar/planner/month'
import { nowMinutes } from '@/lib/calendar/planner/now'
import {
  READY_VIEWS,
  SUITE_VIEW_LABEL,
  countByMonth,
  resolveSuiteView,
  suiteKeyAction,
  viewCookieValue,
  type SuiteView,
} from '@/lib/calendar/planner/suite-model'
import type { PlannerData, PlannerLayer } from '@/lib/calendar/planner/types'
import { SuiteAgenda } from './suite-agenda'
import { CohostProvider, cohostActionsFor, useSuiteCohost, type CohostActions } from './use-suite-cohost'
import { SuiteDetails } from './suite-details'
import { SuiteHeader } from './suite-header'
import { SuiteMonth, type MonthScrollRequest } from './suite-month'
import { SuiteNeedsYou } from './suite-needs-you'
import { SuiteRail } from './suite-rail'
import { SuiteSheet } from './suite-sheet'
import type { SuiteContext, SuiteSelection, SuiteTeamMember } from './suite-types'
import { SuiteWeek } from './suite-week'
import { useSuiteMoves, type SuiteActions } from './use-suite-moves'

// THE SPACE CALENDAR (README 1, layout 1a Sidebar). One full-height surface inside the console: the
// rail, the header, the Needs-you row, the view, and the Details panel. This part owns what is on
// screen (the view, the day the calendar is on, the layers switched off, the one thing selected) and
// the keys that move it. The records come in already adapted (lib/calendar/planner/adapters.ts), so
// nothing here knows what a row of the database looks like, and nothing here writes.

/** Under this width the Agenda opens first: a month's cells are too narrow to read there. */
const NARROW_QUERY = '(max-width: 719px)'
const subscribeNarrow = (onChange: () => void) => {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {}
  const q = window.matchMedia(NARROW_QUERY)
  q.addEventListener('change', onChange)
  return () => q.removeEventListener('change', onChange)
}
const readNarrow = () => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(NARROW_QUERY).matches
const serverNarrow = () => false

export interface CalendarSuiteProps {
  slug: string
  spaceId: string
  brandName: string
  /** Today in the Space's zone. */
  todayKey: string
  /** The month the calendar opens on, 'YYYY-MM' (lib/calendar/open-month.ts). */
  openYm: string
  /** The first and last month the page loaded, 'YYYY-MM'. */
  minYm: string
  maxYm: string
  zoneLabel: string
  data: AdaptedCalendar
  team: SuiteTeamMember[]
  dayNotes: DayNote[]
  sky: AstroMarker[]
  /** The view the link or the cookie asked for, or null to choose by width. */
  initialView: string | null
  initialPlanId?: string | null
  /** Upcoming gatherings, a series counted once. */
  upcomingCount?: number
  newEventHref: string
  httpsUrl: string
  webcalUrl: string
  /** False for someone who can read the calendar but not change it: nothing is draggable. */
  canEdit?: boolean
  /** Minutes since midnight on the Space's clock when the page was made, or null for no now line. */
  nowMin?: number | null
  /** The zone's short name for the corner of the time grid, "PDT". */
  zoneShort?: string
  /** True stops the now line moving, for a test or a still picture. */
  frozenClock?: boolean
  /** The writes a drop makes. Absent means the calendar's own server actions; a test passes stand-ins. */
  actions?: SuiteActions
  /** The Spaces this one collaborates with, for the invite picker in a Plan's Details. */
  collaborators?: readonly { id: string; name: string }[]
  /** What this Space calls its roll-up when it is the parent of a Network or a Collective. */
  networkNoun?: string | null
  /** The writes a co-hosting press makes. Absent means the calendar's own server actions. */
  cohostActions?: CohostActions
}

type Sheet = 'pencil' | 'ask' | null

export function CalendarSuite(props: CalendarSuiteProps) {
  const { slug, spaceId, brandName, todayKey, openYm, minYm, maxYm, team, dayNotes, sky } = props
  const canEdit = props.canEdit ?? false
  const actions = useMemo<SuiteActions>(
    () =>
      props.actions ?? {
        saveEntry: (entryId, input) => saveCalendarEntry(slug, entryId, input),
        saveOccurrence: (entryId, day, input) => saveCalendarEntryOccurrence(slug, entryId, day, input),
        moveTodo: (id, due, startMin) => moveSpaceTodo(slug, id, due, startMin),
      },
    [props.actions, slug],
  )
  // A drop is shown at once and written through the calendar's own actions (use-suite-moves.tsx).
  const moves = useSuiteMoves({ base: props.data, actions, canEdit })
  // A co-hosting press is shown at once the same way, over the moved dates (use-suite-cohost.tsx).
  const cohostWrites = useMemo(() => props.cohostActions ?? cohostActionsFor(slug), [props.cohostActions, slug])
  const cohost = useSuiteCohost({
    truth: props.data,
    base: moves.data,
    ownSpaceId: spaceId,
    actions: cohostWrites,
    canEdit,
    collaborators: props.collaborators ?? [],
    collaboratorsHref: `/spaces/${slug}/settings/collaborators`,
    networkNoun: props.networkNoun ?? null,
  })
  const data = cohost.data
  const dnd = moves.dnd
  // The now line: the page's minute carried forward by the browser's own clock, unless frozen.
  const [elapsedMs, setElapsedMs] = useState(0)
  useEffect(() => {
    if (props.frozenClock) return
    const t0 = Date.now()
    const id = window.setInterval(() => setElapsedMs(Date.now() - t0), 30_000)
    return () => window.clearInterval(id)
  }, [props.frozenClock])
  const nowMin = props.nowMin == null ? null : nowMinutes(props.nowMin, elapsedMs)
  const todayYm = todayKey.slice(0, 7)
  const narrow = useSyncExternalStore(subscribeNarrow, readNarrow, serverNarrow)
  const [chosen, setChosen] = useState<SuiteView | null>(() => (props.initialView ? resolveSuiteView(props.initialView, null, false) : null))
  const view: SuiteView = chosen ?? resolveSuiteView(null, null, narrow)
  const [cursor, setCursor] = useState(openYm === todayYm ? todayKey : `${openYm}-01`)
  const [hidden, setHidden] = useState<Partial<Record<PlannerLayer, boolean>>>({})
  const [pickedSel, setSel] = useState<SuiteSelection>(() => (props.initialPlanId ? { kind: 'plan', id: props.initialPlanId } : null))
  const [railOpen, setRailOpen] = useState(false)
  const [jumpOpen, setJumpOpen] = useState(false)
  const [sheet, setSheet] = useState<Sheet>(null)
  const [request, setRequest] = useState<MonthScrollRequest | null>(null)
  const [focusDay, setFocusDay] = useState<string | null>(null)
  const token = useRef(0)
  const activeYm = cursor.slice(0, 7)

  const plannerData: PlannerData = useMemo(
    () => ({ items: data.items, tasks: data.tasks, plans: data.plans, hidden }),
    [data.items, data.tasks, data.plans, hidden],
  )
  const ctx: SuiteContext = useMemo(
    () => ({
      ownSpaceId: spaceId,
      ownName: brandName,
      today: todayKey,
      spaceNames: data.spaceNames,
      clashes: findClashes(data.items),
      teamById: new Map(team.map((m) => [m.id, m])),
      planById: new Map(data.plans.map((p) => [p.id, p])),
      itemById: new Map(data.items.map((i) => [i.id, i])),
      taskById: new Map(data.tasks.map((t) => [t.id, t])),
    }),
    [spaceId, brandName, todayKey, data, team],
  )
  // What Details shows goes when the record does: a Plan this Space just declined is no longer its to open.
  const sel: SuiteSelection = useMemo(() => {
    if (!pickedSel) return null
    const there =
      pickedSel.kind === 'item' ? ctx.itemById.has(pickedSel.id) : pickedSel.kind === 'todo' ? ctx.taskById.has(pickedSel.id) : ctx.planById.has(pickedSel.id)
    return there ? pickedSel : null
  }, [pickedSel, ctx])
  const needs = useMemo(
    () => needsYou({ items: data.items, tasks: data.tasks, plans: data.plans }, todayKey, spaceId, data.spaceNames),
    [data, todayKey, spaceId],
  )
  const monthCounts = useMemo(() => countByMonth({ items: data.items, tasks: data.tasks, plans: data.plans }), [data])
  const sign = useMemo(() => sunSignOn(cursor, sky), [cursor, sky])

  const chooseView = useCallback(
    (next: SuiteView) => {
      setChosen(next)
      try {
        document.cookie = `${calendarViewCookieName(slug)}=${viewCookieValue(next)}; Path=/; Max-Age=31536000; SameSite=Lax`
      } catch {
        // A blocked cookie only means the choice is not remembered.
      }
    },
    [slug],
  )

  const goToMonth = useCallback(
    (ym: string, smooth = true) => {
      token.current += 1
      setRequest({ ym, token: token.current, smooth })
      setCursor(ym === todayYm ? todayKey : `${ym}-01`)
    },
    [todayKey, todayYm],
  )

  const onActiveMonth = useCallback(
    (ym: string) => setCursor((c) => (c.slice(0, 7) === ym ? c : ym === todayYm ? todayKey : `${ym}-01`)),
    [todayKey, todayYm],
  )

  const page = useCallback(
    (delta: -1 | 1) => {
      if (view === 'month') goToMonth(shiftMonth(activeYm, delta))
      else if (view === 'day') setCursor((c) => addDays(c, delta))
      else if (view === 'week') setCursor((c) => addDays(c, 7 * delta))
      else {
        const ym = shiftMonth(activeYm, delta)
        setCursor(ym === todayYm ? todayKey : `${ym}-01`)
      }
    },
    [view, activeYm, goToMonth, todayKey, todayYm],
  )

  const goToday = useCallback(() => {
    if (view === 'month') goToMonth(todayYm)
    else setCursor(todayKey)
  }, [view, goToMonth, todayYm, todayKey])

  const pickDay = useCallback(
    (day: string) => {
      setRailOpen(false)
      if (view === 'month') {
        goToMonth(day.slice(0, 7))
        setCursor(day)
      } else {
        setCursor(day)
        setFocusDay(day)
      }
    },
    [view, goToMonth],
  )

  const select = useCallback((next: SuiteSelection) => {
    setSel(next)
    setRailOpen(false)
  }, [])

  const openNeed = useCallback(
    (entry: ReturnType<typeof needsYou>[number]) => {
      if (entry.op === 'inbox') {
        setRailOpen(true)
        requestAnimationFrame(() => document.getElementById('cal-inbox')?.scrollIntoView({ block: 'center' }))
        return
      }
      if (entry.kind === 'overdue') select({ kind: 'todo', id: entry.ref })
      else if (entry.kind === 'clash') select({ kind: 'item', id: entry.ref })
      else select({ kind: 'plan', id: entry.ref })
    },
    [select],
  )

  const toggleLayer = useCallback((layer: PlannerLayer) => setHidden((h) => ({ ...h, [layer]: !h[layer] })), [])

  // The keys: D W M A I B L for the views, T for today, P to pencil, / to ask, the arrows to page, and
  // Esc for the top layer. A key with a modifier, or one typed into a field or a sheet, is left alone.
  const state = useRef({ sheet, jumpOpen, railOpen, sel })
  useEffect(() => {
    state.current = { sheet, jumpOpen, railOpen, sel }
  })
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null
      const action = suiteKeyAction({
        key: e.key,
        ctrlKey: e.ctrlKey,
        metaKey: e.metaKey,
        altKey: e.altKey,
        targetTag: el?.tagName ?? null,
        targetEditable: !!el?.isContentEditable,
        inSheet: !!state.current.sheet || !!el?.closest?.('[role="dialog"]'),
      })
      if (!action) return
      if (action.type === 'escape') {
        const s = state.current
        if (s.sheet) setSheet(null)
        else if (s.jumpOpen) setJumpOpen(false)
        else if (s.railOpen) setRailOpen(false)
        else if (s.sel) setSel(null)
        return
      }
      e.preventDefault()
      if (action.type === 'view') chooseView(action.view)
      else if (action.type === 'today') goToday()
      else if (action.type === 'page') page(action.delta)
      else if (action.type === 'pencil') setSheet('pencil')
      else if (action.type === 'ask') setSheet('ask')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [chooseView, goToday, page])

  const showMore = useCallback(
    (day: string) => {
      setCursor(day)
      setFocusDay(day)
      chooseView('agenda')
    },
    [chooseView],
  )

  return (
    <CohostProvider api={cohost.api}>
    <div className="cal-box">
    <div
      className="cal-suite"
      data-view={view}
      data-details={sel ? 'open' : 'closed'}
      data-rail={railOpen ? 'open' : 'closed'}
    >
      <aside className="cal-rail fq-panel" aria-label="Calendar sidebar">
        <SuiteRail
          brandName={brandName}
          data={plannerData}
          ctx={ctx}
          team={team}
          hidden={hidden}
          activeYm={activeYm}
          cursor={cursor}
          sel={sel}
          feed={{ httpsUrl: props.httpsUrl, webcalUrl: props.webcalUrl }}
          upcomingCount={props.upcomingCount ?? 0}
          dnd={dnd}
          onToggleLayer={toggleLayer}
          onPickDay={pickDay}
          onSelect={select}
          onPencil={() => setSheet('pencil')}
        />
      </aside>

      <div className="cal-main">
        <SuiteHeader
          view={view}
          cursor={cursor}
          todayYm={todayYm}
          minYm={minYm}
          maxYm={maxYm}
          sign={sign}
          zoneLabel={props.zoneLabel}
          counts={monthCounts}
          jumpOpen={jumpOpen}
          onJump={setJumpOpen}
          onView={chooseView}
          onPage={page}
          onToday={goToday}
          onPickMonth={(ym) => {
            if (view === 'month') goToMonth(ym)
            else setCursor(ym === todayYm ? todayKey : `${ym}-01`)
          }}
          onRail={() => setRailOpen(true)}
          onAsk={() => setSheet('ask')}
        />
        <SuiteNeedsYou entries={needs} onOpen={openNeed} />
        <div className="cal-view">
          {view === 'month' ? (
            <SuiteMonth
              data={plannerData}
              ctx={ctx}
              sel={sel}
              notes={dayNotes}
              sky={sky}
              openYm={activeYm}
              minYm={minYm}
              maxYm={maxYm}
              request={request}
              dnd={dnd}
              onActiveMonth={onActiveMonth}
              onSelect={(ref) => select(ref)}
              onMore={showMore}
            />
          ) : view === 'agenda' ? (
            <SuiteAgenda data={plannerData} ctx={ctx} sel={sel} cursor={cursor} focusDay={focusDay} dnd={dnd} onSelect={(ref) => select(ref)} />
          ) : view === 'day' || view === 'week' ? (
            <SuiteWeek
              data={plannerData}
              ctx={ctx}
              sel={sel}
              cursor={cursor}
              days={view === 'week' ? 7 : 1}
              nowMin={nowMin}
              sky={sky}
              dnd={dnd}
              zoneShort={props.zoneShort ?? ''}
              onSelect={(ref) => select(ref)}
              onOpenDay={
                view === 'week'
                  ? (day) => {
                      setCursor(day)
                      chooseView('day')
                    }
                  : undefined
              }
            />
          ) : (
            <div className="cal-soon">
              <EmptyState
                variant="first-use"
                icon={CalendarClock}
                title={`${SUITE_VIEW_LABEL[view]} is coming soon`}
                description={`${READY_VIEWS.slice(0, -1).map((v) => SUITE_VIEW_LABEL[v]).join(', ')} and ${SUITE_VIEW_LABEL[READY_VIEWS[READY_VIEWS.length - 1]]} are ready now.`}
                action={
                  <Button variant="primarySoft" size="sm" onClick={() => chooseView('week')}>
                    Open Week
                  </Button>
                }
              />
            </div>
          )}
        </div>
      </div>

      <aside className="cal-details fq-panel" aria-label="Details" hidden={!sel}>
        {sel ? <SuiteDetails sel={sel} data={plannerData} ctx={ctx} onSelect={select} onClose={() => setSel(null)} /> : null}
      </aside>

      <div className="cal-scrim" onClick={() => (railOpen ? setRailOpen(false) : setSel(null))} aria-hidden />

      {moves.layer}
      {cohost.layer}

      {sheet === 'pencil' ? (
        <SuiteSheet
          title="Pencil it in"
          line="Hold up to three dates while you work it out. Only your team sees it."
          onClose={() => setSheet(null)}
        >
          <EmptyState
            variant="first-use"
            icon={Sparkles}
            title="Holding dates from here is on its way"
            description="Until then, start an event, or open your Plans to pencil dates on one."
            action={
              <>
                <Link className="btn pa" href={props.newEventHref}>
                  New event
                </Link>
                <a className="btn" href="#calendar-plans" onClick={() => setSheet(null)}>
                  Open your Plans
                </a>
              </>
            }
          />
        </SuiteSheet>
      ) : null}
      {sheet === 'ask' ? (
        <SuiteSheet title="Ask Vera or search" line="Say what you want on the calendar, or find something already on it." onClose={() => setSheet(null)}>
          <EmptyState variant="first-use" icon={Sparkles} title="Ask and search are coming soon" description="For now, switch views or page through the months." />
        </SuiteSheet>
      ) : null}
    </div>
    </div>
    </CohostProvider>
  )
}
