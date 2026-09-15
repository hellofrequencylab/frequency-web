'use client'

import Link from 'next/link'
import { useCallback, useState } from 'react'
import { Plus, Zap } from 'lucide-react'
import { Dialog } from '@/components/ui/dialog'
import { createItemsForRole, type CommunityRole } from '@/components/feed/create-actions'

// ── The mobile centre button: Create ────────────────────────────────────────────────────────
//
// The raised disc in the middle of the mobile tab bar is the strongest affordance in the phone
// product, and until LIVE-247 it fired `open-capture` straight into the Zap menu: a composer plus
// the earning tiles. The model (docs/CORE-MODEL.md §5, phase 7 row 5.2) wants the button to CREATE
// SOMETHING: a post, an event, a circle. So the disc is now a plus that opens the Create sheet,
// and the Zap menu is the sheet's first row (Post) rather than the whole button. Nothing that
// used to be reachable from the disc is gone; it is one tap further in and sits beside the
// structured creates it used to hide.
//
// ONE LIST, TWO SURFACES. The rows below Post come from `CREATE_ITEMS` in
// components/feed/create-actions.ts, the same list the desktop feed's CreateMenu renders, so the
// two menus cannot offer different things or gate them differently. Add a creation there, not
// here.
//
// SHELL WEIGHT. This file is statically reachable from app-shell.tsx, so it is parsed on every
// phone on every route. It imports the Dialog primitive, two lucide glyphs and the pure item list,
// nothing heavier; keep it that way (scripts/check-shell-weight.test.ts, Arm C).

/** Opens the Zap menu (CaptureLauncher, mounted once in app/(main)/layout.tsx) on the post mode. */
function openCapture() {
  window.dispatchEvent(new CustomEvent('open-capture', { detail: { mode: 'post' } }))
}

export function CreateSheet({
  open,
  onClose,
  role,
}: {
  open: boolean
  onClose: () => void
  /** The viewer's community role; a visitor preview (null) sees the member set. */
  role: CommunityRole | null
}) {
  const items = createItemsForRole(role ?? 'member')
  const post = useCallback(() => {
    // Close first so the Zap menu's focus restore lands on the disc, not on a row that is
    // about to unmount. The window listener runs synchronously inside this same click, so the
    // gesture-gated fullscreen request inside CaptureLauncher still lands.
    onClose()
    openCapture()
  }, [onClose])

  return (
    <Dialog open={open} onClose={onClose} ariaLabelledBy="create-sheet-title" align="bottom" className="sm:max-w-sm">
      <div className="flex w-full flex-col rounded-t-2xl border border-border bg-surface lift-3 sm:rounded-2xl">
        {/* Mobile drag indicator, the same shape CreateModal draws. */}
        <div className="flex justify-center pb-1 pt-2.5 sm:hidden">
          <div className="h-1 w-10 rounded-pill bg-border-strong" />
        </div>
        <div className="border-b border-border px-4 py-2.5">
          <p id="create-sheet-title" className="text-3xs font-semibold uppercase tracking-wider text-muted">
            Create
          </p>
        </div>
        <ul className="py-1 pb-[max(0.25rem,env(safe-area-inset-bottom))]">
          <li>
            <button
              type="button"
              onClick={post}
              className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-elevated"
            >
              <Zap className="mt-0.5 h-5 w-5 shrink-0 text-primary-strong" aria-hidden />
              <span className="min-w-0">
                <span className="block text-body-sm font-medium text-text">Post</span>
                <span className="block text-2xs leading-tight text-muted">Share something from your day</span>
              </span>
            </button>
          </li>
          {items.map(({ href, label, hint, Icon }) => (
            <li key={href}>
              <Link
                href={href}
                onClick={onClose}
                className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-surface-elevated"
              >
                <Icon className="mt-0.5 h-5 w-5 shrink-0 text-subtle" aria-hidden />
                <span className="min-w-0">
                  <span className="block text-body-sm font-medium text-text">{label}</span>
                  <span className="block text-2xs leading-tight text-muted">{hint}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </Dialog>
  )
}

/**
 * The raised centre tab of the mobile bar. Owns the sheet's open state so the bar around it
 * stays a plain row of tabs. The disc's geometry is slot 0a of the mobile stacking contract
 * (components/sidebar/game-stats-dock.tsx): its lift is `--tab-bar-lift`, the same token the
 * content column pads against, never a literal.
 */
export function CreateButton({ role }: { role: CommunityRole | null }) {
  const [open, setOpen] = useState(false)
  const close = useCallback(() => setOpen(false), [])
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Create"
        aria-haspopup="dialog"
        aria-expanded={open}
        className="relative flex min-w-0 flex-1 flex-col items-center justify-end gap-1.5 pb-2 text-3xs font-semibold text-primary-strong"
      >
        {/* The circle sits a touch lower than dead-center on the bar's top edge so it reads
            balanced against the flat tabs (its center is 6px below the line); the arch above
            drops to match, keeping the even 12px margin. */}
        <span aria-hidden className="h-[26px] w-[22px]" />
        {/* The fully-rounded catch the disc sits in, a floating disc rather than a bar bump. */}
        <span aria-hidden className="absolute left-1/2 top-0 h-14 w-14 -translate-x-1/2 -translate-y-[var(--tab-bar-lift)] rounded-pill border border-border bg-surface" />
        <span className="absolute left-1/2 top-0 flex h-12 w-12 -translate-x-1/2 -translate-y-[18px] items-center justify-center rounded-pill bg-primary shadow-pop">
          {/* LIGHT on the orange disc in light mode, DARK on the gold disc at night (all tokens). */}
          <Plus className="relative h-[26px] w-[26px] text-on-primary dark:text-ink" strokeWidth={2.5} aria-hidden />
        </span>
        <span className="w-full truncate text-center leading-none">Create</span>
      </button>
      <CreateSheet open={open} onClose={close} role={role} />
    </>
  )
}
