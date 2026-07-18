'use client'

import { useState, useTransition } from 'react'
import { Plus, Loader2 } from 'lucide-react'
import { Dialog } from '@/components/ui/dialog'
import { buttonClasses } from '@/components/ui/button'
import { createSpaceJourneyAction } from '@/app/(main)/spaces/[slug]/journeys/actions'

// "New journey" for a SPACE manager. Naming the Journey is what creates it (ADR-301), so this
// opens a small dialog that collects a title, then calls createSpaceJourneyAction(slug, title):
// the action stamps a private draft to this Space, seeds three phases, and redirects into the
// editor. Because the action redirects on success, the transition resolves into a navigation with
// no local "done" state to manage. Mirrors the personal new-journey entry point, scoped to a Space.
export function NewSpaceJourneyButton({ slug }: { slug: string }) {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [pending, start] = useTransition()

  const clean = title.trim()

  function create() {
    if (!clean) return
    start(async () => {
      await createSpaceJourneyAction(slug, clean)
    })
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={buttonClasses('primary', 'md')}>
        <Plus className="h-4 w-4" /> New journey
      </button>

      <Dialog
        open={open}
        onClose={() => (pending ? null : setOpen(false))}
        ariaLabel="Name your new journey"
        className="max-w-md"
      >
        <div className="rounded-2xl border border-border bg-surface p-6 shadow-sm">
          <h2 className="text-lg font-bold text-text">Name your journey</h2>
          <p className="mt-1 text-sm text-muted">
            Give it a working title to get started. It opens as a private draft you can rename, build
            out, and publish when it is ready.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              create()
            }}
          >
            <input
              type="text"
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={120}
              placeholder="Your journey title"
              className="mt-4 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text outline-none placeholder:text-subtle focus:border-border-strong"
            />
            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                disabled={pending}
                onClick={() => setOpen(false)}
                className={buttonClasses('secondary', 'sm')}
              >
                Cancel
              </button>
              <button type="submit" disabled={pending || !clean} className={buttonClasses('primary', 'sm')}>
                {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                {pending ? 'Creating' : 'Create journey'}
              </button>
            </div>
          </form>
        </div>
      </Dialog>
    </>
  )
}
