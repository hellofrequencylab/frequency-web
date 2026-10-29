'use client'

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { FqIcon, type FqIconName } from '@/components/frequency/icon'
import type { AstroMarker } from '@/lib/calendar/astro-markers'
import { dayItems, isInvitePending, isItemVisible, partnerSpaceId } from '@/lib/calendar/planner/day-items'
import { addDays, clockLabel, dayLabel, mondayOnOrBefore, weekdayName } from '@/lib/calendar/planner/days'
import { DEFAULT_BLOCK_MINUTES } from '@/lib/calendar/planner/inbox-drop'
import { KINDS } from '@/lib/calendar/planner/kinds'
import { skyOnDay } from '@/lib/calendar/planner/month'
import type { PlannerData, PlannerItem } from '@/lib/calendar/planner/types'
import {
  bandSegments,
  gridHeight,
  hourMarks,
  layoutTimed,
  minutesAtOffset,
  quickAddMinutes,
  nowOffset,
  visibleHourRange,
} from '@/lib/calendar/planner/week-layout'
import { PartnerRing } from './suite-chip'
import { isEmptyClick, type QuickAnchor, type SuiteContext, type SuiteSelection } from './suite-types'
import type { SuiteDnd } from './use-suite-dnd'

// THE WEEK AND THE DAY (README 1.3): one time grid, drawn for seven days or for one. Each column has a
// 32px date tile and the weekday with any sky text, an all-day row sits under it, and below that the
// hours from 7 AM to 11 PM at 52px an hour, growing to hold anything earlier or later rather than
// clipping it. Overlapping cards share lanes per cluster, so a lone card keeps its whole column. A card
// shows its word and option, its title and its time range. The now line is a gradient with an orb on
// today's column. Dragging a card or an Inbox to-do onto a time snaps to 15 minutes; onto the all-day
// row or a column head's day it keeps the time. What a drop DOES is decided in lib/calendar/planner/drop.ts.
//
// Cancelled dates are left off the grid (the Month strikes them through, the Agenda keeps them): a
// cancelled card on a time it no longer holds would read as a booking.

/** A card on the grid: a date, or a to-do that was given a block. */
interface GridCard {
  key: string
  src: 'item' | 'todo'
  id: string
  title: string
  kind: PlannerItem['kind'] | 'todo'
  option: string
  startMin: number
  durMin: number
  done: boolean
  partner: string | null
  clash: boolean
  invite: boolean
}

/** Pixels in one hour of the grid. */
const HOUR_PX = gridHeight({ startHour: 0, endHour: 1 })

const selKey = (sel: SuiteSelection) => (sel && sel.kind !== 'plan' ? `${sel.kind}:${sel.id}` : '')

function rangeLabel(c: Pick<GridCard, 'startMin' | 'durMin'>): string {
  return `${clockLabel(c.startMin)} to ${clockLabel(c.startMin + (c.durMin > 0 ? c.durMin : 60))}`
}

export function SuiteWeek({
  data,
  ctx,
  sel,
  cursor,
  days,
  nowMin,
  sky,
  dnd,
  zoneShort,
  onSelect,
  onOpenDay,
  onQuick,
}: {
  data: PlannerData
  ctx: SuiteContext
  sel: SuiteSelection
  cursor: string
  /** 7 for the Week, 1 for the Day. */
  days: 1 | 7
  /** Minutes since midnight on the Space's clock, or null to draw no now line. */
  nowMin: number | null
  sky: readonly AstroMarker[]
  dnd: SuiteDnd
  /** "PDT", printed in the corner of the grid. */
  zoneShort: string
  onSelect: (ref: { kind: 'item' | 'todo'; id: string }) => void
  /** A column head's date tile opens that day. Absent on the Day view. */
  onOpenDay?: (day: string) => void
  /** A click on empty time, or on a day's all-day cell, asks for a quick add there. */
  onQuick?: (anchor: QuickAnchor) => void
}) {
  const start = days === 7 ? mondayOnOrBefore(cursor) : cursor
  const dayKeys = useMemo(() => Array.from({ length: days }, (_, i) => addDays(start, i)), [start, days])
  const last = dayKeys[dayKeys.length - 1]
  const own = ctx.ownSpaceId

  const live = useMemo(
    () => data.items.filter((i) => i.kind !== 'cancelled' && isItemVisible(data, i, own) && i.date <= last && (i.end ?? i.date) >= start),
    [data, own, start, last],
  )

  // Timed cards by day: single-day dates with a start, and to-dos that were given a block.
  const byDay = useMemo(() => {
    const out = new Map<string, GridCard[]>()
    for (const day of dayKeys) {
      const cards: GridCard[] = []
      const { items, todos } = dayItems(data, day, own)
      for (const it of items) {
        if (it.kind === 'cancelled' || it.startMin == null || it.end || it.date !== day) continue
        const plan = ctx.planById.get(it.plan ?? '')
        cards.push({
          key: `i:${it.id}`,
          src: 'item',
          id: it.id,
          title: it.title,
          kind: it.kind,
          option: it.option ? `Opt ${it.option}` : '',
          startMin: it.startMin,
          durMin: it.durMin,
          done: false,
          partner: ctx.spaceNames[partnerSpaceId(plan, own) ?? ''] ?? null,
          clash: ctx.clashes.has(it.id),
          invite: isInvitePending(plan, own),
        })
      }
      for (const t of todos) {
        if (t.startMin == null) continue
        cards.push({
          key: `t:${t.id}`,
          src: 'todo',
          id: t.id,
          title: t.title,
          kind: 'todo',
          option: '',
          startMin: t.startMin,
          durMin: t.estHours && t.estHours > 0 ? Math.round(t.estHours * 60) : DEFAULT_BLOCK_MINUTES,
          done: t.done,
          partner: null,
          clash: false,
          invite: false,
        })
      }
      out.set(day, cards)
    }
    return out
  }, [dayKeys, data, own, ctx])

  const range = useMemo(
    () => visibleHourRange([...byDay.values()].flat().map((c) => ({ startMin: c.startMin, durMin: c.durMin }))),
    [byDay],
  )
  const height = gridHeight(range)
  const marks = hourMarks(range)

  // The all-day row: runs of days and all-day dates as bands, then the to-dos due without a block.
  const bands = useMemo(() => bandSegments(live, start, days), [live, start, days])
  const dueRows = useMemo(
    () =>
      dayKeys.map((day) => (data.hidden?.todos ? [] : data.tasks.filter((t) => t.due === day && t.startMin == null))),
    [dayKeys, data],
  )
  const bandRows = bands.reduce((n, b) => Math.max(n, b.row + 1), 0)
  const dueDepth = dueRows.reduce((n, r) => Math.max(n, r.length), 0)
  const allDayRows = Math.max(1, bandRows + dueDepth)
  const liveById = useMemo(() => new Map(live.map((i) => [i.id, i])), [live])

  // Where a dragged card would land, drawn as a ghost with its time.
  const [ghost, setGhost] = useState<{ day: string; startMin: number; durMin: number } | null>(null)

  const scroller = useRef<HTMLDivElement>(null)
  const todayIn = dayKeys.includes(ctx.today)
  useEffect(() => {
    const box = scroller.current
    if (!box) return
    const at = todayIn && nowMin != null ? nowOffset(nowMin, range) : null
    box.scrollTop = at != null ? Math.max(0, at - 120) : 0
    // Only when the window or the day changes: a drag must not scroll the grid under the pointer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [start, days, todayIn])

  const selected = selKey(sel)
  const cols: CSSProperties = { gridTemplateColumns: `var(--cal-tg-gutter) repeat(${days}, minmax(0, 1fr))` }

  return (
    <div className="cal-tg" data-days={days} role="group" aria-label={days === 7 ? 'Week' : 'Day'}>
      <div className="cal-tg-scroll" ref={scroller}>
        <div className="cal-tg-inner" data-days={days}>
          <div className="cal-tg-top">
            <div className="cal-tg-row" style={cols}>
              <div className="cal-tg-gutter cal-caps">{zoneShort}</div>
              {dayKeys.map((day) => {
                const mark = skyOnDay(day, sky)
                const head = (
                  <>
                    <span className="cal-caps">{weekdayName(day).slice(0, 3)}</span>
                    <span className="cal-tg-tile">{Number(day.slice(8, 10))}</span>
                    {mark ? (
                      <span className="cal-tg-sky" title={mark.label}>
                        <FqIcon
                          name={(mark.icon === 'sign' ? `house-${String(mark.house).padStart(2, '0')}` : mark.icon) as FqIconName}
                          size={14}
                        />
                        <span className="cal-serif">{mark.label}</span>
                      </span>
                    ) : null}
                  </>
                )
                return onOpenDay ? (
                  <button
                    type="button"
                    key={day}
                    className="cal-tg-head"
                    data-today={day === ctx.today || undefined}
                    aria-label={`Open ${dayLabel(day)}`}
                    onClick={() => onOpenDay(day)}
                  >
                    {head}
                  </button>
                ) : (
                  <div key={day} className="cal-tg-head" data-today={day === ctx.today || undefined}>
                    {head}
                  </div>
                )
              })}
            </div>

            <div className="cal-tg-allday" style={{ ...cols, gridTemplateRows: `repeat(${allDayRows}, 26px)` }}>
              <div className="cal-tg-gutter cal-caps" style={{ gridRow: '1 / -1' }}>
                All day
              </div>
              {dayKeys.map((day, i) => (
                <div
                  key={day}
                  className="cal-tg-cell"
                  data-day={day}
                  data-today={day === ctx.today || undefined}
                  style={{ gridColumn: i + 2, gridRow: '1 / -1' }}
                  {...dnd.targetProps(() => ({ zone: 'day', day }))}
                  onClick={
                    onQuick
                      ? (e) => {
                          if (isEmptyClick(e)) onQuick({ day, startMin: null, x: e.clientX, y: e.clientY })
                        }
                      : undefined
                  }
                />
              ))}
              {bands.map((b) => {
                const it = liveById.get(b.id)
                if (!it) return null
                const look = KINDS[it.kind]
                const r = (on: boolean) => (on ? '10px' : '3px')
                const plan = ctx.planById.get(it.plan ?? '')
                const partner = ctx.spaceNames[partnerSpaceId(plan, own) ?? ''] ?? null
                return (
                  <button
                    type="button"
                    key={b.id}
                    className="cal-chip cal-tg-band"
                    data-kind={it.kind}
                    data-band
                    data-selected={selected === `item:${it.id}` || undefined}
                    aria-pressed={selected === `item:${it.id}`}
                    aria-label={`${look.word} · All day · ${it.title}`}
                    title={`${look.word} · ${it.title}`}
                    style={{
                      gridColumn: `${b.startCol + 2} / ${b.endCol + 3}`,
                      gridRow: b.row + 1,
                      background: look.bg,
                      border: look.bd,
                      color: look.fg,
                      borderRadius: `${r(b.startsHere)} ${r(b.endsHere)} ${r(b.endsHere)} ${r(b.startsHere)}`,
                    }}
                    onClick={() => onSelect({ kind: 'item', id: it.id })}
                    {...dnd.dragProps('item', it.id)}
                  >
                    <span className="cal-chip-text">
                      <span className="cal-chip-t">{it.title}</span>
                    </span>
                    {ctx.clashes.has(it.id) ? <span className="cal-chip-flag">Clash</span> : null}
                    {partner ? <PartnerRing name={partner} /> : null}
                  </button>
                )
              })}
              {dueRows.flatMap((list, col) =>
                list.map((t, k) => (
                  <button
                    type="button"
                    key={`due:${t.id}`}
                    className="cal-chip cal-tg-band"
                    data-kind="todo"
                    data-selected={selected === `todo:${t.id}` || undefined}
                    data-struck={t.done || undefined}
                    aria-pressed={selected === `todo:${t.id}`}
                    aria-label={`To-do · ${t.title}`}
                    title={`To-do · ${t.title}`}
                    style={{
                      gridColumn: col + 2,
                      gridRow: bandRows + k + 1,
                      background: t.done ? 'var(--bg-sunken)' : KINDS.todo.bg,
                      border: KINDS.todo.bd,
                      color: t.done ? 'var(--text-faint)' : KINDS.todo.fg,
                    }}
                    onClick={() => onSelect({ kind: 'todo', id: t.id })}
                    {...dnd.dragProps('todo', t.id)}
                  >
                    <span className="cal-chip-text">
                      <span className="cal-chip-t">{t.title}</span>
                    </span>
                  </button>
                )),
              )}
            </div>
          </div>

          <div className="cal-tg-body" style={{ ...cols, height }}>
            <div className="cal-tg-gutter cal-tg-hours" aria-hidden>
              {marks.map((m) => (
                <span key={m.hour} className="cal-tg-hour" style={{ top: m.top }}>
                  {m.label}
                </span>
              ))}
            </div>
            {dayKeys.map((day, i) => {
              const cards = byDay.get(day) ?? []
              const placed = layoutTimed(
                cards.map((c) => ({ id: c.key, startMin: c.startMin, durMin: c.durMin })),
                range,
              )
              const at = day === ctx.today && nowMin != null ? nowOffset(nowMin, range) : null
              return (
                <div
                  key={day}
                  className="cal-tg-col"
                  data-day={day}
                  data-today={day === ctx.today || undefined}
                  style={{ gridColumn: i + 2 }}
                  onClick={
                    onQuick
                      ? (e) => {
                          if (!isEmptyClick(e)) return
                          const top = e.currentTarget.getBoundingClientRect().top
                          onQuick({ day, startMin: quickAddMinutes(e.clientY - top, range), x: e.clientX, y: e.clientY })
                        }
                      : undefined
                  }
                  {...dnd.targetProps(
                    (e, src) => {
                      const top = e.currentTarget.getBoundingClientRect().top
                      return { zone: 'time', day, startMin: minutesAtOffset(e.clientY - top, range, { grabOffsetPx: src.grabPx }) }
                    },
                    (target, src) => {
                      if (!target || target.zone !== 'time' || !src) return setGhost(null)
                      const it = src.kind === 'item' ? ctx.itemById.get(src.id) : null
                      const tk = src.kind === 'todo' ? ctx.taskById.get(src.id) : null
                      const durMin = it ? (it.durMin > 0 ? it.durMin : 60) : tk?.estHours ? Math.round(tk.estHours * 60) : DEFAULT_BLOCK_MINUTES
                      setGhost((g) => (g && g.day === target.day && g.startMin === target.startMin ? g : { day: target.day, startMin: target.startMin, durMin }))
                    },
                  )}
                >
                  {placed.map((p) => {
                    const c = cards.find((x) => x.key === p.id)
                    if (!c) return null
                    const look = KINDS[c.kind]
                    // Three tiers by height: word, title and range; title and a range-and-word line; one row.
                    const tier = p.height >= 62 ? 3 : p.height >= 40 ? 2 : 1
                    const range_ = rangeLabel(c)
                    const meta = [look.word, c.option, c.clash ? 'Clash' : '', c.invite ? 'Invite' : ''].filter(Boolean).join(' · ')
                    const isSel = selected === `${c.src}:${c.id}`
                    return (
                      <button
                        type="button"
                        key={c.key}
                        className="cal-card"
                        data-kind={c.kind}
                        data-selected={isSel || undefined}
                        data-clash={c.clash || undefined}
                        data-tier={tier}
                        data-lanes={p.lanes > 1 ? p.lanes : undefined}
                        data-struck={c.done || undefined}
                        aria-pressed={isSel}
                        aria-label={`${look.word} · ${c.title} · ${range_}`}
                        title={`${look.word} · ${c.title} · ${range_}`}
                        style={{
                          top: p.top,
                          height: Math.max(22, p.height),
                          '--l': `calc(${p.leftPct}% + 2px)`,
                          '--w': `calc(${p.widthPct}% - 4px)`,
                          background: c.done ? 'var(--bg-sunken)' : look.bg,
                          border: look.bd,
                          color: c.done ? 'var(--text-faint)' : look.fg,
                        } as CSSProperties}
                        onClick={() => onSelect({ kind: c.src, id: c.id })}
                        {...dnd.dragProps(c.src, c.id, true)}
                      >
                        <span className="cal-card-text">
                          {tier === 3 ? <span className="cal-card-m">{meta}</span> : null}
                          <span className="cal-card-t">{c.title}</span>
                          {tier === 3 ? <span className="cal-card-r">{range_}</span> : null}
                          {tier === 2 ? <span className="cal-card-r">{`${range_} · ${meta}`}</span> : null}
                          {tier === 1 && p.lanes === 1 ? <span className="cal-card-r">{`${clockLabel(c.startMin)}${c.clash ? ' · Clash' : ''}`}</span> : null}
                        </span>
                        {c.partner && tier > 1 && p.lanes < 3 ? <PartnerRing name={c.partner} /> : null}
                      </button>
                    )
                  })}
                  {ghost && ghost.day === day ? (
                    <div
                      className="cal-ghost"
                      aria-hidden
                      style={{
                        top: ((ghost.startMin - range.startHour * 60) / 60) * HOUR_PX + 1,
                        height: Math.max(24, (ghost.durMin / 60) * HOUR_PX - 4),
                      }}
                    >
                      <span>{`${clockLabel(ghost.startMin)} to ${clockLabel(ghost.startMin + ghost.durMin)}`}</span>
                    </div>
                  ) : null}
                  {at != null ? (
                    <div className="cal-now" style={{ top: at }} role="img" aria-label={`Now, ${clockLabel(nowMin ?? 0)}`}>
                      <i />
                    </div>
                  ) : null}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
