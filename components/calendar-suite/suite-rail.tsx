'use client'

import { useMemo, useState, type CSSProperties } from 'react'
import { FqIcon } from '@/components/frequency/icon'
import { CalendarSubscribeMenu } from '@/components/events/calendar-subscribe-menu'
import { Avatar } from '@/components/ui/avatar'
import { ProgressTrack } from '@/components/ui/progress-track'
import { planStats } from '@/lib/calendar/planner/board'
import { addDays, lastDay } from '@/lib/calendar/planner/days'
import { KINDS } from '@/lib/calendar/planner/kinds'
import { monthName, monthWeeks, shiftMonth } from '@/lib/calendar/planner/month'
import { SUITE_LAYERS, layerCounts } from '@/lib/calendar/planner/suite-model'
import { teamLoad } from '@/lib/calendar/planner/team-load'
import type { PlanStage, PlannerData, PlannerLayer } from '@/lib/calendar/planner/types'
import { SharedRollup } from './suite-cohost'
import type { SuiteContext, SuiteSelection, SuiteTeamMember } from './suite-types'
import type { SuiteDnd } from './use-suite-dnd'

// THE RAIL (README 1.1, layout 1a Sidebar): the Space, the one big call to action, a mini month, the
// six Show tiles with what each holds this month, the Plans, the team's load this week, and the inbox
// of to-dos with no date. It scrolls on its own. On a narrow console it is a sheet the header opens.

const LAYER_LOOK: Record<PlannerLayer, { style: CSSProperties; icon: string }> = {
  events: { style: { background: KINDS.event.bg, border: KINDS.event.bd }, icon: 'var(--presence)' },
  works: { style: { background: KINDS.planning.bg, border: KINDS.planning.bd }, icon: KINDS.planning.dot },
  shared: { style: { background: 'var(--surface-card)', border: '1.5px solid var(--presence)' }, icon: 'var(--presence)' },
  private: { style: { background: KINDS.private.bg, border: '1px solid var(--border-strong)' }, icon: 'var(--text-body)' },
  unavailable: { style: { background: KINDS.unavailable.bg, border: KINDS.unavailable.bd }, icon: 'var(--text-muted)' },
  todos: { style: { background: KINDS.todo.bg, border: KINDS.todo.bd }, icon: 'var(--reward)' },
}

const STAGE_KIND: Record<PlanStage, keyof typeof KINDS> = {
  pencil: 'pencil',
  planning: 'planning',
  production: 'production',
  event: 'event',
  cancelled: 'cancelled',
}

function MiniMonth({
  initialYm,
  cursor,
  today,
  busy,
  onPick,
}: {
  initialYm: string
  cursor: string
  today: string
  busy: ReadonlySet<string>
  onPick: (day: string) => void
}) {
  const [ym, setYm] = useState(initialYm)
  const weeks = useMemo(() => monthWeeks(ym), [ym])
  return (
    <section className="cal-mini" aria-label="Mini month">
      <div className="cal-mini-bar">
        <button type="button" className="cal-mini-nav" aria-label="Previous month" onClick={() => setYm((m) => shiftMonth(m, -1))}>
          <FqIcon name="chevron" size={14} className="cal-flip" />
        </button>
        <span className="cal-mini-title">
          {monthName(ym)} {ym.slice(0, 4)}
        </span>
        <button type="button" className="cal-mini-nav" aria-label="Next month" onClick={() => setYm((m) => shiftMonth(m, 1))}>
          <FqIcon name="chevron" size={14} />
        </button>
      </div>
      <div className="cal-mini-grid" role="grid">
        {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
          <span key={i} className="cal-mini-wd" aria-hidden>
            {d}
          </span>
        ))}
        {weeks.flat().map((day) => {
          const inMonth = day.slice(0, 7) === ym
          return (
            <button
              type="button"
              key={day}
              className="cal-mini-day"
              data-out={!inMonth || undefined}
              data-today={day === today || undefined}
              data-cursor={(day === cursor && day !== today) || undefined}
              data-past={day < today || undefined}
              aria-label={day}
              aria-current={day === today ? 'date' : undefined}
              onClick={() => onPick(day)}
            >
              {Number(day.slice(8, 10))}
              {busy.has(day) ? <i className="cal-mini-dot" aria-hidden /> : null}
            </button>
          )
        })}
      </div>
    </section>
  )
}

export function SuiteRail({
  brandName,
  data,
  ctx,
  team,
  hidden,
  activeYm,
  cursor,
  sel,
  feed,
  upcomingCount,
  dnd,
  onToggleLayer,
  onPickDay,
  onSelect,
  onPencil,
}: {
  brandName: string
  data: PlannerData
  ctx: SuiteContext
  team: readonly SuiteTeamMember[]
  hidden: Partial<Record<PlannerLayer, boolean>>
  activeYm: string
  cursor: string
  sel: SuiteSelection
  feed: { httpsUrl: string; webcalUrl: string }
  /** Upcoming gatherings (a series counts once), counted by the page. */
  upcomingCount: number
  dnd: SuiteDnd
  onToggleLayer: (layer: PlannerLayer) => void
  onPickDay: (day: string) => void
  onSelect: (sel: SuiteSelection) => void
  onPencil: () => void
}) {
  const counts = useMemo(() => layerCounts(data, activeYm, ctx.ownSpaceId), [data, activeYm, ctx.ownSpaceId])
  const busy = useMemo(() => {
    const out = new Set<string>()
    for (const it of data.items) {
      if (it.kind === 'cancelled') continue
      const last = lastDay(it)
      let day = it.date
      for (let n = 0; day <= last && n < 62; n++) {
        out.add(day)
        day = addDays(day, 1)
      }
    }
    return out
  }, [data.items])
  const load = useMemo(() => teamLoad(team, data.tasks, data.items, ctx.today), [team, data.tasks, data.items, ctx.today])
  const inbox = data.tasks.filter((t) => !t.done && !t.due)
  const plans = data.plans.filter((p) => p.stage !== 'cancelled')

  return (
    <div className="cal-rail-in">
      <div className="cal-chipspace">
        <span className="cal-orb" aria-hidden>
          {brandName.slice(0, 1).toUpperCase()}
        </span>
        <div className="cal-chipspace-text">
          <span className="cal-spacename">{brandName}</span>
          <span className="cal-serif">
            {upcomingCount > 0 ? `${upcomingCount} upcoming event${upcomingCount === 1 ? '' : 's'}` : 'What\u2019s happening'}
          </span>
        </div>
      </div>

      <button type="button" className="btn pa lg cal-pencil" onClick={onPencil}>
        <span className="cal-pencil-disc" aria-hidden>
          <FqIcon name="edit" size={18} />
        </span>
        <span className="cal-pencil-label">Pencil it in</span>
        <kbd className="cal-kbd">P</kbd>
      </button>

      {/* key: the mini month follows the month the calendar is in, and pages on its own between moves. */}
      <MiniMonth key={activeYm} initialYm={activeYm} cursor={cursor} today={ctx.today} busy={busy} onPick={onPickDay} />

      <section aria-label="Show layers">
        <h3 className="cal-caps cal-rail-h">Show</h3>
        <ul className="cal-plain cal-layers">
          {SUITE_LAYERS.map((layer) => {
            const off = !!hidden[layer.key]
            const look = LAYER_LOOK[layer.key]
            return (
              <li key={layer.key}>
                <button
                  type="button"
                  className="cal-layer"
                  aria-pressed={!off}
                  data-off={off || undefined}
                  onClick={() => onToggleLayer(layer.key)}
                >
                  <span className="cal-tile" style={off ? undefined : look.style}>
                    <span style={{ color: look.icon }}>
                      <FqIcon name={layer.icon} size={14} />
                    </span>
                  </span>
                  <span className="cal-layer-label">{layer.label}</span>
                  <span className="cal-count">{counts[layer.key]}</span>
                </button>
                {layer.key === 'shared' ? <SharedRollup data={data} ctx={ctx} ym={activeYm} hidden={off} /> : null}
              </li>
            )
          })}
        </ul>
      </section>

      <section aria-label="Plans">
        <h3 className="cal-caps cal-rail-h">Plans</h3>
        {plans.length === 0 ? (
          <p className="cal-serif">No Plans yet. Pencil one in to start.</p>
        ) : (
          <ul className="cal-plain cal-plans">
            {plans.map((plan) => {
              const stats = planStats(plan, data, ctx.today)
              return (
                <li key={plan.id}>
                  <button
                    type="button"
                    className="cal-plan"
                    data-selected={(sel?.kind === 'plan' && sel.id === plan.id) || undefined}
                    onClick={() => onSelect({ kind: 'plan', id: plan.id })}
                  >
                    <span className="cal-dot" style={{ background: KINDS[STAGE_KIND[plan.stage]].dot }} aria-hidden />
                    <span className="cal-plan-t">{plan.title}</span>
                    <span className="cal-count">
                      {stats.done}/{stats.todos.length}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <section aria-label="Team this week">
        <h3 className="cal-caps cal-rail-h">Team this week</h3>
        <div className="cal-pace" data-pace={load.pace}>
          <span className="cal-orb cal-orb-sm fq-breathe" aria-hidden />
          <div>
            <p className="cal-pace-t">{load.paceLabel}</p>
            <p className="cal-as">{load.note}</p>
          </div>
        </div>
        <ul className="cal-plain cal-people">
          {load.members.map((m) => {
            const person = team.find((t) => t.id === m.id)
            return (
              <li key={m.id} className="cal-person">
                <Avatar src={person?.avatarUrl ?? null} name={m.name} size="xs" />
                <div className="cal-person-body">
                  <div className="cal-person-top">
                    <span>{m.name}</span>
                    <span className="cal-as">{m.hoursLabel}</span>
                  </div>
                  <ProgressTrack value={m.pct} label={`${m.name} is ${m.pct}% booked`} size="sm" tone={m.hot ? 'danger' : 'primary'} />
                </div>
              </li>
            )
          })}
        </ul>
      </section>

      <section id="cal-inbox" aria-label="Inbox">
        <h3 className="cal-caps cal-rail-h">Inbox</h3>
        {inbox.length === 0 ? (
          <p className="cal-serif">Every to-do has a date.</p>
        ) : (
          <ul className="cal-plain cal-inbox">
            {inbox.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  className="cal-inchip"
                  data-selected={(sel?.kind === 'todo' && sel.id === t.id) || undefined}
                  onClick={() => onSelect({ kind: 'todo', id: t.id })}
                  {...dnd.dragProps('todo', t.id)}
                >
                  <FqIcon name="sun" size={14} />
                  <span className="cal-inchip-t">{t.title}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <footer className="cal-rail-foot">
        <span className="fq-logo-flow cal-logo" aria-hidden />
        <CalendarSubscribeMenu
          httpsUrl={feed.httpsUrl}
          webcalUrl={feed.webcalUrl}
          title={`${brandName} in your calendar`}
          description={`Subscribe once and ${brandName}'s events show up in Google or Apple Calendar, and stay current on their own.`}
          buttonClassName="btn sm"
        />
      </footer>
    </div>
  )
}
