'use client'

// One unfinished wizard draft, on the SAME list as a pending proposal (ADR-1001).
//
// Two kinds of unfinished thing sit on this page and a member should not have to learn the
// difference: "something Vera drew up for you" and "something you started typing and stepped away
// from" are one idea, which is why they share a list rather than a second settings screen. The row
// says which is which in a badge and stops there.
//
// The client half is deliberately dumb, the same way DraftRow is: it renders what the server read
// and hands both decisions to a server action that re-derives the caller from the session. The
// answers themselves are never shown, only their count. A half-typed Journey is the author's own
// working note, and a list is the wrong place to publish it back at them.

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { PencilLine, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { RowCard } from '@/components/cards/row-card'
import { binUnfinishedDraftAction } from './actions'

export interface UnfinishedDraftView {
  scope: string
  label: string
  route: string | null
  answerCount: number
  savedLabel: string
  keptUntilLabel: string
}

export function UnfinishedDraftRow({ draft }: { draft: UnfinishedDraftView }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function bin() {
    setError(null)
    start(async () => {
      const gone = await binUnfinishedDraftAction(draft.scope)
      if (!gone) {
        setError('That did not clear. Try again in a moment.')
        return
      }
      router.refresh()
    })
  }

  return (
    <li>
      <RowCard
        title={draft.label}
        badge={
          <span className="inline-flex items-center gap-1 rounded-pill bg-surface-elevated px-2 py-0.5 text-2xs font-semibold uppercase tracking-wide text-muted">
            <PencilLine className="h-3 w-3" aria-hidden />
            You started this
          </span>
        }
        context={draft.keptUntilLabel}
        description={`${draft.answerCount} answer${draft.answerCount === 1 ? '' : 's'} saved ${draft.savedLabel}. Nothing has been created yet.`}
        footer={
          <>
            <div className="flex flex-wrap items-center gap-2">
              {draft.route ? (
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  disabled={pending}
                  onClick={() => router.push(draft.route as string)}
                >
                  Pick up where you left off
                </Button>
              ) : (
                <p className="text-body-sm text-muted">Open the same builder again to carry on.</p>
              )}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={bin}
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
