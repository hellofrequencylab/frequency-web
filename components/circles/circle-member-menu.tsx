'use client'

import { useState, useEffect, useRef } from 'react'
import { MoreHorizontal, LogOut } from 'lucide-react'

// ── LEAVING A CIRCLE IS A SETTING, NOT AN ACTION (owner ruling, 2026-09-17) ─────────────────────
//
// *"Make Leave group a subtle setting somewhere else and not a primary button."*
//
// Leave used to be a full secondary button sitting at the right end of the Circle header, the same
// size and weight as Manage, which put "walk out of this room" in the row a member reads for "what
// can I do here". It is now behind the overflow control on the tab row: reachable from every tab,
// one click deeper, and no longer competing with the things a member actually came to do.
//
// 🔴 IT CANNOT MOVE TO THE ADMIN RAIL, and that is the constraint that decided this spot. The rail
// carries HOST tools, gated on `circle.editSettings`; a plain member holds none of them and would
// never see the rail at all, so a member's only way out would vanish with the button. The tab row
// is the one piece of Circle chrome every viewer gets on every tab.
//
// WHO SEES IT. A member who is not the Host. A Host hands the Circle over (ADR-845) rather than
// walking out of it, which is why there is no Host arm here and no "delete" in this menu.
//
// CONFIRMATION IS DELIBERATE. Leaving is a real loss for a paid or invite-only Circle: the door may
// not open a second time (`access` can be `invite` or `tier`), so a mis-click is not reversible by
// the member who made it. The confirm step is a `window.confirm` rather than a modal because this
// is a two-item menu on a chrome row, and mounting a dialog implementation here to ask one question
// would be the heavier thing.

export function CircleMemberMenu({ leaveAction }: { leaveAction: () => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleOutside)
    return () => document.removeEventListener('mousedown', handleOutside)
  }, [])

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Circle options"
        aria-expanded={open}
        aria-haspopup="menu"
        className="tap-target inline-flex items-center justify-center rounded-control px-2 py-1.5 text-muted transition-colors hover:bg-surface-elevated hover:text-text"
      >
        <MoreHorizontal className="h-4 w-4" aria-hidden />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-50 mt-2 w-56 rounded-card border border-border bg-surface py-1 lift-3"
        >
          <form
            action={leaveAction}
            onSubmit={(e) => {
              if (!window.confirm('Leave this circle? You will stop seeing its posts and events.')) {
                e.preventDefault()
              }
              setOpen(false)
            }}
          >
            <button
              type="submit"
              role="menuitem"
              className="flex w-full items-start gap-2.5 px-3 py-2 text-left transition-colors hover:bg-surface-elevated"
            >
              <LogOut className="mt-0.5 h-4 w-4 shrink-0 text-subtle" aria-hidden />
              <span className="min-w-0">
                <span className="block text-body-sm font-medium text-text">Leave circle</span>
                <span className="block text-2xs leading-tight text-muted">
                  You can ask to join again if the door is open.
                </span>
              </span>
            </button>
          </form>
        </div>
      )}
    </div>
  )
}
