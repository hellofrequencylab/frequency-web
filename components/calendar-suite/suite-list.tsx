'use client'

import { useMemo, useState } from 'react'
import { ListChecks } from 'lucide-react'
import { FqIcon } from '@/components/frequency/icon'
import { EmptyState } from '@/components/ui/empty-state'
import { ProgressTrack } from '@/components/ui/progress-track'
import { buildBoard, listGroups } from '@/lib/calendar/planner/board'
import { firstDir, sortCards, type ListDir, type ListSort } from '@/lib/calendar/planner/list-sort'
import type { PlannerData } from '@/lib/calendar/planner/types'
import { HealthPill, PlanPeople, StagePill } from './suite-plan-bits'
import type { SuiteContext, SuiteSelection } from './suite-types'

// THE LIST (README 1.3): every Plan as a row, grouped under its stage. The columns are Plan, Stage,
// Next date, To-dos, Health and Team; Plan, Next date, To-dos and Health sort, and a sort orders the
// rows inside each group, because the group is the stage. Nothing here moves a Plan: restaging is the
// Kanban's drag, and the Details panel's stage control.

const SORTABLE: { sort: ListSort; label: string }[] = [
  { sort: 'plan', label: 'Plan' },
  { sort: 'next', label: 'Next date' },
  { sort: 'todos', label: 'To-dos' },
  { sort: 'health', label: 'Health' },
]

function SortHead({
  sort,
  label,
  active,
  dir,
  onSort,
}: {
  sort: ListSort
  label: string
  active: boolean
  dir: ListDir
  onSort: (sort: ListSort) => void
}) {
  return (
    <span role="columnheader" aria-sort={active ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'} className="cal-lh" data-col={sort}>
      <button type="button" className="cal-lsort" data-active={active || undefined} onClick={() => onSort(sort)}>
        {label}
        {active ? <FqIcon name="chevron" size={12} className={dir === 'asc' ? 'cal-sort-up' : 'cal-sort-down'} /> : null}
      </button>
    </span>
  )
}

export function SuiteList({
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
  const [by, setBy] = useState<{ sort: ListSort; dir: ListDir }>({ sort: 'next', dir: 'asc' })
  const groups = useMemo(
    () => listGroups(buildBoard(data, ctx.today, ctx.ownSpaceId)).map((g) => ({ ...g, cards: sortCards(g.cards, by.sort, by.dir) })),
    [data, ctx.today, ctx.ownSpaceId, by],
  )
  const press = (sort: ListSort) => setBy((b) => (b.sort === sort ? { sort, dir: b.dir === 'asc' ? 'desc' : 'asc' } : { sort, dir: firstDir(sort) }))

  if (groups.length === 0) {
    return (
      <div className="cal-list cal-list-empty">
        <EmptyState
          variant="first-use"
          icon={ListChecks}
          title="No Plans yet"
          description="Pencil in a date and its Plan is listed here, with its next date, its to-dos and how it is doing."
        />
      </div>
    )
  }

  return (
    <div className="cal-list" role="table" aria-label="All Plans">
      <div className="cal-lrow cal-lhead" role="row">
        <SortHead {...SORTABLE[0]} active={by.sort === 'plan'} dir={by.dir} onSort={press} />
        <span role="columnheader" className="cal-lh" data-col="stage">
          Stage
        </span>
        <SortHead {...SORTABLE[1]} active={by.sort === 'next'} dir={by.dir} onSort={press} />
        <SortHead {...SORTABLE[2]} active={by.sort === 'todos'} dir={by.dir} onSort={press} />
        <SortHead {...SORTABLE[3]} active={by.sort === 'health'} dir={by.dir} onSort={press} />
        <span role="columnheader" className="cal-lh" data-col="team">
          Team
        </span>
      </div>
      <div className="cal-lscroll">
        {groups.map((g) => (
          <section className="cal-lgroup" key={g.key} role="rowgroup" aria-label={`${g.label}, ${g.cards.length}`}>
            <header className="cal-lgroup-head">
              <span className="cal-dot" style={{ background: g.dot }} aria-hidden />
              <h3 className="cal-col-t">{g.label}</h3>
              <span className="cal-count">{g.cards.length}</span>
            </header>
            {g.cards.map((card) => {
              const selected = sel?.kind === 'plan' && sel.id === card.id
              return (
                <button
                  type="button"
                  key={card.id}
                  role="row"
                  className="cal-lrow cal-lbody"
                  data-selected={selected || undefined}
                  data-called={card.stage === 'cancelled' || undefined}
                  aria-selected={selected}
                  onClick={() => onSelect({ kind: 'plan', id: card.id })}
                >
                  <span role="cell" className="cal-lc cal-lc-plan" data-col="plan">
                    <span className="cal-at">{card.title}</span>
                    <span className="cal-as">
                      {card.target}
                      {card.hold ? ` · ${card.hold}` : ''}
                    </span>
                  </span>
                  <span role="cell" className="cal-lc" data-col="stage">
                    <StagePill stage={card.stage} label={g.label} />
                  </span>
                  <span role="cell" className="cal-lc cal-lc-when" data-col="next">
                    {card.when}
                  </span>
                  <span role="cell" className="cal-lc cal-lc-todos" data-col="todos">
                    <span className="cal-as">{card.tasks}</span>
                    {card.todoCount ? <ProgressTrack value={card.pct} label={`${card.pct}% of to-dos done`} size="sm" /> : null}
                  </span>
                  <span role="cell" className="cal-lc" data-col="health">
                    <HealthPill health={card.health} />
                  </span>
                  <span role="cell" className="cal-lc" data-col="team">
                    <PlanPeople team={card.team} partnerSpaceIds={card.partnerSpaceIds} ctx={ctx} />
                  </span>
                </button>
              )
            })}
          </section>
        ))}
      </div>
    </div>
  )
}
