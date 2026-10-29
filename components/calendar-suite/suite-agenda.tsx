'use client'

import { useEffect, useMemo, useRef } from 'react'
import { Avatar } from '@/components/ui/avatar'
import { EmptyState } from '@/components/ui/empty-state'
import { CalendarDays } from 'lucide-react'
import { buildAgenda } from '@/lib/calendar/planner/agenda'
import { partnerSpaceId } from '@/lib/calendar/planner/day-items'
import { monthDayLabel } from '@/lib/calendar/planner/days'
import { KINDS } from '@/lib/calendar/planner/kinds'
import type { PlannerData } from '@/lib/calendar/planner/types'
import { PartnerRing } from './suite-chip'
import type { SuiteContext, SuiteSelection } from './suite-types'
import type { SuiteDnd } from './use-suite-dnd'

// THE AGENDA (README 1.3): the next 45 days as cards, one per day that has anything on it. The date
// tile and weekday on the left, a row per item on the right: a colour bar, the title, the word pill,
// the time, the Plan, and the partner Space and owner at the end. Colour is never the only signal:
// every row prints its word.

export function SuiteAgenda({
  data,
  ctx,
  sel,
  cursor,
  focusDay,
  dnd,
  onSelect,
}: {
  data: PlannerData
  ctx: SuiteContext
  sel: SuiteSelection
  cursor: string
  /** A day to bring into view, from "+N more" on the month. */
  focusDay: string | null
  dnd: SuiteDnd
  onSelect: (ref: { kind: 'item' | 'todo'; id: string }) => void
}) {
  const days = useMemo(() => buildAgenda(data, cursor, ctx.today, ctx.ownSpaceId), [data, cursor, ctx.today, ctx.ownSpaceId])
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!focusDay) return
    box.current?.querySelector<HTMLElement>(`[data-day="${focusDay}"]`)?.scrollIntoView({ block: 'start', behavior: 'instant' })
  }, [focusDay])

  if (days.length === 0) {
    return (
      <div className="cal-agenda cal-agenda-empty">
        <EmptyState
          variant="no-results"
          icon={CalendarDays}
          title="Nothing on this stretch"
          description="No dates or to-dos here. Page forward, or switch a layer back on."
        />
      </div>
    )
  }

  return (
    <div className="cal-agenda" ref={box}>
      {days.map((day) => {
        const mon = monthDayLabel(day.key)
        const [month, num] = [mon.slice(0, 3), mon.slice(4)]
        return (
          <section
            className="cal-aday"
            key={day.key}
            data-day={day.key}
            data-today={day.key === ctx.today || undefined}
            {...dnd.targetProps(() => ({ zone: 'day', day: day.key }))}
          >
            <div className="cal-aside">
              <span className="cal-caps">{month}</span>
              <span className="cal-atile">{num}</span>
              <span className="cal-aweek">{day.weekday}</span>
              {day.rel ? <span className="cal-serif">{day.rel}</span> : null}
            </div>
            <div className="cal-arows">
              {day.rows.map((row) => {
                const look = KINDS[row.kind]
                const item = row.src === 'item' ? ctx.itemById.get(row.id) : null
                const task = row.src === 'todo' ? ctx.taskById.get(row.id) : null
                const ownerId = task?.owner ?? item?.owner ?? null
                const owner = ownerId ? ctx.teamById.get(ownerId) : null
                const plan = item?.plan ? ctx.planById.get(item.plan) : task?.plan ? ctx.planById.get(task.plan) : null
                const partner = ctx.spaceNames[partnerSpaceId(plan, ctx.ownSpaceId) ?? ''] ?? null
                const selected = sel?.kind === (row.src === 'item' ? 'item' : 'todo') && sel.id === row.id
                return (
                  <button
                    type="button"
                    key={`${row.src}:${row.id}`}
                    className="cal-arow"
                    data-selected={selected || undefined}
                    data-struck={row.cancelled || row.done || undefined}
                    aria-pressed={selected}
                    onClick={() => onSelect({ kind: row.src === 'item' ? 'item' : 'todo', id: row.id })}
                    {...(row.cancelled ? {} : dnd.dragProps(row.src === 'item' ? 'item' : 'todo', row.id))}
                  >
                    <span className="cal-abar" style={{ background: look.dot }} aria-hidden />
                    <span className="cal-atext">
                      <span className="cal-at">{row.title}</span>
                      <span className="cal-as">
                        {row.range}
                        {row.planTitle && row.planTitle !== row.title ? ` · ${row.planTitle}` : ''}
                        {row.going ? ` · ${row.going}` : ''}
                      </span>
                    </span>
                    <span className="cal-pill" style={{ background: look.bg, border: look.bd, color: look.fg }}>
                      {look.word}
                    </span>
                    {partner ? (
                      <span className="cal-partner" title={`With ${partner}`}>
                        <PartnerRing name={partner} />
                        <span className="cal-partner-t">{partner}</span>
                      </span>
                    ) : null}
                    {owner ? <Avatar src={owner.avatarUrl} name={owner.name} size="xs" /> : null}
                  </button>
                )
              })}
            </div>
          </section>
        )
      })}
    </div>
  )
}
