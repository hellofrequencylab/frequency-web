'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/select'
import type { DiscoveryGoal } from '@/lib/ai/discovery-coach'
import { RowCard } from '@/components/cards/row-card'
import { isError } from '@/lib/action-result'
import type { SpaceDiscoveryConsent } from '@/lib/spaces/discovery-consent'
import { discoveryConsentActive } from '@/lib/spaces/discovery-consent'
import type { DiscoveryObservationServiceResult } from '@/lib/ai/discovery-observation-service'
import { reviewSpaceDiscovery, setSpaceDiscoveryConsent } from '@/app/(main)/spaces/[slug]/settings/coach/discovery-actions'

export function DiscoveryCoachingPanel({ spaceId, initial, available }: { spaceId: string; initial: SpaceDiscoveryConsent | null; available: boolean }) {
  const [consent, setConsent] = useState(initial)
  const [result, setResult] = useState<DiscoveryObservationServiceResult | null>(null)
  const [goal, setGoal] = useState<DiscoveryGoal>('attendance')
  const [notice, setNotice] = useState('')
  const [pending, startTransition] = useTransition()
  const active = discoveryConsentActive(consent)
  function permission(enabled: boolean) {
    setResult(null)
    setNotice('')
    startTransition(async () => {
      try {
        const saved = await setSpaceDiscoveryConsent(spaceId, enabled)
        if (isError(saved)) { setNotice(saved.error); return }
        setConsent(saved.data)
        setNotice(enabled ? 'Aggregate discovery coaching enabled for ninety days.' : 'Permission revoked. Future reviews are blocked.')
      } catch { setNotice('Permission could not be changed. Try again.') }
    })
  }
  function review() {
    setResult(null)
    startTransition(async () => {
      try { setResult(await reviewSpaceDiscovery(spaceId, goal)) }
      catch { setNotice('The review is unavailable. Missing measurements are not zero.') }
    })
  }
  return <RowCard title="Discovery coaching" meta={<div className="space-y-3">
    <p>Review this Space’s recorded profile-view buckets and primary-button events. These are aggregate signals, not unique visitors, search traffic or proof of conversions. You write the content.</p>
    <p>Allow a review only when you request it. Permission expires after ninety days and any Space editor can revoke it. No private messages, individual browsing histories, email sending or automatic publishing are included.</p>
    <p>This recorded-signal review does not include search-provider data or measure rankings or AI citations. Search connections below require separate provider authorization and verified property access.</p>
    <label className="block">Outcome for this review
      <Select value={goal} disabled={pending} onChange={event => { setGoal(event.target.value as DiscoveryGoal); setResult(null) }}>
        <option value="attendance">Attendance</option><option value="return_visits">Return visits</option><option value="bookings">Completed bookings</option><option value="enquiries">Useful enquiries</option>
      </Select>
    </label>
    {!available && <p role="status">Private permission storage is unavailable. Reviews are disabled until setup is complete.</p>}
    {active && <p>Permission expires {consent!.expiresAt.slice(0, 10)}.</p>}
    {result?.status === 'unavailable' && <p role="status">Review unavailable: {result.reason.replaceAll('_', ' ')}. No performance conclusion was drawn.</p>}
    {result?.status === 'completed' && <>
      <p>Review status: {result.coaching.status}. No outcome attribution or causal effect is established.</p>
      {result.coaching.recommendations.map(task => <div key={task.id} className="space-y-2">
        <h4 className="font-semibold">{task.title}</h4>
        <p>{task.basis} · {task.provenance}</p>
        <p>{task.evidence.value} {task.evidence.metric.replaceAll('_', ' ')} · {task.evidence.countingUnit ?? 'unknown counting unit'}</p>
        <p>Source: <a className="underline" href={task.evidence.sourceUrl}>{task.evidence.sourceUrl}</a></p>
        <p>Observed {task.evidence.period.from.slice(0, 10)} to {task.evidence.period.to.slice(0, 10)} · {task.evidence.freshness} · coverage {task.evidence.coverage}</p>
        <ul>{task.questions.map(question => <li key={question}>{question}</li>)}</ul>
        <p>Next step: {task.action.label}</p>
        <p>Measure: {task.measurement.primaryOutcome}. {task.measurement.comparison}</p>
        <p>{task.measurement.caution}</p>
        <ul>{task.limitations.map(limit => <li key={limit}>{limit.replaceAll('_', ' ')}</li>)}</ul>
      </div>)}
      <ul>{[...result.observationLimits, ...result.coaching.missingEvidence].map((limit, i) => <li key={`${i}-${limit}`}>{limit}</li>)}</ul>
      {!result.coaching.recommendations.length && <ul>{result.coaching.setupGuidance.questions.map(question => <li key={question}>{question}</li>)}</ul>}
    </>}
  </div>} footer={<div className="space-y-3">
    <div className="flex flex-wrap gap-3">
      <Button type="button" disabled={!available || pending} onClick={() => permission(!active)}>{active ? 'Revoke permission' : 'Allow aggregate discovery coaching'}</Button>
      <Button type="button" variant="secondary" disabled={!available || !active || pending} onClick={review}>{pending ? 'Working…' : 'Review recorded signals'}</Button>
    </div>
    <p role="status" aria-live="polite">{notice}</p>
  </div>} />
}
