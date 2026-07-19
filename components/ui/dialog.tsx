'use client'

import { useEffect, useRef, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

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
  /** Vertical placement. `top` (default) pins the panel near the top (every existing caller). `center`
   *  centers it in the viewport — for a big center-screen modal like the Loom picker. */
  align?: 'top' | 'center'
}) {
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const panel = panelRef.current

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
      document.body.style.overflow = prevOverflow
      // Restore focus to the trigger on close, if it is still in the document
      // and outside the (now-closing) panel.
      if (previouslyFocused && document.contains(previouslyFocused) && !panel?.contains(previouslyFocused)) {
        previouslyFocused.focus?.()
      }
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className={cn(
        'fixed inset-0 z-[60] flex justify-center overflow-y-auto bg-black/60 p-4 backdrop-blur-sm sm:p-8',
        align === 'center' ? 'items-center' : 'items-start',
      )}
      onMouseDown={onClose}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        tabIndex={-1}
        onMouseDown={(e) => e.stopPropagation()}
        className={cn('w-full outline-none motion-safe:animate-[slideUp_0.3s_ease-out]', align === 'center' ? 'my-auto' : 'mt-[6vh]', className)}
      >
        {children}
      </div>
    </div>
  )
}
