'use client'

import { useMemo, useState } from 'react'
import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/field'
import type { SuiteItem, SuitePlan } from '@/lib/calendar/planner/adapters'
import { planStats } from '@/lib/calendar/planner/board'
import { hostSpaceId, isInvitePending } from '@/lib/calendar/planner/day-items'
import { dayLabel } from '@/lib/calendar/planner/days'
import { NEW_TODO_OFFSET, holdSentence, todoDueLine } from '@/lib/calendar/planner/details'
import { KINDS } from '@/lib/calendar/planner/kinds'
import { groupByPhase } from '@/lib/calendar/planner/playbook-schedule'
import type { PlannerData } from '@/lib/calendar/planner/types'
import type { DetailsActions } from './suite-details-actions'
import { TodoCheck, useRun } from './suite-details-fields'
import type { SuiteContext, SuiteSelection } from './suite-types'

// THE PLAN CONTEXT CARD (README 1.3). Shown under a Plan, and under any date or to-do that belongs to
// one: who the Plan is with (the Spaces, read only for now), how long a held date holds and which date
// to pick, and the to-dos in the order the work happens, Before, Day of and After, each with how far
// from the date it falls. The to-dos can be ticked and added here; everything else about a Plan is
// changed above, in the panel.

export function SuitePlanCard({
  plan,
  data,
  ctx,
  actions,
  onSelect,
  bare = false,
}: {
  /** True when the Plan itself is the selection, so its own row would only point at itself. */
  bare?: boolean
  plan: SuitePlan
  data: PlannerData
  ctx: SuiteContext
  actions: DetailsActions
  onSelect: (sel: SuiteSelection) => void
}) {
  const canEdit = !!ctx.canEdit
  const stats = planStats(plan, data, ctx.today)
  const pending = isInvitePending(plan, ctx.ownSpaceId)
  const hostId = hostSpaceId(plan)
  const mine = hostId === ctx.ownSpaceId
  const { error, busy, run, fail } = useRun()
  const [title, setTitle] = useState('')
  const groups = useMemo(() => {
    const phased = groupByPhase(stats.todos).map((g) => ({ phase: g.phase as string, todos: g.todos }))
    const loose = stats.todos.filter((t) => !t.phase)
    return loose.length ? [...phased, { phase: 'Anytime', todos: loose }] : phased
  }, [stats.todos])
  const options = stats.items
    .filter((i) => i.option)
    .map((i) => ctx.itemById.get(i.id))
    .filter((i): i is SuiteItem => !!i)
  const name = (id: string) => (id === ctx.ownSpaceId ? ctx.ownName : (ctx.spaceNames[id] ?? 'Another Space'))
  const canAdd = canEdit && mine && !pending && plan.stage !== 'cancelled'

  const add = async () => {
    const text = title.trim()
    if (!text || busy) return
    if (await run(() => actions.addTodo(plan.id, text, NEW_TODO_OFFSET))) setTitle('')
  }

  return (
    <section className="cal-pcard" aria-label="Plan">
      {pending ? (
        <div className="cal-invite">
          <p>
            <strong>{hostId ? name(hostId) : 'Another Space'}</strong> wants to co-host
          </p>
          <p className="cal-as">Say yes and it lands on your calendar, and both teams can edit it.</p>
          <a className="cal-link" href="#calendar-shared-plans">
            Answer it under Shared with you
          </a>
        </div>
      ) : null}
      {bare ? null : (
        <div className="cal-prow">
          <button type="button" className="cal-plink" onClick={() => onSelect({ kind: 'plan', id: plan.id })}>
            {plan.title}
          </button>
          <span className="cal-stack">
            {plan.team.slice(0, 4).map((id) => {
              const m = ctx.teamById.get(id)
              return m ? <Avatar key={id} src={m.avatarUrl} name={m.name} size="xs" /> : null
            })}
          </span>
        </div>
      )}
      {plan.stage === 'pencil' && plan.hold ? <p className="cal-serif">{holdSentence(plan.hold, ctx.today)}</p> : null}
      {options.length > 1 ? (
        <ul className="cal-plain" aria-label="Held dates">
          {options.map((i) => (
            <li key={i.id} className="cal-opt">
              <button type="button" className="cal-trow" onClick={() => onSelect({ kind: 'item', id: i.id })}>
                <span className="cal-abar" style={{ background: KINDS[i.kind].dot }} aria-hidden />
                <span className="cal-ttext">
                  <span className="cal-at">Option {i.option}</span>
                  <span className="cal-as">{dayLabel(i.date)}</span>
                </span>
              </button>
              {canEdit && mine && i.entryId ? (
                <Button
                  type="button"
                  size="sm"
                  variant="primarySoft"
                  disabled={busy}
                  onClick={() => void run(() => actions.pickDate(i.entryId as string))}
                >
                  Pick this
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      <div>
        <p className="cal-caps cal-ghead">Spaces</p>
        <ul className="cal-plain" aria-label="Spaces on this Plan">
          {plan.spaces.map((s) => (
            <li key={s.id} className="cal-srow">
              <span>{name(s.id)}</span>
              <span className="cal-muted">{s.status === 'pending' ? 'Invited' : s.role}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="cal-todos">
        <p className="cal-caps">To-dos</p>
        {groups.map((g) => (
          <div key={g.phase}>
            <p className="cal-serif cal-ghead">{g.phase}</p>
            <ul className="cal-plain">
              {g.todos.map((t) => {
                const task = ctx.taskById.get(t.id)
                const late = !t.done && !!t.due && t.due < ctx.today
                const owner = t.owner ? ctx.teamById.get(t.owner) : null
                return (
                  <li key={t.id} className="cal-trow">
                    <TodoCheck
                      done={t.done}
                      canEdit={canEdit && !task?.sharedFrom}
                      onToggle={(next) => actions.setTodoDone(t.id, next)}
                      onError={fail}
                    />
                    <button type="button" className="cal-tmain" onClick={() => onSelect({ kind: 'todo', id: t.id })}>
                      <span className="cal-ttext">
                        <span className="cal-at" data-struck={t.done || undefined}>
                          {t.title}
                        </span>
                        <span className="cal-as">{todoDueLine(t.due, task?.dueOffsetDays)}</span>
                      </span>
                      {late ? <span className="cal-flag">Overdue</span> : null}
                      {owner ? <Avatar src={owner.avatarUrl} name={owner.name} size="xs" /> : null}
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
        {stats.todos.length === 0 ? <p className="cal-serif">No to-dos yet.</p> : null}
        {canAdd ? (
          <Input
            aria-label="Add a to-do"
            placeholder="Add a to-do, due 3 days before"
            value={title}
            disabled={busy}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                void add()
              }
            }}
          />
        ) : null}
      </div>
      {error ? (
        <p role="alert" className="cal-err">
          {error}
        </p>
      ) : null}
    </section>
  )
}
