'use client'

// Beta email campaigns — the Draft → Preview → Test → Ready → Approve → Sent
// lifecycle (Wave 2). Each campaign is a `campaigns` row filed under a Beta phase,
// riding the SAME approval spine as the Today queue. The client drives the transitions
// through the email-actions server actions; every one re-gates server-side. THE SEND
// button calls sendBetaCampaign, which refuses unless the row is approved|scheduled.

import { useState, useTransition } from 'react'
import { Megaphone, Sparkles, FlaskConical, Send, Clock, Users, Eye } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { StatusChip, Banner, type StatusTone } from '@/components/admin/status'
import { isError } from '@/lib/action-result'
import type { ApprovalStatus } from '@/lib/beta/approvals'
import {
  composeBetaCampaign,
  editBetaCampaign,
  previewBetaSegmentAction,
  markBetaCampaignReady,
  approveBetaCampaign,
  pauseBetaCampaign,
  sendBetaCampaign,
  testSendBetaCampaign,
} from '@/app/(main)/admin/beta/email-actions'

export interface CampaignCardData {
  id: string
  subject: string
  body: string
  segment: string
  approvalStatus: ApprovalStatus
  phaseTitle: string
  recipientCount: number
  testSentAt: string | null
  scheduledFor: string | null
  sentAt: string | null
  /** Post-send stats (window opens/clicks), or null before send. */
  stats: { opens: number; clicks: number } | null
}

export interface PhaseOption {
  id: string
  label: string
}
export interface SegmentOption {
  key: string
  label: string
}

const STATUS_TONE: Record<ApprovalStatus, StatusTone> = {
  draft: 'neutral',
  ready: 'warning',
  approved: 'info',
  scheduled: 'info',
  sending: 'info',
  sent: 'success',
  paused: 'warning',
  cancelled: 'danger',
}

const field =
  'w-full rounded-md border border-border bg-canvas px-2.5 py-1.5 text-sm text-text placeholder:text-subtle'

export function CampaignsPanel({
  campaigns,
  phases,
  segments,
}: {
  campaigns: CampaignCardData[]
  phases: PhaseOption[]
  segments: SegmentOption[]
}) {
  const [composing, setComposing] = useState(false)
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setComposing((v) => !v)}>
          <Megaphone className="h-3.5 w-3.5" /> {composing ? 'Close' : 'New campaign'}
        </Button>
      </div>

      {composing && (
        <Composer
          phases={phases}
          segments={segments}
          onDone={() => setComposing(false)}
        />
      )}

      {campaigns.length === 0 ? (
        <EmptyState
          variant="first-use"
          title="No beta campaigns yet"
          description="Load the starter templates below, or compose one. Everything starts as a draft and sends only after you approve it."
        />
      ) : (
        <ul className="space-y-3">
          {campaigns.map((c) => (
            <li key={c.id}>
              <CampaignCard campaign={c} segments={segments} />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function Composer({
  phases,
  segments,
  onDone,
}: {
  phases: PhaseOption[]
  segments: SegmentOption[]
  onDone: () => void
}) {
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [segment, setSegment] = useState(segments[0]?.key ?? 'members')
  const [phaseId, setPhaseId] = useState(phases[0]?.id ?? '')
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  function submit() {
    setError(null)
    start(async () => {
      const r = await composeBetaCampaign({ subject, body, segment, phaseId })
      if (isError(r)) {
        setError(r.error)
        return
      }
      onDone()
    })
  }

  return (
    <div className="space-y-3 rounded-2xl border border-border bg-surface p-4 shadow-sm">
      <h3 className="text-sm font-bold text-text">New beta campaign</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1">
          <span className="text-xs font-medium text-subtle">Phase</span>
          <select value={phaseId} onChange={(e) => setPhaseId(e.target.value)} className={field}>
            {phases.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1">
          <span className="text-xs font-medium text-subtle">Audience</span>
          <select value={segment} onChange={(e) => setSegment(e.target.value)} className={field}>
            {segments.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <input
        value={subject}
        onChange={(e) => setSubject(e.target.value)}
        placeholder="Subject"
        className={field}
      />
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={8}
        placeholder="Write the email. Plain and warm. No em dashes."
        className={`${field} resize-y`}
      />
      {error && (
        <Banner tone="critical" title="Could not save">
          {error}
        </Banner>
      )}
      <div className="flex items-center gap-2">
        <Button size="sm" disabled={pending} onClick={submit}>
          {pending ? 'Saving…' : 'Save draft'}
        </Button>
        <Button size="sm" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </div>
  )
}

function CampaignCard({
  campaign: c,
  segments,
}: {
  campaign: CampaignCardData
  segments: SegmentOption[]
}) {
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [count, setCount] = useState<number | null>(null)
  const [editing, setEditing] = useState(false)
  const [subject, setSubject] = useState(c.subject)
  const [body, setBody] = useState(c.body)
  const [segment, setSegment] = useState(c.segment)
  const [schedule, setSchedule] = useState('')

  const isDraft = c.approvalStatus === 'draft'
  const isReady = c.approvalStatus === 'ready'
  const isApproved = c.approvalStatus === 'approved' || c.approvalStatus === 'scheduled'
  const isSent = c.approvalStatus === 'sent'
  const editable = isDraft || isReady

  function run(fn: () => Promise<{ error: string } | { data: unknown }>, ok?: (data: unknown) => void) {
    setError(null)
    setNote(null)
    start(async () => {
      const r = await fn()
      if (isError(r)) {
        setError(r.error)
        return
      }
      ok?.(r.data)
    })
  }

  return (
    <div className="space-y-3 rounded-2xl border border-border bg-surface p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <StatusChip tone={STATUS_TONE[c.approvalStatus]} size="sm">
              {c.approvalStatus}
            </StatusChip>
            <p className="truncate text-sm font-bold text-text">{c.subject}</p>
          </div>
          <p className="mt-0.5 text-xs text-muted">
            {c.phaseTitle} · {c.segment}
            {c.testSentAt && ' · tested'}
            {c.scheduledFor && ` · scheduled ${new Date(c.scheduledFor).toLocaleString()}`}
          </p>
        </div>
      </div>

      {editing ? (
        <div className="space-y-2">
          <input value={subject} onChange={(e) => setSubject(e.target.value)} className={field} />
          <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={8} className={`${field} resize-y`} />
          <select value={segment} onChange={(e) => setSegment(e.target.value)} className={field}>
            {segments.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              disabled={pending}
              onClick={() =>
                run(
                  () => editBetaCampaign(c.id, { subject, body, segment }),
                  () => setEditing(false),
                )
              }
            >
              Save
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <p className="whitespace-pre-wrap rounded-xl bg-canvas/50 p-3 text-xs text-muted line-clamp-6">{c.body}</p>
      )}

      {error && (
        <Banner tone="critical" title="That did not go through">
          {error}
        </Banner>
      )}
      {note && (
        <Banner tone="info" title={note} />
      )}

      {isSent ? (
        <div className="flex flex-wrap items-center gap-3 rounded-xl bg-success-bg/40 px-3 py-2 text-xs text-text">
          <span className="inline-flex items-center gap-1 font-semibold">
            <Users className="h-3.5 w-3.5" /> {c.recipientCount.toLocaleString()} sent
          </span>
          {c.stats && (
            <>
              <span className="inline-flex items-center gap-1">
                <Eye className="h-3.5 w-3.5" /> {c.stats.opens.toLocaleString()} opens
              </span>
              <span className="inline-flex items-center gap-1">
                <Send className="h-3.5 w-3.5" /> {c.stats.clicks.toLocaleString()} clicks
              </span>
            </>
          )}
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          {editable && (
            <>
              <Button size="sm" variant="secondary" onClick={() => setEditing((v) => !v)}>
                Edit
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={pending}
                onClick={() =>
                  run(
                    () => previewBetaSegmentAction(c.segment),
                    (d) => setCount((d as { count: number }).count),
                  )
                }
              >
                <Users className="h-3.5 w-3.5" /> Recipients
                {count != null && `: ${count.toLocaleString()}`}
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={pending}
                onClick={() =>
                  run(
                    () => testSendBetaCampaign(c.id),
                    (d) => setNote(`Test sent to ${(d as { to: string }).to}.`),
                  )
                }
              >
                <FlaskConical className="h-3.5 w-3.5" /> Test to me
              </Button>
            </>
          )}
          {isDraft && (
            <Button size="sm" disabled={pending} onClick={() => run(() => markBetaCampaignReady(c.id))}>
              <Sparkles className="h-3.5 w-3.5" /> Mark ready
            </Button>
          )}
          {isReady && (
            <>
              <input
                type="datetime-local"
                value={schedule}
                onChange={(e) => setSchedule(e.target.value)}
                className="rounded-md border border-border bg-canvas px-2 py-1 text-xs text-text"
                aria-label="Schedule time (optional)"
              />
              <Button
                size="sm"
                disabled={pending}
                onClick={() =>
                  run(() => approveBetaCampaign(c.id, schedule ? new Date(schedule).toISOString() : undefined))
                }
              >
                <Clock className="h-3.5 w-3.5" /> {schedule ? 'Approve + schedule' : 'Approve'}
              </Button>
            </>
          )}
          {isApproved && (
            <>
              <Button
                size="sm"
                disabled={pending}
                onClick={() =>
                  run(
                    () => sendBetaCampaign(c.id),
                    (d) => setNote(`Sent to ${(d as { recipientCount: number }).recipientCount.toLocaleString()} recipients.`),
                  )
                }
              >
                <Send className="h-3.5 w-3.5" /> Send now
              </Button>
              <Button size="sm" variant="warningOutline" disabled={pending} onClick={() => run(() => pauseBetaCampaign(c.id))}>
                Pause
              </Button>
            </>
          )}
          {(c.approvalStatus === 'paused') && (
            <Button size="sm" disabled={pending} onClick={() => run(() => markBetaCampaignReady(c.id))}>
              Back to ready
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
