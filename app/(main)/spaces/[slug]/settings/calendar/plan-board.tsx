'use client'

import { Button } from '@/components/ui/button'
import { PLAN_STAGES, type SpacePlan } from '@/lib/calendar/plans'
import { planTargetDef } from '@/lib/calendar/plans'

const COLS = PLAN_STAGES.map((stage) => ({
  stage,
  label: stage === 'plan' ? 'Planning' : stage === 'pencil' ? 'Pencil' : 'Production',
}))

export function PlanBoard({
  spaceId,
  plans,
  pencilByPlan,
  onOpen,
}: {
  spaceId: string
  plans: SpacePlan[]
  /** The date each Plan opens its Production from (PROG-CAL3). Without it the href carried no
   *  `pencil=` and `productionPrefill` never ran: the Spark opened holding a title and nothing
   *  else, no date, no time, no location, no description. */
  pencilByPlan?: Record<string, string>
  onOpen: (plan: SpacePlan) => void
}) {
  return (
    <div className="grid gap-3 md:grid-cols-3">
      {COLS.map((col) => (
        <section key={col.stage} className="rounded-card border border-border bg-surface p-3">
          <h3 className="text-body-sm font-semibold text-text">{col.label}</h3>
          <ul className="mt-2 space-y-2">
            {plans
              .filter((p) => p.stage === col.stage)
              .map((plan) => {
                const href = planTargetDef(plan.targetKind).createHref?.({
                  spaceId,
                  planId: plan.id,
                  entryId: pencilByPlan?.[plan.id],
                })
                return (
                  <li key={plan.id} className="rounded-control border border-border px-3 py-2">
                    <button type="button" className="block w-full text-left text-body-sm font-medium text-text" onClick={() => onOpen(plan)}>
                      {plan.title}
                    </button>
                    {col.stage !== 'production' && href && (
                      <Button asChild size="sm" variant="ghost" className="mt-1">
                        <a href={href}>Make it a Production</a>
                      </Button>
                    )}
                  </li>
                )
              })}
          </ul>
        </section>
      ))}
    </div>
  )
}
