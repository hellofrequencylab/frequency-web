'use client'

import { useId, useState, useTransition } from 'react'
import { Wand2, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { forkPracticeAction, remixDirectionsAction } from '@/app/(main)/practices/actions'
import { capsLabel } from '@/components/ui/caps-label'

// "Remix" a library practice you don't own (ADR-109 fork flow). Remix makes a NEW
// practice you own, starting from this one — a copy you can edit and publish. The
// original stays as is. Because that creates a real thing, we confirm first: the
// button opens a dialog, and only the confirm fires `forkPracticeAction`, which
// forks a private copy, adopts it, and redirects to the editor on the copy.
//
// "Remix it" directions (LIVE-645): the first time the dialog opens, Vera is asked for three short
// directions for THIS practice (remixDirectionsAction), the practice twin of a Starter Circle's
// Remix it list. They replace the static ideas as choices beside a plain "Just copy it" (the
// default). Picking one offers an idea; the fork keeps the original text. When AI is off
// the list comes back empty and the dialog is exactly the plain copy it always was.
export function RemixPracticeButton({ practiceId }: { practiceId: string }) {
  const [open, setOpen] = useState(false)
  const [pending, start] = useTransition()
  const [asking, startAsking] = useTransition()
  const [asked, setAsked] = useState(false)
  const [directions, setDirections] = useState<string[]>([])
  const labelId = useId()

  function openDialog() {
    setOpen(true)
    if (asked) return
    setAsked(true)
    startAsking(async () => {
      try {
        const res = await remixDirectionsAction(practiceId)
        if ('data' in res) setDirections(res.data.directions)
      } catch {
        // No directions is the plain copy the dialog always offered; never an error screen.
      }
    })
  }

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
        onClick={openDialog}
        aria-label="Remix this practice"
        title="Remix this practice into a copy you own"
        className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-body-sm font-semibold text-text transition-colors hover:bg-surface-elevated"
      >
        <Wand2 className="h-3.5 w-3.5" /> Remix
      </button>

      <Dialog open={open} onClose={() => (pending ? null : setOpen(false))} ariaLabel="Remix this practice?" className="max-w-md">
        <div className="rounded-card border border-border bg-surface p-6 lift-1">
          <div className="mb-3 flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-pill bg-primary-bg text-primary-strong">
              <Wand2 className="h-4 w-4" />
            </span>
            <h2 className="text-body-lg font-bold text-text">Remix this practice?</h2>
          <p className="mt-2 text-body-sm text-muted">Directions are ideas to consider as you edit. Your copy keeps the template unchanged; Vera does not rewrite or save it.</p>
          </div>
          <p className="text-body-sm text-muted">
            Remix makes a new practice you own, starting from this one. Don&apos;t just rework it.
            Make it yours: a new angle, a different setting, your own niche. Publish your version so
            the community gets a practice only you would make. The original stays exactly as it is.
          </p>
          <div className="mt-4 rounded-2xl bg-surface-elevated/60 p-4">
            <p id={labelId} className={capsLabel('text-2xs font-semibold text-primary-strong', 'widest')}>
              Ways to make it yours
            </p>
            {directions.length > 0 ? (
              <ul aria-labelledby={labelId} className="mt-2 list-disc space-y-1 pl-4 text-body-sm text-muted">{directions.map(direction => <li key={direction}>{direction}</li>)}</ul>
            ) : (
              <ul className="mt-2 space-y-1 text-body-sm text-muted">
                <li>A different setting: try it outdoors, before bed, or on a walk.</li>
                <li>A shorter version: trim it to five minutes for busy days.</li>
                <li>Your own focus: point it at one thing you care about.</li>
              </ul>
            )}
            {asking && (
              <p className="mt-2 inline-flex items-center gap-1.5 text-body-sm text-muted" aria-live="polite">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Vera is picking a few directions for this one.
              </p>
            )}

          </div>
          <div className="mt-5 flex items-center justify-end gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={() => setOpen(false)}
              className="inline-flex items-center rounded-lg border border-border bg-surface px-3 py-1.5 text-body-sm font-semibold text-text transition-colors hover:bg-surface-elevated disabled:opacity-60"
            >
              Cancel
            </button>
            <Button type="button" disabled={pending} onClick={confirm}>
              {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
              {pending ? 'Making your copy…' : 'Make a copy'}
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  )
}
