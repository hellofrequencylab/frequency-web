'use client'

import { useState, useTransition } from 'react'
import { Sparkles, ArrowRight } from 'lucide-react'
import type { Walkthrough } from '@/lib/walkthroughs'
import { WalkthroughLightbox } from '@/components/walkthroughs/walkthrough-lightbox'
import { dismissWalkthroughAction } from '@/app/(main)/walkthrough-actions'

// Walkthroughs Phase B — the gentle, dismissible in-feed card. NOT an auto-popup: it
// sits quietly in the feed with the walkthrough's name + description, a "Start" that
// opens the slide deck (the lightbox), and a quiet "Not now" that records a dismissal so
// the cadence rests it. Matches the feed's card language (rounded-2xl border bg-surface),
// token-only styling.

export function WalkthroughCard({ walkthrough }: { walkthrough: Walkthrough }) {
  const [open, setOpen] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const [pending, start] = useTransition()

  function notNow() {
    if (pending) return
    setDismissed(true)
    start(async () => {
      await dismissWalkthroughAction(walkthrough.slug)
    })
  }

  if (dismissed) return null

  return (
    <>
      <div className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
        <div className="flex items-start gap-4">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary-bg text-primary-strong">
            <Sparkles className="h-5 w-5" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-2xs font-semibold uppercase tracking-wide text-subtle">Walkthrough</p>
            <h3 className="mt-0.5 text-base font-bold text-text">{walkthrough.name}</h3>
            {walkthrough.description && (
              <p className="mt-1 text-sm leading-relaxed text-muted">{walkthrough.description}</p>
            )}
            <div className="mt-3 flex items-center gap-2">
              <button
                type="button"
                onClick={() => setOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover"
              >
                Start <ArrowRight className="h-3.5 w-3.5" aria-hidden />
              </button>
              <button
                type="button"
                onClick={notNow}
                className="rounded-xl px-3 py-2 text-sm font-medium text-subtle transition-colors hover:text-text"
              >
                Not now
              </button>
            </div>
          </div>
        </div>
      </div>

      {open && <WalkthroughLightbox walkthrough={walkthrough} onClose={() => setOpen(false)} />}
    </>
  )
}
