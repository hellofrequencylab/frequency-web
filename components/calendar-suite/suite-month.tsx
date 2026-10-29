'use client'

import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { FqIcon, type FqIconName } from '@/components/frequency/icon'
import type { AstroMarker } from '@/lib/calendar/astro-markers'
import { notesForDay, type DayNote } from '@/lib/calendar/day-notes'
import { itemChip, todoChip, type ChipModel } from '@/lib/calendar/planner/chip'
import { dayItems, isInvitePending, itemPartnerId } from '@/lib/calendar/planner/day-items'
import { SEASON_WASH } from '@/lib/calendar/planner/kinds'
import { monthName, monthSky, monthWeeks, monthsBetween, shiftMonth, skyOnDay } from '@/lib/calendar/planner/month'
import type { PlannerData } from '@/lib/calendar/planner/types'
import { SuiteChip } from './suite-chip'
import type { SuiteContext, SuiteSelection } from './suite-types'
import type { SuiteDnd } from './use-suite-dnd'

// THE MONTH (README 1.3): an infinite scroll of month blocks. Nine months to start, six more whenever
// the reader comes within 900px of either end, and the scroll position holds when months are added
// above. A block's header is in the flow, never sticky, so headers never stack; the page title follows
// the block whose top has passed the top of the window. Months stop at the edges of the data the page
// loaded, with a line that says so, because a month past it would draw as empty and read as true.

/** Months drawn at first, and how many each extension adds. */
const START_MONTHS = 9
const EXTEND_BY = 6
/** How close to an end the reader gets before more months load, in px. */
const EXTEND_NEAR = 900
/** A block counts as the one in view once its top passes the window's top by this much. */
const TITLE_SYNC = 60
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const
/** Chips a day shows before "+N more". */
const DAY_CHIPS = 3

export interface MonthScrollRequest {
  ym: string
  /** A new number each time, so asking for the same month twice still scrolls. */
  token: number
  smooth: boolean
}

interface BlockProps {
  ym: string
  data: PlannerData
  ctx: SuiteContext
  selectedKey: string
  notes: readonly DayNote[]
  sky: readonly AstroMarker[]
  dnd: SuiteDnd
  onSelect: (ref: ChipModel['ref']) => void
  onMore: (day: string) => void
}

const selKey = (sel: SuiteSelection) => (sel && sel.kind !== 'plan' ? `${sel.kind}:${sel.id}` : '')

function SkyMark({ icon, house, label }: { icon: 'moon' | 'sun' | 'sign'; house: number; label: string }) {
  const name: FqIconName = icon === 'moon' ? 'moon' : icon === 'sun' ? 'sun' : (`house-${String(house).padStart(2, '0')}` as FqIconName)
  return (
    <span className="cal-sky" data-sky={icon} title={label}>
      <FqIcon name={name} size={14} />
    </span>
  )
}

const MonthBlock = memo(function MonthBlock({ ym, data, ctx, selectedKey, notes, sky, dnd, onSelect, onMore }: BlockProps) {
  const weeks = useMemo(() => monthWeeks(ym), [ym])
  const info = useMemo(() => monthSky(ym, sky), [ym, sky])
  const year = ym.slice(0, 4)
  return (
    <section className="cal-mblock" data-ym={ym} aria-label={`${monthName(ym)} ${year}`}>
      <header className="cal-mhead" style={{ background: `${SEASON_WASH[info.season]}, var(--surface-glass)` }}>
        <div className="cal-mhead-main">
          <h3 className="cal-mname">
            {monthName(ym)} <span className="cal-myear">{year}</span>
          </h3>
          <span className="cal-season">{info.season}</span>
          <span className="cal-serif cal-mline">{info.line}</span>
        </div>
        {info.ingress || info.moons ? (
          <div className="cal-mhead-sky">
            {info.ingress ? (
              <span className="cal-mingress">
                {info.ingressHouse ? <FqIcon name={`house-${String(info.ingressHouse).padStart(2, '0')}` as FqIconName} size={14} /> : null}
                {info.ingress}
              </span>
            ) : null}
            {info.moons ? <span className="cal-serif">{info.moons}</span> : null}
          </div>
        ) : null}
      </header>
      {weeks.map((week) => (
        <div className="cal-week" key={week[0]}>
          {week.map((day) => {
            const inMonth = day.slice(0, 7) === ym
            if (!inMonth) return <div className="cal-day" data-out key={day} aria-hidden />
            const { items, todos } = dayItems(data, day, ctx.ownSpaceId)
            const live = items.filter((i) => i.kind !== 'cancelled')
            const called = items.filter((i) => i.kind === 'cancelled')
            const chips = [
              ...live.map((i) => ({
                model: itemChip(i, day, { clash: ctx.clashes.has(i.id), invite: isInvitePending(ctx.planById.get(i.plan ?? ''), ctx.ownSpaceId) }),
                partner: ctx.spaceNames[itemPartnerId(i, ctx.planById.get(i.plan ?? ''), ctx.ownSpaceId) ?? ''] ?? null,
              })),
              ...todos.map((t) => ({ model: todoChip(t), partner: null })),
            ]
            const shown = chips.slice(0, DAY_CHIPS)
            const more = chips.length - shown.length
            const mark = skyOnDay(day, sky)
            const note = notesForDay(notes, day)[0]
            return (
              <div
                className="cal-day"
                key={day}
                data-today={day === ctx.today || undefined}
                data-past={day < ctx.today || undefined}
                {...dnd.targetProps(() => ({ zone: 'day', day }))}
              >
                <div className="cal-day-top">
                  <span className="cal-num" aria-label={day}>
                    {Number(day.slice(8, 10))}
                  </span>
                  {mark ? <SkyMark icon={mark.icon} house={mark.house} label={mark.label} /> : null}
                  {note || mark ? <span className="cal-serif cal-day-label">{note ?? mark?.label}</span> : null}
                </div>
                {shown.map(({ model, partner }) => (
                  <SuiteChip
                    key={`${model.ref.kind}:${model.ref.id}`}
                    model={model}
                    partner={partner}
                    selected={selectedKey === `${model.ref.kind}:${model.ref.id}`}
                    onSelect={onSelect}
                    dragProps={dnd.dragProps(model.ref.kind, model.ref.id)}
                  />
                ))}
                {more > 0 ? (
                  <button type="button" className="cal-more" onClick={() => onMore(day)}>
                    +{more} more
                  </button>
                ) : null}
                {called.length > 0 ? (
                  <span className="cal-called" title={called.map((c) => c.title).join(', ')}>
                    {called.map((c) => c.title).join(', ')} cancelled
                  </span>
                ) : null}
              </div>
            )
          })}
        </div>
      ))}
    </section>
  )
})

export function SuiteMonth({
  data,
  ctx,
  sel,
  notes,
  sky,
  openYm,
  minYm,
  maxYm,
  request,
  dnd,
  onActiveMonth,
  onSelect,
  onMore,
}: {
  data: PlannerData
  ctx: SuiteContext
  sel: SuiteSelection
  notes: readonly DayNote[]
  sky: readonly AstroMarker[]
  /** The month to open on. */
  openYm: string
  /** The first and last month the page loaded data for. */
  minYm: string
  maxYm: string
  request: MonthScrollRequest | null
  dnd: SuiteDnd
  onActiveMonth: (ym: string) => void
  onSelect: (ref: ChipModel['ref']) => void
  onMore: (day: string) => void
}) {
  const scroller = useRef<HTMLDivElement>(null)
  const clamp = useCallback((ym: string) => (ym < minYm ? minYm : ym > maxYm ? maxYm : ym), [minYm, maxYm])
  const windowAround = useCallback(
    (ym: string) => {
      const start = clamp(shiftMonth(ym, -2))
      return { start, count: Math.min(START_MONTHS, monthsBetween(start, maxYm) + 1) }
    },
    [clamp, maxYm],
  )
  const [win, setWin] = useState(() => windowAround(openYm))
  const root = useRef<HTMLDivElement>(null)
  // What the next layout pass has to do to the scroll position: hold it after months were added above,
  // or move to a month that was asked for.
  const pending = useRef<{ hold?: { height: number; top: number }; goto?: { ym: string; smooth: boolean } } | null>({
    goto: { ym: openYm, smooth: false },
  })
  const lastRequest = useRef(0)
  const active = useRef(openYm)
  const frame = useRef(0)

  const months = useMemo(() => Array.from({ length: win.count }, (_, i) => shiftMonth(win.start, i)), [win])
  const endYm = months[months.length - 1]

  const scrollToBlock = useCallback((ym: string, smooth: boolean) => {
    const box = scroller.current
    const block = box?.querySelector<HTMLElement>(`[data-ym="${ym}"]`)
    if (!box || !block) return false
    box.scrollTo({ top: block.offsetTop - 4, behavior: smooth ? 'smooth' : 'instant' })
    return true
  }, [])

  // A request from outside (paging, Today, the jump panel, a key). When its month is not drawn the window
  // is redrawn around it while this renders (state adjusted from props), and the layout pass below puts
  // the scroll on it; when it is drawn, the effect scrolls to its block.
  const [seen, setSeen] = useState(0)
  const [jump, setJump] = useState<string | null>(null)
  if (request && request.token !== seen) {
    setSeen(request.token)
    const ym = clamp(request.ym)
    if (!months.includes(ym)) {
      setWin(windowAround(ym))
      setJump(ym)
    }
  }
  useEffect(() => {
    if (!request || request.token === lastRequest.current) return
    lastRequest.current = request.token
    const ym = clamp(request.ym)
    if (months.includes(ym)) scrollToBlock(ym, request.smooth)
  }, [request, months, clamp, scrollToBlock])

  useLayoutEffect(() => {
    const job = pending.current
    const box = scroller.current
    if (!box) return
    if (job) {
      pending.current = null
      if (job.hold) box.scrollTop = job.hold.top + (box.scrollHeight - job.hold.height)
      else if (job.goto) scrollToBlock(job.goto.ym, job.goto.smooth)
    } else if (jump) {
      scrollToBlock(jump, false)
    }
    // Drawn once it has been put on its month, so the first paint is never the wrong one.
    if (root.current) root.current.dataset.ready = 'true'
  }, [win, jump, scrollToBlock])

  const onScroll = useCallback(() => {
    if (frame.current) return
    frame.current = requestAnimationFrame(() => {
      frame.current = 0
      const box = scroller.current
      if (!box) return
      // Which month the title follows: the last block whose top has passed the window's top.
      const top = box.getBoundingClientRect().top + TITLE_SYNC
      let current = active.current
      for (const block of box.querySelectorAll<HTMLElement>('[data-ym]')) {
        if (block.getBoundingClientRect().top <= top) current = block.dataset.ym ?? current
        else break
      }
      if (current !== active.current) {
        active.current = current
        onActiveMonth(current)
      }
      // More months near either end, within what the page loaded.
      if (box.scrollTop + box.clientHeight > box.scrollHeight - EXTEND_NEAR && endYm < maxYm) {
        setWin((w) => ({ start: w.start, count: Math.min(w.count + EXTEND_BY, monthsBetween(w.start, maxYm) + 1) }))
      } else if (box.scrollTop < EXTEND_NEAR / 2 && win.start > minYm) {
        let add = 0
        while (add < EXTEND_BY && shiftMonth(win.start, -(add + 1)) >= minYm) add += 1
        if (add > 0) {
          pending.current = { hold: { height: box.scrollHeight, top: box.scrollTop } }
          setWin((w) => ({ start: shiftMonth(w.start, -add), count: w.count + add }))
        }
      }
    })
  }, [endYm, maxYm, minYm, onActiveMonth, win.start])

  useEffect(() => () => cancelAnimationFrame(frame.current), [])

  const selectedKey = selKey(sel)
  return (
    <div className="cal-month" ref={root} data-ready="false">
      <div className="cal-weekdays" aria-hidden>
        {WEEKDAYS.map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>
      <div className="cal-scroll" ref={scroller} onScroll={onScroll} tabIndex={-1}>
        {win.start > minYm ? null : <p className="cal-edge cal-serif">This is as far back as the calendar loads.</p>}
        {months.map((ym) => (
          <MonthBlock
            key={ym}
            ym={ym}
            data={data}
            ctx={ctx}
            selectedKey={selectedKey}
            notes={notes}
            sky={sky}
            dnd={dnd}
            onSelect={onSelect}
            onMore={onMore}
          />
        ))}
        {endYm < maxYm ? null : <p className="cal-edge cal-serif">This is as far ahead as the calendar loads.</p>}
      </div>
    </div>
  )
}
