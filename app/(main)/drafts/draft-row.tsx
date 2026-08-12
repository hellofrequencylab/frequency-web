'use client'

// One pending create proposal, with the two decisions a member can make about it.
//
// The client half is deliberately dumb: it renders what the server read, disables itself while a
// decision is in flight, and shows whatever plain sentence comes back. Every gate, the ownership
// check, the expiry and the single-use claim live server-side in lib/ai/vera/create-entity.ts, so
// nothing here can be defeated by editing the page.

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Sparkles, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { RowCard } from '@/components/cards/row-card'
import { isError } from '@/lib/action-result'
import { confirmDraftAction, dismissDraftAction } from './actions'
import type { PendingCreateProposal } from '@/lib/ai/vera/create-entity'

function whenText(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

/** The first thing worth reading off a draft: whatever it calls itself. */
function draftTitle(draft: Record<string, unknown>): string | null {
  for (const key of ['name', 'title']) {
    const v = draft[key]
    if (typeof v === 'string' && v.trim()) return v.trim()
  }
  return null
}

/** The second line: a one-liner if the draft has one. */
function draftBlurb(draft: Record<string, unknown>): string | null {
  for (const key of ['about', 'summary', 'description']) {
    const v = draft[key]
    if (typeof v === 'string' && v.trim()) return v.trim().slice(0, 240)
  }
  return null
}

export function DraftRow({ proposal, noCommitReason }: { proposal: PendingCreateProposal; noCommitReason: string | null }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const title = draftTitle(proposal.draft)
  const blurb = draftBlurb(proposal.draft)

  function confirm() {
    setError(null)
    start(async () => {
      const res = await confirmDraftAction(proposal.proposalId)
      if (isError(res)) {
        setError(res.error)
        return
      }
      router.push(res.data.href ?? '/drafts')
    })
  }

  function dismiss() {
    setError(null)
    start(async () => {
      const res = await dismissDraftAction(proposal.proposalId)
      if (isError(res)) setError(res.error)
      else router.refresh()
    })
  }

  // A draft has no page of its own — nothing here exists yet — so the row composes RowCard in its
  // MANAGED shape (title, context, description, footer control bar) with no `href`.
  return (
    <li>
      <RowCard
        title={title ?? `Untitled ${proposal.label.toLowerCase()}`}
        badge={
          <>
            <span className="rounded-pill bg-surface-elevated px-2 py-0.5 text-2xs font-semibold uppercase tracking-wide text-muted">
              {proposal.label}
            </span>
            {proposal.aiDrafted && (
              <span className="inline-flex items-center gap-1 rounded-pill bg-primary-bg px-2 py-0.5 text-2xs font-semibold uppercase tracking-wide text-primary-strong">
                <Sparkles className="h-3 w-3" aria-hidden />
                Vera drafted this
              </span>
            )}
          </>
        }
        context={`Keep it until ${whenText(proposal.expiresAt)}`}
        description={blurb}
        meta={proposal.rationale}
        footer={
          <>
            <div className="flex flex-wrap items-center gap-2">
              {proposal.commitAvailable ? (
                <Button type="button" variant="primary" size="sm" onClick={confirm} disabled={pending}>
                  {pending ? 'Working' : proposal.confirmLabel}
                </Button>
              ) : (
                <p className="text-body-sm text-muted">{noCommitReason ?? 'Finish this one in its own builder.'}</p>
              )}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={dismiss}
                disabled={pending}
                className="ml-auto"
              >
                <Trash2 className="h-4 w-4" aria-hidden />
                Bin it
              </Button>
            </div>
            {error && (
              <p role="status" className="mt-2 text-body-sm text-danger">
                {error}
              </p>
            )}
          </>
        }
      />
    </li>
  )
}
