'use client'

// Vera's tip queue controls: the generate trigger and the per-draft review card
// (editable text, evidence chips, approve-and-send / dismiss). Janitor-gated at
// the action layer.

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Sparkles, Send, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/field'
import { isError } from '@/lib/action-result'
import { generateTipsAction, approveAndSendTipAction, dismissTipAction } from '../actions'
import { relativeTime } from '@/lib/utils'

export function GenerateTipsButton() {
  const [pending, start] = useTransition()
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState(false)
  const router = useRouter()

  function generate() {
    setMessage(null)
    start(async () => {
      const r = await generateTipsAction()
      if (isError(r)) {
        setMessage(r.error)
        setError(true)
      } else {
        setMessage(
          r.data.created === 0
            ? 'No new tips. The top performers are already covered.'
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
        <Sparkles className="h-3.5 w-3.5" /> {pending ? 'Analyzing…' : 'Generate tips'}
      </Button>
    </div>
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
  const chips = Object.entries(EVIDENCE_LABELS)
    .filter(([key]) => typeof evidence[key] === 'number')
    .map(([key, label]) => `${evidence[key]} ${label}`)

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
          {title ? `"${title}"` : `a ${contentType}`} · drafted {relativeTime(createdAt)}
        </span>
      </div>
      {chips.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {chips.map((c) => (
            <span key={c} className="rounded-md bg-surface-elevated px-1.5 py-0.5 text-xs tabular-nums text-muted">
              {c}
            </span>
          ))}
        </div>
      )}
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
