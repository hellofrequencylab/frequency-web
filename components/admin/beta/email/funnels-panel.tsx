'use client'

// Beta funnels — time-based drip (nurture_sequences) + event-based triggers
// (automation_rules), scoped to Beta. Arm-once-then-pausable: a funnel ships DISABLED
// and only an approver may arm it (armBetaFunnel flips `enabled` true after the
// approver gate); the kill switch flips it back off. Each funnel shows its trigger.

import { useState, useTransition } from 'react'
import { Clock, Zap, Power } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { StatusChip, Banner } from '@/components/admin/status'
import { isError } from '@/lib/action-result'
import type { BetaFunnel } from '@/lib/beta/email'
import { armBetaFunnel, pauseBetaFunnel } from '@/app/(main)/admin/beta/email-actions'

function humanDelay(hours: number): string {
  if (hours <= 0) return 'immediately'
  if (hours < 24) return `after ${hours}h`
  const days = Math.round(hours / 24)
  return `after ${days} day${days === 1 ? '' : 's'}`
}

export function FunnelsPanel({ funnels }: { funnels: BetaFunnel[] }) {
  if (funnels.length === 0) {
    return (
      <EmptyState
        variant="first-use"
        title="No beta funnels yet"
        description="Load the starter templates to seed the Beta waitlist drip. Funnels stay off until you arm them."
      />
    )
  }
  return (
    <ul className="space-y-3">
      {funnels.map((f) => (
        <li key={`${f.kind}:${f.id}`}>
          <FunnelCard funnel={f} />
        </li>
      ))}
    </ul>
  )
}

function FunnelCard({ funnel: f }: { funnel: BetaFunnel }) {
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const Icon = f.kind === 'nurture' ? Clock : Zap

  function toggle() {
    setError(null)
    start(async () => {
      const r = f.enabled ? await pauseBetaFunnel(f.kind, f.id) : await armBetaFunnel(f.kind, f.id)
      if (isError(r)) setError(r.error)
    })
  }

  return (
    <div className="space-y-3 rounded-2xl border border-border bg-surface p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Icon className="h-4 w-4 shrink-0 text-subtle" aria-hidden />
            <p className="truncate text-sm font-bold text-text">{f.name}</p>
            <StatusChip tone={f.enabled ? 'success' : 'neutral'} size="sm">
              {f.enabled ? 'Live' : 'Off (draft)'}
            </StatusChip>
          </div>
          <p className="mt-0.5 text-xs text-muted">{f.trigger}</p>
        </div>
        <Button
          size="sm"
          variant={f.enabled ? 'warningOutline' : 'primary'}
          disabled={pending}
          onClick={toggle}
        >
          <Power className="h-3.5 w-3.5" /> {f.enabled ? 'Pause' : 'Arm'}
        </Button>
      </div>

      {f.steps.length > 0 && (
        <ol className="divide-y divide-border overflow-hidden rounded-xl border border-border">
          {f.steps.map((s) => (
            <li key={s.order} className={`flex items-center gap-3 px-3 py-2 ${s.enabled ? '' : 'opacity-50'}`}>
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-2xs font-bold text-primary-strong">
                {s.order}
              </span>
              <span className="min-w-0 flex-1 truncate text-xs font-medium text-text">{s.subject}</span>
              <span className="shrink-0 text-2xs text-subtle">{humanDelay(s.delayHours)}</span>
            </li>
          ))}
        </ol>
      )}

      {error && (
        <Banner tone="critical" title="That did not go through">
          {error}
        </Banner>
      )}
    </div>
  )
}
