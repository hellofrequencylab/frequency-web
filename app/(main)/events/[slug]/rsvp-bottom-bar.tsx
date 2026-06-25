'use client'

import { useState, type ReactNode } from 'react'
import { ChevronUp } from 'lucide-react'
import { Dialog } from '@/components/ui/dialog'

// Mobile sticky bottom action bar (EVENTS-DESIGN §2.6). On < lg the Join column
// collapses to this: a one-thumb-tap bar carrying the status/price line + a primary
// button that opens the full RSVP/ticket surface in a Dialog. Hidden on lg+ (the
// page renders `lg:hidden`), and the page only mounts it when there IS an action
// (it hides itself for the host and for past/cancelled events by simply not being
// rendered there).
//
// The Join surface (RsvpControls / TicketButton + calendar) is passed in as
// children so this client shell owns only the bar + sheet chrome, never the action.

export function RsvpBottomBar({
  primaryLabel,
  statusLine,
  children,
}: {
  /** The loud button label, e.g. "RSVP" or "Get ticket · $20.00". */
  primaryLabel: string
  /** A short status / price line beside it, e.g. "Free" or "You're going". */
  statusLine?: string | null
  /** The full Join surface, shown in the sheet when the bar is tapped. */
  children: ReactNode
}) {
  const [open, setOpen] = useState(false)

  return (
    <>
      {/* Sit ABOVE the mobile tab bar (md:hidden, height 3.5rem + safe-area) on phones so the
          two fixed bars don't stack; drop to the screen bottom at md+ where the tab bar is gone. */}
      <div className="fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-40 border-t border-border bg-surface/95 px-4 py-3 backdrop-blur md:bottom-0 lg:hidden">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            {statusLine && <p className="truncate text-sm font-medium text-text">{statusLine}</p>}
          </div>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover"
          >
            <ChevronUp className="h-4 w-4" />
            {primaryLabel}
          </button>
        </div>
      </div>

      <Dialog open={open} onClose={() => setOpen(false)} ariaLabel="RSVP" className="max-w-md">
        <div className="rounded-2xl border border-border bg-surface p-5 shadow-xl">
          {children}
        </div>
      </Dialog>
    </>
  )
}
