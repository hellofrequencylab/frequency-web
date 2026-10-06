'use client'

import { useOptimistic, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Checkbox } from '@/components/ui/checkbox'
import { markTrainingStep } from './actions'

// One step's done mark on /training (LIVE-690). Optimistic, then the server's answer wins.
export function StepToggle({ stepId, label, done }: { stepId: string; label: string; done: boolean }) {
  const [pending, start] = useTransition()
  const [shown, setShown] = useOptimistic(done)
  const router = useRouter()
  return (
    <Checkbox
      checked={shown}
      aria-label={shown ? `Mark “${label}” not done` : `Mark “${label}” done`}
      disabled={pending}
      onChange={() =>
        start(async () => {
          setShown(!shown)
          const r = await markTrainingStep(stepId, !shown)
          if (r.ok) router.refresh()
        })
      }
    />
  )
}
