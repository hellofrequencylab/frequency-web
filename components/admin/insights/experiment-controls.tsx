'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { manageGrowthExperiment } from '@/app/(main)/admin/insights/experiment-actions'
import type { ExperimentKey, ExperimentResult, ExperimentCommand } from '@/lib/analytics/experiments'

export function ExperimentControls({ experimentKey, status }: { experimentKey: ExperimentKey; status: ExperimentResult['status'] | 'missing' }) {
  const [pending, start] = useTransition()
  const [message, setMessage] = useState('')
  const [reviewed, setReviewed] = useState(false)
  const router = useRouter()
  const run = (command: ExperimentCommand) => start(async () => {
    try {
      const result = await manageGrowthExperiment(experimentKey, command)
      setMessage(result.error || 'Experiment updated.')
      if (!result.error) router.refresh()
    } catch { setMessage('The experiment could not be updated. Check your access and try again.') }
  })
  return <div className="space-y-3">
    <div className="flex flex-wrap gap-2">
      {status === 'missing' && <Button size="sm" variant="secondary" loading={pending} onClick={() => run('draft')}>Save reviewed pilot draft</Button>}
      {(status === 'draft' || status === 'paused') && <Button size="sm" variant="secondary" loading={pending} onClick={() => run('start')}>{status === 'paused' ? 'Resume enrollment' : 'Start the fixed-horizon pilot'}</Button>}
      {status === 'running' && <Button size="sm" variant="secondary" loading={pending} onClick={() => run('pause')}>Pause new exposures</Button>}
    </div>
    {(status === 'running' || status === 'paused') && <div className="space-y-2">
      <Checkbox checked={reviewed} onChange={(e) => setReviewed(e.target.checked)} label="I reviewed accessibility, performance, RSVP failures, cancellations, consent withdrawals and follow-up coverage. Record this guardrail review and close enrollment." />
      <Button size="sm" variant="ghost" loading={pending} disabled={!reviewed} onClick={() => run('finish')}>Record review and finish enrollment</Button>
    </div>}
    <p role="status" className="text-meta text-muted">{message}</p>
  </div>
}
