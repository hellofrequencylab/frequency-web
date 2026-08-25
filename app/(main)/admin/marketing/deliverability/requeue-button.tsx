'use client'

import { useState, useTransition } from 'react'
import { RefreshCw, Check, AlertCircle, Trash2, Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  requeueDeadLetters,
  discardDeadLetters,
  drainQueueNow,
  type RequeueResult,
  type DiscardResult,
  type DrainResult,
} from './actions'

// Revive dead-lettered jobs (all, or one kind). The action re-gates server-side; this
// just confirms, calls it, and reports how many were put back on the queue.
//
// The two PRIMARY buttons in this file use <Button size="sm"> (HYG-022). The DISCARD button
// below is still hand-rolled on purpose: it is a secondary/outline control, and no bucket row
// tracks that pair, so converting it here would be a change nothing measures and nothing asked
// for. It comes with whatever pass claims it.
export function RequeueButton({ kind, label }: { kind?: string; label: string }) {
  const [result, setResult] = useState<RequeueResult | null>(null)
  const [pending, start] = useTransition()

  return (
    <span className="inline-flex items-center gap-2">
      <Button
        size="sm"
        disabled={pending}
        onClick={() => {
          const scope = kind ? `all "${kind}" jobs` : 'every dead-lettered job'
          if (!confirm(`Requeue ${scope}? They will retry on the next drain.`)) return
          start(async () => setResult(await requeueDeadLetters(kind)))
        }}
      >
        <RefreshCw className={`h-3.5 w-3.5 ${pending ? 'animate-spin' : ''}`} />
        {pending ? 'Requeuing…' : label}
      </Button>
      {result?.ok && (
        <span className="inline-flex items-center gap-1 text-meta text-success font-medium">
          <Check className="h-3.5 w-3.5" /> Requeued {result.revived}
        </span>
      )}
      {result && !result.ok && (
        <span className="inline-flex items-center gap-1 text-meta text-danger">
          <AlertCircle className="h-3.5 w-3.5" /> {result.error}
        </span>
      )}
    </span>
  )
}

// Discard dead-lettered jobs that will never succeed on retry (a poison payload). The action re-gates
// server-side; this confirms, calls it, and reports how many were moved out of the recovery queue. Sits
// beside Requeue so an operator can clear a stuck job instead of requeuing it into an endless fail loop.
export function DiscardButton({ kind, label }: { kind?: string; label: string }) {
  const [result, setResult] = useState<DiscardResult | null>(null)
  const [pending, start] = useTransition()

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          const scope = kind ? `all "${kind}" dead-lettered jobs` : 'every dead-lettered job'
          if (!confirm(`Discard ${scope}? This is terminal: they will not retry. Use Requeue instead if the failure was a temporary outage.`)) return
          start(async () => setResult(await discardDeadLetters(kind)))
        }}
        className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface hover:bg-surface-elevated text-muted hover:text-text text-meta font-semibold px-3 py-1.5 lift-1 transition-colors disabled:opacity-60"
      >
        <Trash2 className={`h-3.5 w-3.5 ${pending ? 'animate-pulse' : ''}`} />
        {pending ? 'Discarding…' : label}
      </button>
      {result?.ok && (
        <span className="inline-flex items-center gap-1 text-meta text-muted font-medium">
          <Check className="h-3.5 w-3.5" /> Discarded {result.discarded}
        </span>
      )}
      {result && !result.ok && (
        <span className="inline-flex items-center gap-1 text-meta text-danger">
          <AlertCircle className="h-3.5 w-3.5" /> {result.error}
        </span>
      )}
    </span>
  )
}

// Send everything queued right now, without waiting for the cron. The operator reaches for this when
// the backlog is not moving (usually an unset CRON_SECRET in production, which makes the fail-closed
// cron guard reject Vercel's own call). Reports what the drain actually did rather than just "done":
// a run that claims 40 jobs and parks 40 of them is a very different outcome from one that sends 40.
export function DrainQueueButton() {
  const [result, setResult] = useState<DrainResult | null>(null)
  const [pending, start] = useTransition()

  return (
    <span className="inline-flex items-center gap-2">
      <Button
        size="sm"
        disabled={pending}
        onClick={() => {
          if (!confirm('Send every queued email and push now? This does the same work as the cron.')) return
          start(async () => setResult(await drainQueueNow()))
        }}
      >
        <Send className={`h-3.5 w-3.5 ${pending ? 'animate-pulse' : ''}`} />
        {pending ? 'Sending…' : 'Send queued now'}
      </Button>
      {result?.ok && (
        <span className="inline-flex items-center gap-1 text-meta text-success font-medium">
          <Check className="h-3.5 w-3.5" />
          {result.processed === 0
            ? 'Queue was already empty'
            : `${result.done} sent, ${result.retried} retrying, ${result.failed} parked${
                result.deferred ? `, ${result.deferred} waiting on the send quota` : ''
              }`}
        </span>
      )}
      {result && !result.ok && (
        <span className="inline-flex items-center gap-1 text-meta text-danger">
          <AlertCircle className="h-3.5 w-3.5" /> {result.error}
        </span>
      )}
    </span>
  )
}
