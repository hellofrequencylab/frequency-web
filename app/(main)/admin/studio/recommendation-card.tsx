'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Loader2, Zap } from 'lucide-react'
import { StatusChip, type StatusTone } from '@/components/admin/status'
import { applyStudioAction, revertStudioChange } from './actions'
import { isError } from '@/lib/action-result'
import type { StudioRec, Severity } from '@/lib/studio/recommendations'

/** Undo a reversible applied change (flag toggles) from the change log. */
export function RevertButton({ logId }: { logId: string }) {
  const [isPending, startTransition] = useTransition()
  const router = useRouter()
  return (
    <button
      onClick={() =>
        startTransition(async () => {
          await revertStudioChange(logId)
          router.refresh()
        })
      }
      disabled={isPending}
      className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-xs font-medium text-muted transition-colors hover:bg-surface-elevated hover:text-text disabled:opacity-60 motion-reduce:transition-none"
    >
      {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Revert'}
    </button>
  )
}

// Severity → the one StatusChip vocabulary (retires the per-card SEV dict).
const SEV_TONE: Record<Severity, StatusTone> = { risk: 'danger', watch: 'warning', good: 'success' }
const SEV_LABEL: Record<Severity, string> = { risk: 'Risk', watch: 'Watch', good: 'Good' }

export function RecommendationCard({ rec }: { rec: StudioRec }) {
  const [isPending, startTransition] = useTransition()
  const [confirming, setConfirming] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  function apply() {
    if (!rec.action) return
    setError(null)
    startTransition(async () => {
      const r = await applyStudioAction(rec.action!.key, rec.action!.params, rec.id)
      if (isError(r)) {
        setError(r.error)
        setConfirming(false)
      } else {
        setDone(true)
        router.refresh()
      }
    })
  }

  return (
    <div className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
      <div className="min-w-0">
        <div className="mb-1 flex flex-wrap items-center gap-2">
          <StatusChip tone={SEV_TONE[rec.severity]} size="sm">
            {SEV_LABEL[rec.severity]}
          </StatusChip>
          <span className="text-xs font-medium uppercase tracking-wide text-subtle">{rec.category}</span>
          <span className="text-xs text-subtle">· {rec.confidence} confidence</span>
        </div>
        <h3 className="text-sm font-bold text-text">{rec.title}</h3>
        <p className="mt-1 text-sm text-muted">{rec.finding}</p>
        <p className="mt-1.5 text-sm text-text">
          <span className="font-semibold">Do:</span> {rec.recommendation}
        </p>
      </div>

      {rec.action && (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3">
          {done ? (
            <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-success">
              <Check className="h-4 w-4" /> Applied
            </span>
          ) : confirming ? (
            // Propose-then-confirm — the action is named on the confirm button.
            <>
              <button
                onClick={apply}
                disabled={isPending}
                className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3.5 py-2 text-sm font-bold text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-60 motion-reduce:transition-none"
              >
                {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                Confirm: {rec.action.label}
              </button>
              <button
                onClick={() => setConfirming(false)}
                disabled={isPending}
                className="rounded-xl border border-border px-3 py-2 text-sm font-semibold text-text transition-colors hover:bg-surface-elevated disabled:opacity-60 motion-reduce:transition-none"
              >
                Cancel
              </button>
            </>
          ) : (
            <button
              onClick={() => setConfirming(true)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3.5 py-2 text-sm font-bold text-on-primary transition-colors hover:bg-primary-hover motion-reduce:transition-none"
            >
              <Zap className="h-4 w-4" />
              {rec.action.label}
            </button>
          )}
          {error && <span className="text-sm text-danger">{error}</span>}
        </div>
      )}
    </div>
  )
}
