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
      {/* THE BAR SPANS THE WHOLE BOTTOM LANE — it does not float above it (globals.css, the
          2026-08-31 amendment to the mobile stacking contract).

          🔴 This used to be `bottom-[var(--tab-bar-clearance)]`, which hung the bar 53px above
          the tab bar with page content scrolling through the gap underneath (owner, off a phone
          capture of the Meld event page). The clearance is the lane's TOP, and it is the right
          number for a narrow floating thing — a toast, a teaser pill — that the catch and the
          chat tab would otherwise paint over. This bar is `inset-x-0` and OPAQUE, so it has no
          sideways to dodge to and its gap is a window onto the page rather than empty air.

          So it takes the lane as PADDING instead: the BACKGROUND starts at --tab-bar-h (flush
          with the tab bar, no gap) and the CONTENT is pushed up past --lane-rise, so the Zap
          catch and the chat tab ride ON the bar rather than through the controls. Both stay
          visible and pressable — the reason this is padding and not simply hiding them.

          At md+ the tab bar and both risers are `md:hidden`, so the bar drops flush to the
          screen bottom and the padding relaxes back to the plain gutter. */}
      <div className="fixed inset-x-0 bottom-[var(--tab-bar-h)] z-40 border-t border-border bg-surface/95 px-4 pt-3 pb-[calc(var(--lane-rise)+0.75rem)] backdrop-blur md:bottom-0 md:pb-3 lg:hidden">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            {statusLine && <p className="truncate text-body-sm font-medium text-text">{statusLine}</p>}
          </div>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-control bg-primary px-5 py-2.5 text-body-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover"
          >
            <ChevronUp className="h-4 w-4" />
            {primaryLabel}
          </button>
        </div>
      </div>

      <Dialog open={open} onClose={() => setOpen(false)} ariaLabel="RSVP" className="max-w-md">
        <div className="rounded-card border border-border bg-surface p-5 lift-3">
          {children}
        </div>
      </Dialog>
    </>
  )
}
