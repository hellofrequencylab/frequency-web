'use client'

import { useState, type ReactNode } from 'react'
import Link from 'next/link'
import { Zap, X } from 'lucide-react'
import { Dialog } from '@/components/ui/dialog'

// A GHOSTED menu entry: an item or rail card a viewer can SEE but not yet USE
// (the menu data resolved it to mode 'ghost' for their role, lib/menus). It renders
// muted and non-interactive in flow; clicking it does NOT navigate, it opens the
// shared upgrade lightbox (the same Dialog chrome + /upgrade route the rest of the
// app uses for the Crew upsell, components/crew/upgrade-lightbox + app/(main)/upgrade).
//
// `ghostTier` (default 'crew') names the tier being sold and `ghostMessage` overrides
// the default pitch, both threaded straight from the menu row. Accessible: a real
// button (keyboard reachable), aria-disabled so AT announces the gate, and Esc /
// backdrop close via the shared Dialog. Tokens only; no em or en dashes.

const DEFAULT_GHOST_MESSAGE =
  'This is part of a higher tier. Upgrade to unlock it. You keep everything you have.'

/** Title-case a tier token for the heading ("crew" -> "Crew"). */
function tierLabel(tier: string): string {
  return tier.length > 0 ? tier[0].toUpperCase() + tier.slice(1) : tier
}

export function GhostLink({
  ghostTier = 'crew',
  ghostMessage,
  className = '',
  ariaLabel,
  children,
}: {
  /** The tier this entry is gated behind; names the upsell. */
  ghostTier?: string
  /** Optional override for the lightbox body copy. */
  ghostMessage?: string
  /** Layout classes for the muted trigger (matches the active link's box). */
  className?: string
  /** Accessible name for the gate (e.g. the item label). */
  ariaLabel?: string
  children: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const tier = tierLabel(ghostTier)

  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        aria-disabled="true"
        aria-label={ariaLabel}
        onClick={() => setOpen(true)}
        // Muted + non-navigating: it reads as a preview of what a higher tier unlocks.
        className={`cursor-pointer text-left opacity-60 saturate-[0.6] transition-opacity hover:opacity-80 motion-reduce:transition-none ${className}`}
      >
        {children}
      </button>

      <Dialog open={open} onClose={() => setOpen(false)} ariaLabel={`Upgrade to ${tier}`} className="max-w-sm">
        <div className="relative w-full rounded-3xl border border-border bg-surface p-6 text-center shadow-2xl">
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close"
            className="absolute right-3 top-3 rounded-full p-1.5 text-subtle transition-colors hover:bg-surface-elevated hover:text-text"
          >
            <X className="h-4 w-4" />
          </button>
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-bg text-primary-strong">
            <Zap className="h-6 w-6" />
          </div>
          <h2 className="mt-4 text-xl font-bold text-text">Upgrade to {tier}</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            {ghostMessage ?? DEFAULT_GHOST_MESSAGE}
          </p>
          <Link
            href="/upgrade"
            onClick={() => setOpen(false)}
            className="mt-5 inline-flex w-full items-center justify-center rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover"
          >
            Upgrade to {tier}
          </Link>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="mt-2 w-full rounded-xl px-5 py-2 text-sm font-medium text-subtle transition-colors hover:text-text"
          >
            Keep looking around
          </button>
        </div>
      </Dialog>
    </>
  )
}
