'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { EmptyState } from '@/components/ui/empty-state'
import { SectionHeader } from '@/components/ui/section-header'
import type { WorkflowColumn } from '@/lib/calendar/workflow-board'
import { PLAN_STAGE_TRANSITIONS, type WorkflowStage } from '@/lib/calendar/workflow-board'
import { transitionPlanStage } from '@/app/(main)/spaces/[slug]/settings/calendar/plan-actions'
import { Select } from '@/components/ui/select'
import { StatusChip } from '@/components/admin/status'
import { planStagePresentation } from '@/lib/calendar/plans'

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
  const rootRef = useRef<HTMLDivElement>(null)
  // FOCUS FOLLOWS THE CARD (LIVE-469). A stage change re-renders the card under another column (a
  // new <li>, a new <select>), or removes it when the stage is Cancelled, and the select that was
  // focused is gone with it. The Plan id waits here; once the transition has settled and the
  // columns have re-rendered, focus lands on that card's select again, or on the board when the
  // card left it. A ref rather than state: nothing here should re-render.
  const refocusPlanId = useRef<string | null>(null)
  useEffect(() => {
    const planId = refocusPlanId.current
    // LIVE-467 replaced the one board-wide `pending` flag with a per-card id, so the settle signal
    // is that card no longer being the moving one.
    if (!planId || pendingPlanId === planId) return
    refocusPlanId.current = null
    const root = rootRef.current
    if (!root) return
    const select = root.querySelector<HTMLSelectElement>(`[data-workflow-card="${planId}"] select`)
    ;(select ?? root).focus()
  }, [columns, pendingPlanId])
  const total = columns.reduce((count, column) => count + column.cards.length, 0)
  if (!total) {
    return <EmptyState variant="first-use" title="Nothing in Workflow yet." description="Pencil a date to create a Plan and see it move through production." />
  }
  return (
    <div ref={rootRef} tabIndex={-1} className="space-y-4 focus-visible:outline-none" data-calendar-workflow-view>
      <SectionHeader title="Workflow" count={total} />
      {error && <p role="alert" className="text-body-sm text-danger">{error}</p>}
      <div className="grid gap-3 md:grid-cols-3">
        {columns.map((column) => (
          <section key={column.stage} aria-labelledby={`workflow-column-${column.stage}`} data-workflow-column={column.stage}>
            <SectionHeader id={`workflow-column-${column.stage}`} title={column.label} count={column.cards.length} />
            <ul className="mt-3 space-y-2">
              {column.cards.map((card) => {
                const moving = pendingPlanId === card.plan.id
                // COLOUR PLUS THE WORD (LIVE-470). A Workflow card carried no stage styling at all,
                // so the only thing saying where a Plan stood was the column it happened to sit in.
                // The pill is the registry's, the same one the List and the popup show.
                const look = planStagePresentation(card.stage)
                return (
                  <li key={card.key}>
                    <article className="rounded-card border border-border bg-surface-elevated p-3" data-workflow-card={card.plan.id}>
                      <span className="mb-1.5 block" data-workflow-card-stage={look.key}>
                        <StatusChip tone={look.tone} size="sm">
                          {look.word}
                        </StatusChip>
                      </span>
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
                              // Focus comes back to this card once the columns settle (LIVE-469).
                              refocusPlanId.current = card.plan.id
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
