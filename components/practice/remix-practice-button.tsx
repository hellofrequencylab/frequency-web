'use client'

import { useState, useTransition } from 'react'
import { Wand2, Loader2 } from 'lucide-react'
import { Dialog } from '@/components/ui/dialog'
import { forkPracticeAction } from '@/app/(main)/practices/actions'

// "Remix" a library practice you don't own (ADR-109 fork flow). Remix makes a NEW
// practice you own, starting from this one — a copy you can edit and publish. The
// original stays as is. Because that creates a real thing, we confirm first: the
// button opens a dialog, and only the confirm fires `forkPracticeAction`, which
// forks a private copy, adopts it, and redirects to the editor on the copy.
export function RemixPracticeButton({ practiceId }: { practiceId: string }) {
  const [open, setOpen] = useState(false)
  const [pending, start] = useTransition()

  function confirm() {
    // forkPracticeAction redirects to the new copy's editor on success, so this
    // transition resolves into a navigation — no local "done" state to manage.
    start(async () => {
      await forkPracticeAction(practiceId)
    })
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Remix this practice"
        title="Remix this practice into a copy you own"
        className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm font-semibold text-text transition-colors hover:bg-surface-elevated"
      >
        <Wand2 className="h-3.5 w-3.5" /> Remix
      </button>

      <Dialog open={open} onClose={() => (pending ? null : setOpen(false))} ariaLabel="Remix this practice?" className="max-w-md">
        <div className="rounded-2xl border border-border bg-surface p-6 shadow-sm">
          <div className="mb-3 flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary-bg text-primary-strong">
              <Wand2 className="h-4 w-4" />
            </span>
            <h2 className="text-lg font-bold text-text">Remix this practice?</h2>
          </div>
          <p className="text-sm text-muted">
            Remix makes a new practice you own, starting from this one. Don&apos;t just rework it.
            Make it yours: a new angle, a different setting, your own niche. Publish your version so
            the community gets a practice only you would make. The original stays exactly as it is.
          </p>
          <div className="mt-5 flex items-center justify-end gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={() => setOpen(false)}
              className="inline-flex items-center rounded-lg border border-border bg-surface px-3 py-1.5 text-sm font-semibold text-text transition-colors hover:bg-surface-elevated disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={confirm}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-1.5 text-sm font-semibold text-on-primary shadow-sm transition-colors hover:bg-primary-hover disabled:opacity-60"
            >
              {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
              {pending ? 'Making your copy…' : 'Remix it'}
            </button>
          </div>
        </div>
      </Dialog>
    </>
  )
}
