'use client'

import Link from 'next/link'
import { useMemo, type ReactNode } from 'react'
import { FqIcon } from '@/components/frequency/icon'
import { Avatar } from '@/components/ui/avatar'
import { IconButton } from '@/components/ui/icon-button'
import { ProgressTrack } from '@/components/ui/progress-track'
import type { SuiteItem, SuitePlan, SuiteTask } from '@/lib/calendar/planner/adapters'
import { planStats, stageLabel } from '@/lib/calendar/planner/board'
import { overlapsUnavailable } from '@/lib/calendar/planner/clash'
import { hostSpaceId, isInvitePending } from '@/lib/calendar/planner/day-items'
import { clockLabel, dayCount, dayLabel, lengthLabel, monthDayLabel } from '@/lib/calendar/planner/days'
import { KINDS } from '@/lib/calendar/planner/kinds'
import { groupByPhase } from '@/lib/calendar/planner/playbook-schedule'
import type { PlanStage, PlannerData } from '@/lib/calendar/planner/types'
import type { SuiteContext, SuiteSelection } from './suite-types'

// THE DETAILS PANEL (README 1.4), read-only. One inspector for the three things the calendar holds:
// an item, a to-do and a Plan. It states what the record is, when, and what it belongs to, and it
// links to the places where it can be changed today. Editing arrives with its own pass.

const STAGE_KIND: Record<PlanStage, keyof typeof KINDS> = {
  pencil: 'pencil',
  planning: 'planning',
  production: 'production',
  event: 'event',
  cancelled: 'cancelled',
}

/** "Wed, Oct 21, 9:30 AM to 5 PM", "Sat, Dec 5 to Sun, Dec 6, all day". */
function whenLine(item: SuiteItem): string {
  const span = item.end ? `${dayLabel(item.date)} to ${dayLabel(item.end)}` : dayLabel(item.date)
  if (item.startMin == null) return `${span}, all day`
  return `${span}, ${clockLabel(item.startMin)} to ${clockLabel(item.startMin + item.durMin)}`
}

/** "14 days before", "on the day", "1 day after". */
function offsetWords(offset: number | null | undefined): string {
  if (offset == null) return ''
  if (offset === 0) return 'on the day'
  return offset < 0 ? `${dayCount(-offset)} before` : `${dayCount(offset)} after`
}

function KindPill({ kind, children }: { kind: keyof typeof KINDS; children?: ReactNode }) {
  const look = KINDS[kind]
  return (
    <span className="cal-pill" style={{ background: look.bg, border: look.bd, color: look.fg }}>
      {children ?? look.word}
    </span>
  )
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="cal-drow">
      <dt className="cal-caps">{label}</dt>
      <dd>{children}</dd>
    </div>
  )
}

function Check({ done }: { done: boolean }) {
  return (
    <span className="cal-check" data-done={done || undefined} role="img" aria-label={done ? 'Done' : 'Not done'}>
      {done ? <FqIcon name="check" size={14} /> : null}
    </span>
  )
}

function PlanCard({
  plan,
  data,
  ctx,
  onSelect,
  bare = false,
}: {
  /** True when the Plan itself is the selection, so its own row would only point at itself. */
  bare?: boolean
  plan: SuitePlan
  data: PlannerData
  ctx: SuiteContext
  onSelect: (sel: SuiteSelection) => void
}) {
  const stats = planStats(plan, data, ctx.today)
  const pending = isInvitePending(plan, ctx.ownSpaceId)
  const hostId = hostSpaceId(plan)
  const groups = useMemo(() => {
    const phased = groupByPhase(stats.todos).map((g) => ({ phase: g.phase as string, todos: g.todos }))
    const loose = stats.todos.filter((t) => !t.phase)
    return loose.length ? [...phased, { phase: 'Anytime', todos: loose }] : phased
  }, [stats.todos])
  const name = (id: string) => (id === ctx.ownSpaceId ? ctx.ownName : (ctx.spaceNames[id] ?? 'Another Space'))
  return (
    <section className="cal-pcard" aria-label="Plan">
      {pending ? (
        <div className="cal-invite">
          <p>
            <strong>{hostId ? name(hostId) : 'Another Space'}</strong> invited you to co-host
          </p>
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
      {stats.hold ? <p className="cal-serif">{stats.hold}</p> : null}
      {plan.spaces.length > 1 ? (
        <ul className="cal-plain" aria-label="Spaces on this Plan">
          {plan.spaces.map((s) => (
            <li key={s.id} className="cal-srow">
              <span>{name(s.id)}</span>
              <span className="cal-muted">{s.status === 'pending' ? 'Invited' : s.role}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {stats.todos.length > 0 ? (
        <div className="cal-todos">
          {groups.map((g) => (
            <div key={g.phase}>
              <p className="cal-serif cal-ghead">{g.phase}</p>
              <ul className="cal-plain">
                {g.todos.map((t) => {
                  const task = ctx.taskById.get(t.id)
                  const late = !t.done && !!t.due && t.due < ctx.today
                  const owner = t.owner ? ctx.teamById.get(t.owner) : null
                  return (
                    <li key={t.id}>
                      <button type="button" className="cal-trow" onClick={() => onSelect({ kind: 'todo', id: t.id })}>
                        <Check done={t.done} />
                        <span className="cal-ttext">
                          <span className="cal-at" data-struck={t.done || undefined}>
                            {t.title}
                          </span>
                          <span className="cal-as">
                            {t.due ? monthDayLabel(t.due) : 'No date yet'}
                            {offsetWords(task?.dueOffsetDays) ? ` · ${offsetWords(task?.dueOffsetDays)}` : ''}
                          </span>
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
        </div>
      ) : null}
    </section>
  )
}

export function SuiteDetails({
  sel,
  data,
  ctx,
  onSelect,
  onClose,
}: {
  sel: SuiteSelection
  data: PlannerData
  ctx: SuiteContext
  onSelect: (sel: SuiteSelection) => void
  onClose: () => void
}) {
  const item = sel?.kind === 'item' ? (ctx.itemById.get(sel.id) ?? null) : null
  const task = sel?.kind === 'todo' ? (ctx.taskById.get(sel.id) ?? null) : null
  const plan = sel?.kind === 'plan' ? (ctx.planById.get(sel.id) ?? null) : null
  const ownerPlan = ctx.planById.get(item?.plan ?? task?.plan ?? '') ?? null
  const planFor = plan ?? ownerPlan

  const blockers = useMemo(() => {
    if (!item || !ctx.clashes.has(item.id)) return []
    return data.items.filter((b) => b.kind === 'unavailable' && overlapsUnavailable(item, b)).map((b) => b.title)
  }, [item, data.items, ctx.clashes])

  return (
    <div className="cal-details-in">
      <header className="cal-dhead-bar">
        <h2 className="cal-dtitle-bar">Details</h2>
        <IconButton label="Close details" variant="tinted" onClick={onClose}>
          <FqIcon name="close" size={16} />
        </IconButton>
      </header>
      <div className="cal-dbody">
        {item ? (
          <>
            <div className="cal-dkind">
              <KindPill kind={item.kind} />
              {item.option ? <span className="cal-muted">Option {item.option}</span> : null}
            </div>
            <h3 className="cal-dtitle" data-struck={item.kind === 'cancelled' || undefined}>
              {item.title}
            </h3>
            <p className="cal-dwhen">
              <FqIcon name="clock" size={16} />
              {whenLine(item)}
            </p>
            {blockers.length > 0 ? (
              <p className="cal-notice" role="note">
                Overlaps {blockers.join(', ')}. Move it, or move the unavailable time.
              </p>
            ) : null}
            <dl className="cal-dl">
              <Row label="Date">{item.end ? `${dayLabel(item.date)} to ${dayLabel(item.end)}` : dayLabel(item.date)}</Row>
              {item.startMin != null && !item.end ? <Row label="Starts">{clockLabel(item.startMin)}</Row> : null}
              {item.startMin != null && !item.end ? <Row label="Length">{lengthLabel(item.durMin)}</Row> : null}
              {item.location ? <Row label="Where">{item.location}</Row> : null}
              {item.series ? <Row label="Repeats">Part of a series</Row> : null}
              {item.going ? <Row label="Going">{item.going}</Row> : null}
              {item.note ? <Row label="Status">{item.note}</Row> : null}
            </dl>
            {item.notes ? <p className="cal-notes">{item.notes}</p> : null}
            {item.eventHref ? (
              <Link className="btn mu-soft" href={item.eventHref}>
                Go to event
              </Link>
            ) : null}
          </>
        ) : null}

        {task ? (
          <>
            <div className="cal-dkind">
              <KindPill kind="todo" />
              <span className="cal-muted">{task.done ? 'Done' : 'Open'}</span>
            </div>
            <h3 className="cal-dtitle" data-struck={task.done || undefined}>
              {task.title}
            </h3>
            <dl className="cal-dl">
              <Row label="Due">
                {task.due ? dayLabel(task.due) : 'No date yet'}
                {!task.done && task.due && task.due < ctx.today ? <span className="cal-flag">Overdue</span> : null}
              </Row>
              {task.phase ? <Row label="Phase">{`${task.phase}, ${offsetWords(task.dueOffsetDays)}`}</Row> : null}
              {task.owner && ctx.teamById.get(task.owner) ? <Row label="Owner">{ctx.teamById.get(task.owner)?.name}</Row> : null}
              {task.sharedFrom ? <Row label="From">{task.sharedFrom}</Row> : null}
            </dl>
            <a className="btn mu-soft" href="#calendar-todos">
              Open your to-dos
            </a>
          </>
        ) : null}

        {plan ? <PlanBody plan={plan} data={data} ctx={ctx} onSelect={onSelect} /> : null}

        {planFor ? <PlanCard plan={planFor} bare={!!plan} data={data} ctx={ctx} onSelect={onSelect} /> : null}

        {!item && !task && !plan ? <p className="cal-serif">Pick a date, a to-do or a Plan to see it here.</p> : null}
      </div>
    </div>
  )
}

function PlanBody({
  plan,
  data,
  ctx,
  onSelect,
}: {
  plan: SuitePlan
  data: PlannerData
  ctx: SuiteContext
  onSelect: (sel: SuiteSelection) => void
}) {
  const stats = planStats(plan, data, ctx.today)
  const kind = STAGE_KIND[plan.stage]
  return (
    <>
      <div className="cal-dkind">
        <span className="cal-pill" style={{ background: stats.health.bg, color: stats.health.fg }}>
          {stats.health.label}
        </span>
        <span className="cal-muted">Plan · {plan.targetLabel}</span>
      </div>
      <h3 className="cal-dtitle">{plan.title}</h3>
      <dl className="cal-dl">
        <Row label="Stage">
          <KindPill kind={kind}>{stageLabel(plan.stage)}</KindPill>
        </Row>
      </dl>
      <div className="cal-progress">
        <p className="cal-figure">
          {stats.todos.length ? `${stats.done} of ${stats.todos.length}` : 'No to-dos yet'}
          {stats.todos.length ? <span className="cal-muted"> to-dos done</span> : null}
        </p>
        {stats.todos.length ? <ProgressTrack value={stats.pct} label={`${stats.pct}% of to-dos done`} size="sm" /> : null}
      </div>
      <section aria-label="Dates">
        <p className="cal-caps">Dates</p>
        {stats.items.length === 0 ? (
          <p className="cal-serif">No date yet. Pencil one in from any day on the calendar.</p>
        ) : (
          <ul className="cal-plain">
            {stats.items.map((i) => (
              <li key={i.id}>
                <button type="button" className="cal-trow" onClick={() => onSelect({ kind: 'item', id: i.id })}>
                  <span className="cal-abar" style={{ background: KINDS[i.kind].dot }} aria-hidden />
                  <span className="cal-ttext">
                    <span className="cal-at">{dayLabel(i.date)}</span>
                    <span className="cal-as">
                      {i.startMin == null ? 'All day' : clockLabel(i.startMin)} · {KINDS[i.kind].word}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  )
}

