'use client'

import { useEffect, useRef, useSyncExternalStore, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/utils'
import { usePortaledSpaceTheme } from './use-portaled-space-theme'

// True on the client, false during SSR + the first hydration pass — without a setState-in-effect (which the
// repo's lint forbids). Lets the portal render only once we're safely on the client, matching the server's
// null so hydration never mismatches.
const emptySubscribe = () => () => {}
function useIsClient() {
  return useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  )
}

// A stack of the currently-open dialogs, innermost last. Only the TOPMOST dialog reacts to ESC / Tab, so a
// stacked dialog (e.g. the Loom picker opened over the on-canvas photo popup — both portal to document.body,
// so neither is a DOM descendant of the other) never also drives the one beneath it: one ESC closed BOTH,
// and the outer's focus trap fought the inner's on every Tab. Module-scoped: shared across every instance.
const dialogStack: symbol[] = []

// Shared modal/overlay shell — one place for the backdrop, centering, ESC +
// backdrop-click to close, body scroll-lock, focus trap + restore, and dialog
// a11y. Replaces the per-modal hand-rolled overlays the audit flagged. The caller
// renders its own panel (card) as children and sets the width via `className`
// (e.g. `max-w-lg`); this owns only the chrome.
export function Dialog({
  open,
  onClose,
  children,
  ariaLabel,
  className,
  align = 'top',
}: {
  open: boolean
  onClose: () => void
  children: ReactNode
  /** Accessible name when the panel has no visible heading to point at. */
  ariaLabel?: string
  /** Panel sizing / extras — pass a `max-w-*` (the panel is `w-full` otherwise). */
  className?: string
  /** Vertical placement.
   *  - `top` (default): pins the panel near the top (every existing caller).
   *  - `center`: centers it in the viewport.
   *  - `sheet`: edge-to-edge full screen on mobile (no backdrop padding, the panel fills the viewport),
   *    reverting to a centered card at `sm+`. For focused, complex mobile tasks like the media picker,
   *    where a boxed center card wastes the screen. The panel supplies its own `h-full sm:h-auto` sizing. */
  align?: 'top' | 'center' | 'sheet'
}) {
  const panelRef = useRef<HTMLDivElement>(null)
  // A stable identity for this instance, used to find it in the dialog stack (topmost check).
  const idRef = useRef<symbol | null>(null)
  if (idRef.current === null) idRef.current = Symbol('dialog')
  // Was the pointer pressed down ON the backdrop itself (not the panel)? Backdrop dismissal fires only when
  // BOTH the press and the release land on the backdrop, so a drag/scroll that starts inside the panel and
  // ends on the backdrop (or a tap that starts on the backdrop margin during a touch-scroll) never closes.
  const downOnBackdropRef = useRef(false)
  // Stays mounted IN PLACE on both branches, so there is always a node at this dialog's real
  // position in the tree to read the Space theme from before the portal jumps to <body>.
  const anchorRef = useRef<HTMLSpanElement>(null)
  // Only portal on the client (createPortal needs document.body); the server + first hydration render null.
  const isClient = useIsClient()

  useEffect(() => {
    if (!open) return
    const panel = panelRef.current
    const id = idRef.current!
    dialogStack.push(id)

    // Remember what was focused before we opened (the trigger), so keyboard and
    // screen-reader users land back where they left off when the dialog closes.
    const previouslyFocused = document.activeElement as HTMLElement | null

    // Visible, focusable descendants in DOM order. getClientRects() drops
    // display:none/hidden nodes and works inside the fixed overlay.
    const focusables = () =>
      Array.from(
        panel?.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      ).filter((el) => el.getClientRects().length > 0)

    // Move focus into the dialog — unless a child already grabbed it (e.g. an
    // input with autoFocus), which we respect.
    if (!panel?.contains(document.activeElement)) {
      ;(focusables()[0] ?? panel)?.focus()
    }

    function onKey(e: KeyboardEvent) {
      // Only the topmost dialog handles keys, so ESC/Tab in a stacked dialog never also fires the one
      // beneath it (which would double-close, and make the two focus traps fight over Tab).
      if (dialogStack[dialogStack.length - 1] !== id) return
      if (e.key === 'Escape') {
        onClose()
        return
      }
      if (e.key !== 'Tab' || !panel) return
      // Trap Tab: wrap between the first and last focusable, and pull focus back
      // in if it has escaped the panel.
      const els = focusables()
      if (els.length === 0) {
        e.preventDefault()
        panel.focus()
        return
      }
      const first = els[0]!
      const last = els[els.length - 1]!
      const active = document.activeElement
      const inside = panel.contains(active)
      if (e.shiftKey) {
        if (!inside || active === first || active === panel) {
          e.preventDefault()
          last.focus()
        }
      } else if (!inside || active === last) {
        e.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      const i = dialogStack.lastIndexOf(id)
      if (i !== -1) dialogStack.splice(i, 1)
      // Only unlock the page when NO dialog remains open; a nested dialog closing must not release the
      // scroll-lock while the one beneath it is still up (its own prevOverflow was captured as 'hidden').
      document.body.style.overflow = dialogStack.length === 0 ? prevOverflow : 'hidden'
      // Restore focus to the trigger on close, if it is still in the document
      // and outside the (now-closing) panel.
      if (previouslyFocused && document.contains(previouslyFocused) && !panel?.contains(previouslyFocused)) {
        previouslyFocused.focus?.()
      }
    }
    // `isClient` is a dep so the effect re-runs once the portal actually mounts (a Dialog rendered with
    // open=true on first paint mounts its panel only after isClient flips true) — otherwise the focus trap
    // would capture a null panel and never re-bind.
  }, [open, onClose, isClient])

  // The theme in force where this dialog was OPENED. The portal below escapes the Space's
  // `[data-space-theme]` div (ADR-578), so without this a Dialog opened from a themed Space page
  // renders in the host palette while a non-portaled StudioWindow beside it renders in the Space's.
  // The sentinel stays in place precisely so there is something left to read the theme from.
  const applySpaceTheme = usePortaledSpaceTheme(anchorRef)

  if (!open || !isClient) return <span ref={anchorRef} hidden aria-hidden="true" />

  // PORTAL TO document.body — the overlay is `position: fixed`, but a `fixed` element anchors to the
  // nearest ancestor with a `transform` / `filter` / `perspective`, not the viewport. Several callers open
  // this from inside the admin rail, which slides in with `transform: translateX(...)` — without the portal
  // the "full-screen" overlay was trapped inside that rail and rendered as a narrow sidebar panel. Portaling
  // to the body escapes every such context so it always covers the true viewport.
  return (
    <>
      <span ref={anchorRef} hidden aria-hidden="true" />
      {createPortal(
    <div
      ref={applySpaceTheme}
      className={cn(
        // z-[80] puts the shared modal in the same tier as the app's other full-screen modals, ABOVE the
        // mobile admin sheet + the page-editor bottom sheet (both z-[70]). At z-[60] a Dialog opened from
        // inside the mobile admin menu (e.g. the Loom image picker off Identity & Branding) rendered BEHIND
        // the opaque sheet while still scroll-locking the body and trapping focus off-screen — so uploading
        // or editing a Space image from mobile looked completely dead. Lightboxes (z-[100]), drawers
        // (z-[150]/[160]) and the impersonation banner (z-[200]) still sit above it, as intended.
        'fixed inset-0 z-[80] flex justify-center overflow-y-auto bg-ink/60 backdrop-blur-sm',
        // `sheet` goes edge-to-edge on mobile (panel fills the viewport), then a centered card at sm+.
        //
        // SAFE AREAS BELONG HERE, not in each caller. This primitive padded by a flat 16px (and
        // `sheet` by nothing at all), so on a notched phone a sheet's controls sat on the home
        // indicator and a centred dialog's did too -- which is why report-dialog, invite-launcher
        // and capture-launcher each re-solved it by hand and each landed somewhere different.
        align === 'sheet'
          ? 'items-stretch p-0 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] sm:items-center sm:p-8'
          : cn(
              'p-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))] sm:p-8',
              align === 'center' ? 'items-center' : 'items-start',
            ),
      )}
      // Close on a true backdrop CLICK (press AND release both on the backdrop), not on mousedown. On touch,
      // mousedown-to-close dismissed the dialog on the first tap/scroll that began near the panel edge; and a
      // text-selection drag that ended on the backdrop closed it too. Tracking down+up fixes both.
      onMouseDown={(e) => {
        downOnBackdropRef.current = e.target === e.currentTarget
      }}
      onMouseUp={(e) => {
        if (downOnBackdropRef.current && e.target === e.currentTarget) onClose()
        downOnBackdropRef.current = false
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        tabIndex={-1}
        className={cn(
          'w-full outline-none motion-safe:animate-[slideUp_0.3s_ease-out]',
          align === 'sheet' ? 'sm:my-auto' : align === 'center' ? 'my-auto' : 'mt-[6vh]',
          className,
        )}
      >
        {children}
      </div>
    </div>,
        document.body,
      )}
    </>
  )
}
