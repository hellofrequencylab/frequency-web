'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/select'
import { isError } from '@/lib/action-result'
import { SPACE_PLANS, SPACE_PLAN_LABEL, asSpacePlan } from '@/lib/pricing/plans'
import { setSpacePlanAction } from '@/app/(main)/admin/spaces/[id]/plan-actions'

// The PLAN panel on /admin/spaces/[id] (ADR-1773): pick a plan, press Set plan. The server action is
// janitor-gated and audited; this component only collects intent and shows the result. The current plan
// is named in the button's confirm sentence so a wrong click reads as one before it lands. Token-only
// styling; no em dashes (CONTENT-VOICE).

const PLAN_OPTIONS = SPACE_PLANS.map((value) => ({ value, label: SPACE_PLAN_LABEL[value] }))

export function SpacePlanPanel({ spaceId, plan }: { spaceId: string; plan: string | null }) {
  const router = useRouter()
  const current = asSpacePlan(plan)
  const [next, setNext] = useState<string>(current)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  return (
    <div className="space-y-4">
      <p className="text-body-sm text-muted">
        This space is on <span className="font-semibold text-text">{SPACE_PLAN_LABEL[current]}</span>. Setting a plan here
        replaces its billing entitlements with that plan&apos;s, exactly as checkout would. It does not charge or refund
        anyone: record the money in Manual billing.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <Select aria-label="Plan" value={next} onChange={(e) => setNext(e.target.value)} options={PLAN_OPTIONS} disabled={pending} />
        <Button
          type="button"
          variant="primary"
          disabled={pending || next === current}
          onClick={() => {
            setError(null)
            start(async () => {
              const result = await setSpacePlanAction(spaceId, next, current)
              if (isError(result)) setError(result.error)
              else router.refresh()
            })
          }}
        >
          {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}
          {next === current ? 'Set plan' : `Set plan to ${SPACE_PLAN_LABEL[asSpacePlan(next)]}`}
        </Button>
      </div>
      {error && <p className="text-body-sm text-danger">{error}</p>}
    </div>
  )
}
