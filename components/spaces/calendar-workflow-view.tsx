'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { EmptyState } from '@/components/ui/empty-state'
import { SectionHeader } from '@/components/ui/section-header'
import type { WorkflowColumn } from '@/lib/calendar/workflow-board'
import { PLAN_STAGE_TRANSITIONS, type WorkflowStage } from '@/lib/calendar/workflow-board'
import { transitionPlanStage } from '@/app/(main)/spaces/[slug]/settings/calendar/plan-actions'
import { Select } from '@/components/ui/select'

/** What choosing Cancelled on a card does, said before it happens. The drawer's Archive confirm is
 *  the model (plan-drawer.tsx): the Plan leaves Workflow and every date on it is marked Cancelled. */
export const CANCEL_PLAN_CONFIRM =
  'Mark this Plan Cancelled? Every date on it is marked Cancelled and the Plan leaves Workflow. To bring it back, open one of its dates and choose Bring it back.'

export function CalendarWorkflowView({
  columns,
  slug,
  canManage = false,
  onOpenPlan,
  onStageChanged,
}: {
  columns: WorkflowColumn[]
  slug?: string
  canManage?: boolean
  onOpenPlan?: (planId: string, entryId?: string | null) => void
  onStageChanged?: (planId: string, stage: WorkflowStage) => void
}) {
  const [, start] = useTransition()
  // PER-CARD PENDING (LIVE-467). One transition flag disabled every card's select while any one
  // moved, with nothing on the moving card to say so. The Plan being moved is the one that waits.
  const [pendingPlanId, setPendingPlanId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const total = columns.reduce((count, column) => count + column.cards.length, 0)
  if (!total) {
    return <EmptyState variant="first-use" title="Nothing in Workflow yet." description="Pencil a date to create a Plan and see it move through production." />
  }
  return (
    <div className="space-y-4" data-calendar-workflow-view>
      <SectionHeader title="Workflow" count={total} />
      {error && <p role="alert" className="text-body-sm text-danger">{error}</p>}
      <div className="grid gap-3 md:grid-cols-3">
        {columns.map((column) => (
          <section key={column.stage} aria-labelledby={`workflow-column-${column.stage}`} data-workflow-column={column.stage}>
            <SectionHeader id={`workflow-column-${column.stage}`} title={column.label} count={column.cards.length} />
            <ul className="mt-3 space-y-2">
              {column.cards.map((card) => {
                const moving = pendingPlanId === card.plan.id
                return (
                  <li key={card.key}>
                    <article className="rounded-card border border-border bg-surface-elevated p-3" data-workflow-card={card.plan.id}>
                      <h3 className="text-body-sm font-semibold text-text">{card.plan.title}</h3>
                      <p className="mt-1 text-meta text-muted">{card.primaryEvent?.whenLabel ?? 'No date attached'}</p>
                      <p className="mt-2 text-meta text-muted">{card.events.length} {card.events.length === 1 ? 'date' : 'dates'}</p>
                      {canManage && slug ? (
                        <div className="mt-3">
                          <Select
                            aria-label={`Move ${card.plan.title}`}
                            value={card.stage}
                            disabled={moving}
                            aria-busy={moving || undefined}
                            options={PLAN_STAGE_TRANSITIONS.map((transition) => ({ value: transition.stage, label: transition.label }))}
                            onChange={(event) => {
                              const stage = event.target.value as WorkflowStage
                              // Cancelled archives the Plan (lib/calendar/workflow-board.ts), so it asks
                              // first, as the drawer's Archive does. A declined ask leaves the card as it was.
                              if (stage === 'cancelled' && !window.confirm(CANCEL_PLAN_CONFIRM)) {
                                event.target.value = card.stage
                                return
                              }
                              setError(null)
                              setPendingPlanId(card.plan.id)
                              start(async () => {
                                try {
                                  const result = await transitionPlanStage(slug, card.plan.id, stage)
                                  if ('error' in result) setError(result.error)
                                  else onStageChanged?.(card.plan.id, stage)
                                } finally {
                                  setPendingPlanId((cur) => (cur === card.plan.id ? null : cur))
                                }
                              })
                            }}
                          />
                          {moving && <p className="mt-1 text-meta text-muted" role="status">Moving</p>}
                        </div>
                      ) : null}
                      {onOpenPlan ? <p className="mt-3"><button type="button" onClick={() => onOpenPlan(card.plan.id, card.primaryEvent?.entryId)} className="text-meta font-semibold text-primary-strong hover:underline">Open Plan</button></p> : null}
                      {card.primaryEvent?.editHref ? <p className="mt-3"><Link href={card.primaryEvent.editHref} className="text-meta font-semibold text-primary-strong hover:underline">Open event settings</Link></p> : null}
                    </article>
                  </li>
                )
              })}
            </ul>
          </section>
        ))}
      </div>
    </div>
  )
}
