'use client'

import { useEffect, useRef, useState } from 'react'
import { Tile, TileGrid } from '@/components/admin/dash'
import { StatusChip } from '@/components/admin/status'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Select } from '@/components/ui/select'
import { StatCard } from '@/components/ui/stat-card'
import type { CampaignLearningReview, CampaignLearningReviewResult } from '@/lib/email-studio/campaign-learning'

type Strategy = CampaignLearningReview['strategy']

/** Preview links stay on the reviewed Frequency host and the closed strategy's public destination. */
export function campaignLearningDestination(raw: string, strategy: Strategy): string | null {
  try {
    const url = new URL(raw, 'https://frequencylocal.com')
    const pathname = strategy === 'host_followup' ? '/create-a-space' : '/events'
    if (url.protocol !== 'https:' || !['frequencylocal.com', 'www.frequencylocal.com'].includes(url.hostname) || url.username || url.password || url.port || url.pathname !== pathname) return null
    return url.href
  } catch { return null }
}
export interface CampaignLearningPanelProps {
  targetCampaignId: string
  sourceCampaigns: ReadonlyArray<{ id: string; subject: string }>
  analyzeAction: (sourceId: string, targetId: string, strategy: Strategy) => Promise<CampaignLearningReviewResult>
  applyRevisionAction: (input: {
    sourceCampaignId: string
    targetCampaignId: string
    strategy: Strategy
    expectedFingerprint: string
    expectedProposalFingerprint: string
    reviewed: true
  }) => Promise<{ ok: boolean; error?: string; campaignId?: string }>
  onApplied?: () => void
}

/** Pure review controls. Only the injected guarded actions can write, and no send action is accepted. */
export function CampaignLearningPanel(props: CampaignLearningPanelProps) {
  return <CampaignLearningSession key={`${props.targetCampaignId}:${props.sourceCampaigns.map((c) => c.id).join(',')}`} {...props} />
}

function CampaignLearningSession({ targetCampaignId, sourceCampaigns, analyzeAction, applyRevisionAction, onApplied }: CampaignLearningPanelProps) {
  const sources = sourceCampaigns.filter((campaign) => campaign.id !== targetCampaignId)
  const [sourceId, setSourceId] = useState(sources[0]?.id ?? '')
  const [strategy, setStrategy] = useState<Strategy>('personal_preview')
  const [hostAudienceConfirmed, setHostAudienceConfirmed] = useState(false)
  const [review, setReview] = useState<CampaignLearningReview | null>(null)
  const [reviewed, setReviewed] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const [applying, setApplying] = useState(false)
  const [applied, setApplied] = useState(false)
  const [message, setMessage] = useState('')
  const request = useRef(0)
  useEffect(() => () => { request.current += 1 }, [])

  const audienceReady = strategy !== 'host_followup' || hostAudienceConfirmed
  const matchingReview = review?.sourceCampaignId === sourceId && review.targetCampaignId === targetCampaignId && review.strategy === strategy
  const approvedDestination = review ? campaignLearningDestination(review.proposal.destination, strategy) : null

  function clearReview() {
    request.current += 1
    setReview(null)
    setReviewed(false)
    setApplied(false)
    setAnalyzing(false)
    setMessage('')
  }

  async function analyze() {
    if (!sourceId || !audienceReady || applying) return
    const token = ++request.current
    setAnalyzing(true)
    setReview(null)
    setReviewed(false)
    setApplied(false)
    setMessage('')
    try {
      const result = await analyzeAction(sourceId, targetCampaignId, strategy)
      if (token !== request.current) return
      if (!result.ok) { setMessage(result.error); return }
      if (result.review.sourceCampaignId !== sourceId || result.review.targetCampaignId !== targetCampaignId || result.review.strategy !== strategy) {
        setMessage('The campaign selection changed. Analyze the selected campaigns again.')
        return
      }
      setReview(result.review)
      setMessage('Analysis prepared a reviewable revision. The draft is unchanged.')
    } catch {
      if (token === request.current) setMessage('The analysis could not be loaded. Your draft is unchanged.')
    } finally {
      if (token === request.current) setAnalyzing(false)
    }
  }

  async function apply() {
    if (!review || !reviewed || !matchingReview || !approvedDestination || !audienceReady || analyzing || applying || applied) return
    const token = ++request.current
    setApplying(true)
    setMessage('')
    try {
      const result = await applyRevisionAction({
        sourceCampaignId: review.sourceCampaignId, targetCampaignId: review.targetCampaignId,
        strategy: review.strategy, expectedFingerprint: review.expectedFingerprint,
        expectedProposalFingerprint: review.expectedProposalFingerprint, reviewed: true,
      })
      if (token !== request.current) return
      if (!result.ok) { setReviewed(false); setMessage(result.error ?? 'The revision could not be applied. Reload and review the draft again.'); return }
      setApplied(true)
      setReviewed(false)
      setMessage('Revision applied to the draft. Nothing was sent. Review the draft in Email Studio before choosing any send action.')
      try { onApplied?.() } catch { setMessage('Revision applied to the draft. Nothing was sent. Reload the editor before making more changes.') }
    } catch {
      if (token === request.current) setMessage('The apply result could not be confirmed. Reload the draft before trying again.')
    } finally {
      if (token === request.current) setApplying(false)
    }
  }

  return (
    <section aria-label="Learn from a campaign and revise a draft" className="space-y-4">
      <div>
        <h3 className="text-body font-semibold text-text">Learn from a campaign. Review the next draft.</h3>
        <p className="mt-1 text-body-sm text-muted">Use recorded email evidence to choose a clearer next invitation. Analysis prepares a revision for you to inspect; it never applies or sends it automatically.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-body-sm font-medium text-text">Source campaign
          <Select wrapperClassName="mt-1" value={sourceId} disabled={applying || sources.length === 0} onChange={(event) => { clearReview(); setSourceId(event.target.value) }}>
            {sources.length === 0 && <option value="">Choose a sent campaign</option>}
            {sources.map((campaign) => <option key={campaign.id} value={campaign.id}>{campaign.subject || '(No subject)'}</option>)}
          </Select>
        </label>
        <label className="text-body-sm font-medium text-text">Audience and next step
          <Select wrapperClassName="mt-1" value={strategy} disabled={applying} onChange={(event) => { clearReview(); setStrategy(event.target.value as Strategy); setHostAudienceConfirmed(false) }}>
            <option value="personal_preview">Participant warmup</option>
            <option value="host_followup">Host follow-up</option>
          </Select>
        </label>
      </div>
      <p className="text-meta text-muted">Participant warmup invites people to look around and find a gathering. Host follow-up belongs to a deliberately selected hosting audience. Opens and clicks cannot tell us which people want to host.</p>
      {strategy === 'host_followup' && <Checkbox checked={hostAudienceConfirmed} disabled={applying} onChange={(event) => { clearReview(); setHostAudienceConfirmed(event.target.checked) }} label="I selected an audience with known hosting interest." hint="The draft must already target an explicitly chosen host audience. An open or click is not evidence of hosting interest." />}
      <Button type="button" variant="secondary" loading={analyzing} disabled={!sourceId || !audienceReady || applying} onClick={() => void analyze()}>Analyze and prepare a revision</Button>
      <p role="status" className="text-body-sm text-muted">{message}</p>

      {review && matchingReview && <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <StatusChip tone={applied ? 'success' : 'info'}>{applied ? 'Draft updated' : 'Review required'}</StatusChip>
          <p className="text-meta text-muted">Evidence through <time dateTime={review.observedThrough}>{review.observedThrough}</time>. Email event observation only, not a conversion window.</p>
        </div>
        <TileGrid>
          <Tile label="1 · Evidence">
            <p className="text-body-sm text-text">{review.audienceNote}</p>
            <ul className="mt-3 list-disc space-y-2 pl-4 text-body-sm text-muted">{review.findings.map((finding, i) => <li key={`${i}:${finding}`}>{finding}</li>)}</ul>
          </Tile>
          <Tile label="2 · Proposed changes"><ul className="list-disc space-y-2 pl-4 text-body-sm text-muted">{review.proposal.changes.map((change, i) => <li key={`${i}:${change}`}>{change}</li>)}</ul></Tile>
          <Tile label="3 · Draft only"><p className="text-body-sm text-muted">Applying changes the selected draft and clears its schedule and approval. You still choose whether, when and to whom it sends.</p></Tile>
        </TileGrid>
        {review.metrics.length > 0 && <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{review.metrics.map((metric, i) => <StatCard key={`${i}:${metric.label}`} label={metric.label} value={metric.value !== null && Number.isFinite(metric.value) ? metric.value.toLocaleString() : 'Not measured'} />)}</div>}
        <div className="rounded-card border border-border bg-surface p-4">
          <h4 className="text-body-sm font-semibold text-text">What this evidence cannot tell us</h4>
          <ul className="mt-2 list-disc space-y-2 pl-4 text-meta text-muted">{review.limitations.map((limitation, i) => <li key={`${i}:${limitation}`}>{limitation}</li>)}</ul>
        </div>
        <div aria-label="Proposed email revision" className="space-y-3 rounded-card border border-border bg-surface p-4">
          <h4 className="text-body-sm font-semibold text-text">Review the revision before applying</h4>
          <dl className="space-y-2 text-body-sm">
            <div><dt className="text-muted">Draft being revised</dt><dd className="break-words text-text">{review.target.subject || '(No subject)'} · {review.target.status}</dd></div>
            <div><dt className="text-muted">From name</dt><dd className="break-words text-text">{review.proposal.fromName || 'Not specified'}</dd></div>
            <div><dt className="text-muted">Subject</dt><dd className="break-words font-semibold text-text">{review.proposal.subject}</dd></div>
            <div><dt className="text-muted">Preheader</dt><dd className="break-words text-text">{review.proposal.preheader || 'No preheader'}</dd></div>
            <div><dt className="text-muted">Destination</dt><dd className="break-words text-text">{approvedDestination ? <a href={approvedDestination} target="_blank" rel="noreferrer" className="underline">{strategy === 'host_followup' ? 'Preview creating a Space · /create-a-space' : 'Browse public events · /events'}</a> : 'The proposed destination is not approved. Analyze again before applying.'}</dd></div>
            <div><dt className="text-muted">Target audience</dt><dd className="break-words text-text">{review.target.segment || 'No target segment selected'}</dd></div>
          </dl>
          <div className="whitespace-pre-wrap break-words border-t border-border pt-3 text-body-sm text-text">{review.proposal.body}</div>
        </div>
        {review.target.scheduledFor && <p className="text-body-sm text-warning">This draft has a scheduled send. Applying the revision clears that schedule and requires a new review before sending.</p>}
        <Checkbox checked={reviewed} disabled={applying || applied || !approvedDestination} onChange={(event) => setReviewed(event.target.checked)} label="I reviewed the subject, message, destination and target audience." hint="Apply this revision to the draft only. Nothing will be sent or scheduled." />
        <Button type="button" loading={applying} disabled={!reviewed || !approvedDestination || !audienceReady || analyzing || applied} onClick={() => void apply()}>Apply reviewed revision to draft</Button>
      </div>}
    </section>
  )
}
