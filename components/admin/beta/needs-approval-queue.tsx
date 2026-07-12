'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { Rocket, Megaphone, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { StatusChip } from '@/components/admin/status'
import { Banner } from '@/components/admin/status'
import { isError } from '@/lib/action-result'
import { approveOutbound, pauseOutbound } from '@/app/(main)/admin/beta/actions'
import type { OutboundItem } from '@/lib/beta/approvals'

// The Today "Needs your approval" queue (Wave 1). Ready items grouped BY PHASE
// (owner directive: approval is phase-by-phase). Approve arms the item through the
// spine (approverGate: admin/janitor only); a denial surfaces inline. Preview links
// to the item's current home until Wave 2 ships per-item detail/preview.
//
// Props are serializable (a Server Component fetches + groups, then hands the plain
// data here). Each group = one phase (or the unfiled bucket).

export interface ApprovalGroup {
  /** null = items not yet filed under a phase. */
  phaseKey: string | null
  phaseTitle: string
  items: OutboundItem[]
}

const TYPE_META = {
  campaign: { Icon: Megaphone, noun: 'Campaign' },
  admission_wave: { Icon: Users, noun: 'Admission wave' },
} as const

function previewHref(item: OutboundItem): string {
  // Interim: no per-item detail page in Wave 1. Campaigns open the campaigns
  // workspace; waves open the phase board, which now lives under the Strategy tab
  // (the Command Center restructure folded Phases into Strategy). WAVE 2 replaces
  // this with a real preview.
  return item.type === 'campaign' ? '/admin/marketing/campaigns' : '/admin/beta?tab=strategy'
}

export function NeedsApprovalQueue({ groups }: { groups: ApprovalGroup[] }) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  function run(item: OutboundItem, action: 'approve' | 'pause') {
    setError(null)
    setBusyId(item.id)
    startTransition(async () => {
      const result =
        action === 'approve'
          ? await approveOutbound(item.type, item.id)
          : await pauseOutbound(item.type, item.id)
      setBusyId(null)
      if (isError(result)) setError(result.error)
    })
  }

  return (
    <div className="space-y-5">
      {error && (
        <Banner tone="critical" title="That action did not go through" dismissible>
          {error}
        </Banner>
      )}

      {groups.map((group) => (
        <div key={group.phaseKey ?? 'unfiled'} className="space-y-2">
          <div className="flex items-center gap-2">
            <Rocket className="h-3.5 w-3.5 shrink-0 text-primary-strong" aria-hidden />
            <h3 className="text-sm font-bold text-text">{group.phaseTitle}</h3>
            <StatusChip tone="warning" size="sm">
              {group.items.length} ready
            </StatusChip>
          </div>

          <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
            {group.items.map((item) => {
              const meta = TYPE_META[item.type]
              const busy = pending && busyId === item.id
              return (
                <li key={`${item.type}:${item.id}`} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <meta.Icon className="h-4 w-4 shrink-0 text-subtle" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-text">{item.label}</p>
                    <p className="text-xs text-muted">
                      {meta.noun}
                      {item.count != null && ` · ${item.count.toLocaleString()} recipients`}
                      {item.segment && ` · ${item.segment}`}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Link
                      href={previewHref(item)}
                      className="text-xs font-semibold text-muted underline-offset-2 hover:text-text hover:underline"
                    >
                      Preview
                    </Link>
                    <Button size="sm" variant="secondary" disabled={busy} onClick={() => run(item, 'pause')}>
                      Pause
                    </Button>
                    <Button size="sm" disabled={busy} onClick={() => run(item, 'approve')}>
                      {busy ? 'Working…' : 'Approve'}
                    </Button>
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
      ))}
    </div>
  )
}
