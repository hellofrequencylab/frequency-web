'use client'

import { useMemo } from 'react'
import { GanttChart } from 'lucide-react'
import { EmptyState } from '@/components/ui/empty-state'
import { buildTimeline, type TimelineRow } from '@/lib/calendar/planner/timeline'
import { TODO_DOT } from '@/lib/calendar/planner/kinds'
import type { PlannerData } from '@/lib/calendar/planner/types'
import { HealthPill } from './suite-plan-bits'
import type { SuiteContext, SuiteSelection } from './suite-types'

// THE TIMELINE (README 1.3): nine weeks from last Monday, one lane per live Plan. A lane is a bar from
// the Plan's first date or due to-do to its last in the stage's colours, a block for each date on it,
// and a tick for each to-do, in the colour of its state. A bar that runs past either end of the nine
// weeks says so with an arrow instead of drawing a clamped day. Today is a line down every lane. The
// lane label stays put while the weeks scroll sideways on a narrow console.

function Lane({ row, selected, onSelect }: { row: TimelineRow; selected: boolean; onSelect: () => void }) {
  const marks = row.marks.filter((m) => !m.past)
  const dues = row.dues.filter((d) => !d.past)
  return (
    <div className="cal-tl-lane" role="row" data-selected={selected || undefined}>
      <button type="button" className="cal-tl-label" role="rowheader" aria-selected={selected} onClick={onSelect}>
        <span className="cal-at">{row.title}</span>
        <span className="cal-tl-meta">
          <span className="cal-as">{row.stage}</span>
          <HealthPill health={row.health} />
        </span>
      </button>
      <div className="cal-tl-track" role="cell">
        <span
          className="cal-tl-bar"
          data-before={row.bar.startsBefore || undefined}
          data-after={row.bar.endsAfter || undefined}
          style={{ left: `${row.bar.leftPct}%`, width: `${row.bar.widthPct}%`, background: row.bar.bg, border: row.bar.bd }}
          aria-hidden
        />
        {row.holdPct != null ? <span className="cal-tl-hold" style={{ left: `${row.holdPct}%` }} title="Hold lapses" aria-hidden /> : null}
        {marks.map((m) => (
          <span key={m.id} className="cal-tl-mark" style={{ left: `${m.leftPct}%`, width: `${m.widthPct}%`, background: m.color }} title={m.title} />
        ))}
        {dues.map((d) => (
          <span key={d.id} className="cal-tl-due" data-state={d.state} style={{ left: `${d.leftPct}%`, background: d.color }} title={d.title} />
        ))}
      </div>
    </div>
  )
}

export function SuiteTimeline({
  data,
  ctx,
  sel,
  onSelect,
}: {
  data: PlannerData
  ctx: SuiteContext
  sel: SuiteSelection
  onSelect: (ref: { kind: 'plan'; id: string }) => void
}) {
  const tl = useMemo(() => buildTimeline(data, ctx.today), [data, ctx.today])
  if (tl.rows.length === 0) {
    return (
      <div className="cal-tl cal-tl-empty">
        <EmptyState
          variant="first-use"
          icon={GanttChart}
          title="No Plans to line up"
          description="Pencil in a date and its Plan gets a lane here, with its dates and to-dos along the weeks."
        />
      </div>
    )
  }
  return (
    <div className="cal-tl">
      <div className="cal-tl-scroll">
        <div className="cal-tl-grid" role="table" aria-label="Next nine weeks">
          <div className="cal-tl-weeks" role="row">
            <span className="cal-tl-corner" role="columnheader" aria-label="Plan" />
            <div className="cal-tl-ruler" role="columnheader">
              {tl.weeks.map((w) => (
                <span key={w.label} className="cal-tl-week" style={{ left: `${w.leftPct}%` }}>
                  {w.label}
                </span>
              ))}
            </div>
          </div>
          <div className="cal-tl-body" style={{ ['--tl-today' as string]: String(tl.todayPct / 100) }}>
            <span className="cal-tl-todayline" aria-hidden />
            {tl.rows.map((row) => (
              <Lane key={row.id} row={row} selected={sel?.kind === 'plan' && sel.id === row.id} onSelect={() => onSelect({ kind: 'plan', id: row.id })} />
            ))}
          </div>
        </div>
      </div>
      <ul className="cal-tl-legend" aria-label="Key">
        <li>
          <span className="cal-tl-mark cal-tl-key" style={{ background: 'var(--cal-production)' }} aria-hidden />
          Dates on the Plan
        </li>
        <li>
          <span className="cal-tl-due cal-tl-key" style={{ background: TODO_DOT.upcoming }} aria-hidden />
          To-do due
        </li>
        <li>
          <span className="cal-tl-due cal-tl-key" style={{ background: TODO_DOT.overdue }} aria-hidden />
          Overdue
        </li>
        <li>
          <span className="cal-tl-today" aria-hidden />
          Today
        </li>
      </ul>
    </div>
  )
}
