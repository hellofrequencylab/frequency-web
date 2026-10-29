'use client'

import { useMemo } from 'react'
import { LayoutGrid } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { ProgressTrack } from '@/components/ui/progress-track'
import { buildBoard } from '@/lib/calendar/planner/board'
import type { PlannerData } from '@/lib/calendar/planner/types'
import { HealthPill, PlanPeople } from './suite-plan-bits'
import type { SuiteContext, SuiteSelection } from './suite-types'
import type { SuiteDnd } from './use-suite-dnd'

// THE KANBAN (README 1.3): five columns, one per stage, each holding the Plans in it as cards. A card
// is the Plan's title, its health, its next date, its to-do progress, its hold, and the people and
// Spaces on it. Drag a card to another column to restage it, or hold Shift and press Left or Right.
// Cancelled keeps its own column: the card stays there, struck through, with Undo. Published is where
// Go live puts a Plan, so a card is not dragged into it, and a live Plan stays in Production until
// the event is done (lib/calendar/planner/stage-drop.ts holds those rules).

export function SuiteBoard({
  data,
  ctx,
  sel,
  dnd,
  onSelect,
  onRestore,
}: {
  data: PlannerData
  ctx: SuiteContext
  sel: SuiteSelection
  dnd: SuiteDnd
  onSelect: (ref: { kind: 'plan'; id: string }) => void
  /** Puts a cancelled Plan back where it was. */
  onRestore: (planId: string) => void
}) {
  const columns = useMemo(() => buildBoard(data, ctx.today, ctx.ownSpaceId), [data, ctx.today, ctx.ownSpaceId])
  if (columns.every((c) => c.cards.length === 0)) {
    return (
      <div className="cal-board cal-board-empty">
        <EmptyState
          variant="first-use"
          icon={LayoutGrid}
          title="No Plans yet"
          description="Pencil in a date and its Plan lands here, then moves across as it comes together."
        />
      </div>
    )
  }
  return (
    <div className="cal-board" role="group" aria-label="Plans by stage">
      {columns.map((col) => (
        <section
          className="cal-col"
          key={col.key}
          data-stage={col.key}
          aria-label={`${col.label}, ${col.cards.length}`}
          {...dnd.targetProps(() => ({ zone: 'stage', stage: col.key }))}
        >
          <header className="cal-col-head">
            <span className="cal-dot" style={{ background: col.dot }} aria-hidden />
            <h3 className="cal-col-t">{col.label}</h3>
            <span className="cal-count">{col.cards.length}</span>
          </header>
          <p className="cal-col-hint">{col.hint}</p>
          <div className="cal-col-cards">
            {col.cards.length === 0 ? <p className="cal-col-empty">Nothing here</p> : null}
            {col.cards.map((card) => {
              const selected = sel?.kind === 'plan' && sel.id === card.id
              const cancelled = card.stage === 'cancelled'
              return (
                <article
                  className="cal-pcard-k"
                  key={card.id}
                  data-selected={selected || undefined}
                  data-called={cancelled || undefined}
                  {...dnd.dragProps('plan', card.id)}
                >
                  <button type="button" className="cal-pk-main" aria-pressed={selected} onClick={() => onSelect({ kind: 'plan', id: card.id })}>
                    <span className="cal-pk-top">
                      <span className="cal-pk-t">{card.title}</span>
                      <span className="cal-pk-target">{card.target}</span>
                    </span>
                    <span className="cal-pk-row">
                      <HealthPill health={card.health} />
                      {card.invitePending ? <span className="cal-chip-flag">Invite</span> : null}
                    </span>
                    <span className="cal-pk-when">{card.when}</span>
                    <span className="cal-pk-tasks">
                      <span>{card.tasks}</span>
                      {card.todoCount ? <ProgressTrack value={card.pct} label={`${card.pct}% of to-dos done`} size="sm" /> : null}
                    </span>
                    {card.hold ? <span className="cal-pk-hold">{card.hold}</span> : null}
                  </button>
                  <div className="cal-pk-foot">
                    <PlanPeople team={card.team} partnerSpaceIds={card.partnerSpaceIds} ctx={ctx} />
                    {cancelled && dnd.enabled ? (
                      <Button type="button" variant="secondary" size="sm" onClick={() => onRestore(card.id)}>
                        Undo
                      </Button>
                    ) : null}
                  </div>
                </article>
              )
            })}
          </div>
        </section>
      ))}
    </div>
  )
}
