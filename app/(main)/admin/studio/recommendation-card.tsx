'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Loader2, Zap, AlertTriangle, Eye, CircleCheck } from 'lucide-react'
import { applyStudioAction, revertStudioChange } from './actions'
import { isError } from '@/lib/action-result'
import type { StudioRec, Severity } from '@/lib/studio/recommendations'

/** Undo a reversible applied change (flag toggles) from the audit log. */
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
      className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-xs font-medium text-muted transition-colors hover:bg-surface-elevated hover:text-text disabled:opacity-60"
    >
      {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Revert'}
    </button>
  )
}

const SEV: Record<Severity, { cls: string; Icon: typeof Eye; label: string }> = {
  risk: { cls: 'bg-danger-bg/40 text-danger', Icon: AlertTriangle, label: 'Risk' },
  watch: { cls: 'bg-warning-bg/50 text-warning', Icon: Eye, label: 'Watch' },
  good: { cls: 'bg-success-bg/40 text-success', Icon: CircleCheck, label: 'Good' },
}

export function RecommendationCard({ rec }: { rec: StudioRec }) {
  const [isPending, startTransition] = useTransition()
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()
  const sev = SEV[rec.severity]

  function apply() {
    if (!rec.action) return
    setError(null)
    startTransition(async () => {
      const r = await applyStudioAction(rec.action!.key, rec.action!.params, rec.id)
      if (isError(r)) setError(r.error)
      else {
        setDone(true)
        router.refresh()
      }
    })
  }

  return (
    <div className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="mb-1 flex items-center gap-2">
            <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-2xs font-bold uppercase tracking-wide ${sev.cls}`}>
              <sev.Icon className="h-3 w-3" /> {sev.label}
            </span>
            <span className="text-2xs font-medium uppercase tracking-wide text-subtle">{rec.category}</span>
            <span className="text-2xs text-subtle">· {rec.confidence} confidence</span>
          </div>
          <h3 className="text-sm font-bold text-text">{rec.title}</h3>
          <p className="mt-1 text-sm text-muted">{rec.finding}</p>
          <p className="mt-1.5 text-sm text-text"><span className="font-semibold">Do:</span> {rec.recommendation}</p>
        </div>
      </div>

      {rec.action && (
        <div className="mt-3 flex items-center gap-2 border-t border-border pt-3">
          {done ? (
            <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-success">
              <Check className="h-4 w-4" /> Applied
            </span>
          ) : (
            <button
              onClick={apply}
              disabled={isPending}
              className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3.5 py-2 text-sm font-bold text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-60"
            >
              {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
              {rec.action.label}
            </button>
          )}
          {error && <span className="text-sm text-danger">{error}</span>}
        </div>
      )}
    </div>
  )
}
