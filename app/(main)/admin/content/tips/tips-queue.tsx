'use client'

// Vera's tip queue controls: the generate triggers (content tips + poster
// reviews) and the per-draft review cards. Tips are editable and sendable;
// flags are internal spam/quality notes (warning tones, never sent, only
// marked reviewed or dismissed). Janitor-gated at the action layer.

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Sparkles, Send, X, Eye, Flag, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/field'
import { StatusChip } from '@/components/admin/status'
import { isError } from '@/lib/action-result'
import type { ActionResult } from '@/lib/action-result'
import {
  generateTipsAction,
  generatePosterReviewsAction,
  approveAndSendTipAction,
  dismissTipAction,
  resolveFlagAction,
} from '../actions'
import { relativeTime } from '@/lib/utils'

function GenerateButton({
  label,
  busyLabel,
  emptyMessage,
  icon: Icon,
  action,
}: {
  label: string
  busyLabel: string
  emptyMessage: string
  icon: typeof Sparkles
  action: () => Promise<ActionResult<{ created: number; skipped: number }>>
}) {
  const [pending, start] = useTransition()
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState(false)
  const router = useRouter()

  function generate() {
    setMessage(null)
    start(async () => {
      const r = await action()
      if (isError(r)) {
        setMessage(r.error)
        setError(true)
      } else {
        setMessage(
          r.data.created === 0
            ? emptyMessage
            : `${r.data.created} new draft${r.data.created === 1 ? '' : 's'} to review.`,
        )
        setError(false)
        router.refresh()
      }
    })
  }

  return (
    <div className="flex items-center gap-2">
      {message && <span className={`text-xs ${error ? 'text-danger' : 'text-muted'}`}>{message}</span>}
      <Button size="sm" onClick={generate} disabled={pending}>
        <Icon className="h-3.5 w-3.5" /> {pending ? busyLabel : label}
      </Button>
    </div>
  )
}

export function GenerateTipsButton() {
  return (
    <GenerateButton
      label="Generate tips"
      busyLabel="Analyzing…"
      emptyMessage="No new tips. The top performers are already covered."
      icon={Sparkles}
      action={generateTipsAction}
    />
  )
}

export function GeneratePosterReviewsButton() {
  return (
    <GenerateButton
      label="Generate poster reviews"
      busyLabel="Reviewing…"
      emptyMessage="No posters need review right now."
      icon={Eye}
      action={generatePosterReviewsAction}
    />
  )
}

// The evidence keys worth showing as chips, with operator-readable labels.
const EVIDENCE_LABELS: Record<string, string> = {
  adopt_count: 'adopted',
  active_adoptions: 'active',
  forked_count: 'remixed',
  adopters: 'adopters',
  logs_30d: 'logs in 30d',
  logs_total: 'logs all time',
  posted: 'posted',
  engaged: 'engaged',
  claimed: 'claimed',
  removed: 'removed',
}

/** Chips for a draft's evidence: the labeled counts, plus the honesty band and
 *  engagement rate for poster reviews (content_type 'event'). */
function evidenceChips(evidence: Record<string, unknown>): string[] {
  const chips = Object.entries(EVIDENCE_LABELS)
    .filter(([key]) => typeof evidence[key] === 'number')
    .map(([key, label]) => `${evidence[key]} ${label}`)
  if (typeof evidence.band === 'string') chips.unshift(`band: ${evidence.band}`)
  if (typeof evidence.engagementRate === 'number') {
    chips.push(`${Math.round(evidence.engagementRate * 100)}% engagement`)
  }
  return chips
}

function EvidenceChips({ evidence }: { evidence: Record<string, unknown> }) {
  const chips = evidenceChips(evidence)
  if (chips.length === 0) return null
  return (
    <div className="mt-1.5 flex flex-wrap gap-1.5">
      {chips.map((c) => (
        <span key={c} className="rounded-md bg-surface-elevated px-1.5 py-0.5 text-xs tabular-nums text-muted">
          {c}
        </span>
      ))}
    </div>
  )
}

export function TipDraftCard({
  id,
  draftText,
  contentType,
  creatorName,
  evidence,
  createdAt,
}: {
  id: string
  draftText: string
  contentType: string
  creatorName: string
  evidence: Record<string, unknown>
  createdAt: string
}) {
  const [text, setText] = useState(draftText)
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  const title = typeof evidence.title === 'string' ? evidence.title : null
  const about = contentType === 'event' ? 'their posted events' : `a ${contentType}`

  function send() {
    setError(null)
    start(async () => {
      const r = await approveAndSendTipAction(id, text)
      if (isError(r)) setError(r.error)
      else router.refresh()
    })
  }

  function dismiss() {
    setError(null)
    start(async () => {
      const r = await dismissTipAction(id)
      if (isError(r)) setError(r.error)
      else router.refresh()
    })
  }

  return (
    <div className="rounded-2xl border border-border bg-surface p-4">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="text-sm font-semibold text-text">{creatorName}</span>
        <span className="text-xs text-subtle">
          {title ? `"${title}"` : about} · drafted {relativeTime(createdAt)}
        </span>
      </div>
      <EvidenceChips evidence={evidence} />
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        className="mt-3"
        aria-label="Tip text"
      />
      <div className="mt-2 flex items-center gap-2">
        {error && <span className="text-xs text-danger">{error}</span>}
        <div className="ml-auto flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={dismiss} disabled={pending}>
            <X className="h-3.5 w-3.5" /> Dismiss
          </Button>
          <Button size="sm" onClick={send} disabled={pending || !text.trim()}>
            <Send className="h-3.5 w-3.5" /> {pending ? 'Sending…' : 'Approve and send'}
          </Button>
        </div>
      </div>
    </div>
  )
}

/** An internal spam/quality flag from the poster observer. Never sent to the
 *  member: the only actions are Mark reviewed and Dismiss. */
export function FlagReviewCard({
  id,
  draftText,
  posterName,
  evidence,
  createdAt,
}: {
  id: string
  draftText: string
  posterName: string
  evidence: Record<string, unknown>
  createdAt: string
}) {
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  function review() {
    setError(null)
    start(async () => {
      const r = await resolveFlagAction(id)
      if (isError(r)) setError(r.error)
      else router.refresh()
    })
  }

  function dismiss() {
    setError(null)
    start(async () => {
      const r = await dismissTipAction(id)
      if (isError(r)) setError(r.error)
      else router.refresh()
    })
  }

  return (
    <div className="rounded-2xl border border-warning/30 bg-warning-bg/40 p-4">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <StatusChip tone="warning" size="sm">
          <Flag className="h-3 w-3" aria-hidden /> Spam flag
        </StatusChip>
        <span className="text-sm font-semibold text-text">{posterName}</span>
        <span className="text-xs text-subtle">posted events · flagged {relativeTime(createdAt)}</span>
      </div>
      <EvidenceChips evidence={evidence} />
      <p className="mt-3 text-sm text-text">{draftText}</p>
      <p className="mt-1.5 text-xs text-subtle">
        Internal only. The member never sees this, and the honesty band already scales their reward.
      </p>
      <div className="mt-2 flex items-center gap-2">
        {error && <span className="text-xs text-danger">{error}</span>}
        <div className="ml-auto flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={dismiss} disabled={pending}>
            <X className="h-3.5 w-3.5" /> Dismiss
          </Button>
          <Button size="sm" variant="secondary" onClick={review} disabled={pending}>
            <Check className="h-3.5 w-3.5" /> {pending ? 'Saving…' : 'Mark reviewed'}
          </Button>
        </div>
      </div>
    </div>
  )
}
