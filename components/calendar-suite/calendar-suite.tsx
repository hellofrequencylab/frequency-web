'use client'

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { moveSpaceTodo } from '@/app/(main)/spaces/[slug]/settings/calendar/task-actions'
import { deleteCalendarEntry, saveCalendarEntry, saveCalendarEntryOccurrence } from '@/app/(main)/spaces/[slug]/settings/calendar/entry-actions'
import { archiveSpacePlan, transitionPlanStage } from '@/app/(main)/spaces/[slug]/settings/calendar/plan-actions'
import { addQuickItem, pencilItIn } from '@/app/(main)/spaces/[slug]/settings/calendar/pencil-actions'
import type { AstroMarker } from '@/lib/calendar/astro-markers'
import type { DayNote } from '@/lib/calendar/day-notes'
import { calendarViewCookieName } from '@/lib/calendar/admin-views'
import type { AdaptedCalendar } from '@/lib/calendar/planner/adapters'
import { parseCommand } from '@/lib/calendar/planner/command-parse'
import { findClashes } from '@/lib/calendar/planner/clash'
import { addDays } from '@/lib/calendar/planner/days'
import { needsYou } from '@/lib/calendar/planner/needs-you'
import { shiftMonth, sunSignOn } from '@/lib/calendar/planner/month'
import { nowMinutes } from '@/lib/calendar/planner/now'
import {
  countByMonth,
  isPlanView,
  resolveSuiteView,
  SUITE_VIEWS,
  suiteKeyAction,
  viewCookieValue,
  type SuiteView,
} from '@/lib/calendar/planner/suite-model'
import type { PlannerData, PlannerLayer } from '@/lib/calendar/planner/types'
import { SuiteAgenda } from './suite-agenda'
import { SuiteBoard } from './suite-board'
import { CohostProvider, cohostActionsFor, useSuiteCohost, type CohostActions } from './use-suite-cohost'
import { SuiteDetails } from './suite-details'
import { bindDetailsActions, type DetailsActions } from './suite-details-actions'
import { SuiteHeader } from './suite-header'
import { SuiteList } from './suite-list'
import { SuiteMonth, type MonthScrollRequest } from './suite-month'
import { SuiteNeedsYou } from './suite-needs-you'
import { SuiteRail } from './suite-rail'
import type { CommandRow } from '@/lib/calendar/planner/command-results'
import { SuiteCommand } from './suite-command'
import { SuitePencil } from './suite-pencil'
import { SuiteQuick } from './suite-quick'
import { SuiteTimeline } from './suite-timeline'
import type { QuickAnchor, SuiteContext, SuiteSelection, SuiteTeamMember } from './suite-types'
import { SuiteWeek } from './suite-week'
import { useSuiteCreate, type SuiteCreateActions } from './use-suite-create'
import { useSuiteMoves, type SuiteActions } from './use-suite-moves'

// THE SPACE CALENDAR (README 1, layout 1a Sidebar). One full-height surface inside the console: the
// rail, the header, the Needs-you row, the view, and the Details panel. This part owns what is on
// screen (the view, the day the calendar is on, the layers switched off, the one thing selected) and
// the keys that move it. The records come in already adapted (lib/calendar/planner/adapters.ts), so
// nothing here knows what a row of the database looks like. Writes are the parts' own: a drop through
// use-suite-moves.tsx, an edit through the Details panel (suite-details.tsx).

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
  /** The Space's time zone, the one a command or a quick add is read in. */
  timeZone?: string
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
  /** The writes Pencil it in, quick add and the command bar make. Absent means the calendar's own server actions. */
  create?: SuiteCreateActions
  /** The writes the Details panel makes. Absent means the calendar's own server actions. */
  detailsActions?: DetailsActions
}

type Sheet = 'pencil' | 'command' | null
/** What the Pencil it in sheet opens with: a day and a title carried over from a quick add. */
interface PencilSeed {
  day: string | null
  title: string
}

export function CalendarSuite(props: CalendarSuiteProps) {
  const { slug, spaceId, brandName, todayKey, openYm, minYm, maxYm, team, dayNotes, sky } = props
  const canEdit = props.canEdit ?? false
  const actions = useMemo<SuiteActions>(
    () =>
      props.actions ?? {
        saveEntry: (entryId, input) => saveCalendarEntry(slug, entryId, input),
        saveOccurrence: (entryId, day, input) => saveCalendarEntryOccurrence(slug, entryId, day, input),
        moveTodo: (id, due, startMin) => moveSpaceTodo(slug, id, due, startMin),
        setStage: (planId, stage) => transitionPlanStage(slug, planId, stage),
      },
    [props.actions, slug],
  )
  const detailsActions = useMemo<DetailsActions>(() => props.detailsActions ?? bindDetailsActions(slug), [props.detailsActions, slug])
  // A drop is shown at once and written through the calendar's own actions (use-suite-moves.tsx).
  const moves = useSuiteMoves({ base: props.data, actions, canEdit, ownSpaceId: spaceId })
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
  const createActions = useMemo<SuiteCreateActions>(
    () =>
      props.create ?? {
        pencilItIn: (input) => pencilItIn(slug, input),
        addQuick: (input) => addQuickItem(slug, input),
        removePlan: (planId) => archiveSpacePlan(slug, planId),
        removeEntry: (entryId) => deleteCalendarEntry(slug, entryId),
      },
    [props.create, slug],
  )
  const make = useSuiteCreate(createActions, moves.say)
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
  const [seed, setSeed] = useState<PencilSeed>({ day: null, title: '' })
  const [quick, setQuick] = useState<(QuickAnchor & { box: { width: number; height: number } }) | null>(null)
  const box = useRef<HTMLDivElement>(null)
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
      canEdit,
      spaceNames: data.spaceNames,
      clashes: findClashes(data.items),
      teamById: new Map(team.map((m) => [m.id, m])),
      planById: new Map(data.plans.map((p) => [p.id, p])),
      itemById: new Map(data.items.map((i) => [i.id, i])),
      taskById: new Map(data.tasks.map((t) => [t.id, t])),
    }),
    [spaceId, brandName, todayKey, canEdit, data, team],
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
      // List, Kanban and Timeline hold every Plan, not a stretch of time: there is nothing to page.
      if (isPlanView(view)) return
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

  const openPencil = useCallback(
    (from?: PencilSeed) => {
      if (!canEdit) {
        moves.say('You can look at this calendar but not change it.', 'neutral')
        return
      }
      setQuick(null)
      setSeed(from ?? { day: null, title: '' })
      setSheet('pencil')
    },
    [canEdit, moves],
  )
  const openCommand = useCallback(() => {
    setQuick(null)
    setSheet('command')
  }, [])

  // The keys: D W M A I B L for the views, T for today, P to pencil, / for the command bar (Cmd or Ctrl
  // plus K toggles it, even from a field), the arrows to page, and Esc for the top layer. Any other key
  // with a modifier, or one typed into a field or a sheet, is left alone.
  const state = useRef({ sheet, jumpOpen, railOpen, sel, quick })
  useEffect(() => {
    state.current = { sheet, jumpOpen, railOpen, sel, quick }
  })
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        if (state.current.sheet === 'command') setSheet(null)
        else openCommand()
        return
      }
      const el = e.target as HTMLElement | null
      const action = suiteKeyAction({
        key: e.key,
        ctrlKey: e.ctrlKey,
        metaKey: e.metaKey,
        altKey: e.altKey,
        targetTag: el?.tagName ?? null,
        targetEditable: !!el?.isContentEditable,
        inSheet: !!state.current.sheet || !!state.current.quick || !!el?.closest?.('[role="dialog"]'),
      })
      if (!action) return
      if (action.type === 'escape') {
        const s = state.current
        if (s.quick) setQuick(null)
        else if (s.sheet) setSheet(null)
        else if (s.jumpOpen) setJumpOpen(false)
        else if (s.railOpen) setRailOpen(false)
        else if (s.sel) setSel(null)
        return
      }
      e.preventDefault()
      if (action.type === 'view') chooseView(action.view)
      else if (action.type === 'today') goToday()
      else if (action.type === 'page') page(action.delta)
      else if (action.type === 'pencil') openPencil()
      else if (action.type === 'ask') openCommand()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [chooseView, goToday, page, openPencil, openCommand])

  // A click on empty calendar asks for a quick add there, placed from the click inside the calendar's box.
  const askQuick = useCallback(
    (a: QuickAnchor) => {
      if (!canEdit || state.current.sheet) return
      const r = box.current?.getBoundingClientRect()
      if (!r) return
      setQuick({ ...a, x: a.x - r.left, y: a.y - r.top, box: { width: r.width, height: r.height } })
    },
    [canEdit],
  )

  // The command bar's rows. Views, Today, a Plan or a date just move the calendar; the create row writes.
  const runCommand = useCallback(
    async (row: CommandRow, parsed: ReturnType<typeof parseCommand>): Promise<string | null> => {
      if (row.type === 'view') chooseView(row.view)
      else if (row.type === 'today') goToday()
      else if (row.type === 'plan') select({ kind: 'plan', id: row.ref })
      else if (row.type === 'item') {
        if (view === 'month') goToMonth(row.day.slice(0, 7))
        setCursor(row.day)
        select({ kind: 'item', id: row.ref })
      } else if (parsed) {
        if (!canEdit) return 'You can look at this calendar but not change it.'
        const failed = await make.quick({ kind: parsed.kind, title: parsed.title, day: parsed.date, startMin: parsed.startMin, durMin: parsed.durMin })
        if (failed) return failed
        if (parsed.date) {
          if (view === 'month') goToMonth(parsed.date.slice(0, 7))
          setCursor(parsed.date)
        }
      }
      setSheet(null)
      return null
    },
    [canEdit, chooseView, goToday, goToMonth, make, select, view],
  )

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
    <div className="cal-box" ref={box}>
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
          onPencil={() => openPencil()}
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
          onAsk={openCommand}
          slug={slug}
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
              onQuick={askQuick}
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
              onQuick={askQuick}
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
          ) : view === 'list' ? (
            <SuiteList data={plannerData} ctx={ctx} sel={sel} onSelect={(ref) => select(ref)} />
          ) : view === 'board' ? (
            <SuiteBoard data={plannerData} ctx={ctx} sel={sel} dnd={dnd} onSelect={(ref) => select(ref)} onRestore={moves.restore} />
          ) : (
            <SuiteTimeline data={plannerData} ctx={ctx} sel={sel} onSelect={(ref) => select(ref)} />
          )}
        </div>
      </div>

      <aside className="cal-details fq-panel" aria-label="Details" hidden={!sel}>
        {sel ? (
          <SuiteDetails
            sel={sel}
            data={plannerData}
            ctx={ctx}
            actions={detailsActions}
            say={moves.say}
            onSelect={select}
            onClose={() => setSel(null)}
          />
        ) : null}
      </aside>

      <div className="cal-scrim" onClick={() => (railOpen ? setRailOpen(false) : setSel(null))} aria-hidden />

      {moves.layer}
      {cohost.layer}

      {sheet === 'pencil' ? (
        <SuitePencil
          today={todayKey}
          items={data.items}
          startDay={seed.day}
          startTitle={seed.title}
          onClose={() => setSheet(null)}
          onSubmit={async (input) => {
            const failed = await make.pencil(input)
            if (failed) return failed
            setSheet(null)
            const first = input.dates[0]
            if (view === 'month') goToMonth(first.slice(0, 7))
            setCursor(first)
            return null
          }}
        />
      ) : null}
      {sheet === 'command' ? (
        <SuiteCommand
          today={todayKey}
          timeZone={props.timeZone ?? 'America/Los_Angeles'}
          views={SUITE_VIEWS}
          plans={data.plans}
          items={data.items}
          onRun={runCommand}
          onClose={() => setSheet(null)}
        />
      ) : null}
      {quick ? (
        <SuiteQuick
          day={quick.day}
          startMin={quick.startMin}
          x={quick.x}
          y={quick.y}
          box={quick.box}
          onClose={() => setQuick(null)}
          onMore={(title) => openPencil({ day: quick.day, title })}
          onAdd={async (input) => {
            const failed = await make.quick({ ...input, durMin: 60 })
            if (!failed) setQuick(null)
            return failed
          }}
        />
      ) : null}
    </div>
    </div>
    </CohostProvider>
  )
}
