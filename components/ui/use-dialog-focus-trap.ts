'use client'

import { useEffect, type RefObject } from 'react'

// Focus management for hand-rolled dialogs that already own their backdrop, ESC, and
// scroll-lock but predate the shared ui/Dialog focus trap (e.g. the bottom-sheet-on-mobile
// modals whose layout the centered Dialog can't express). Give it the panel ref + whether the
// dialog is open, and it: moves focus into the panel on open (unless a child grabbed it, e.g.
// autoFocus), keeps Tab cycling inside the panel, and restores focus to the trigger on close.
// Mirrors ui/Dialog so every modal surface traps focus identically. Escape + scroll-lock stay
// with the caller, so this is purely additive.
export function useDialogFocusTrap<T extends HTMLElement>(
  open: boolean,
  panelRef: RefObject<T | null>,
) {
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
    return () => {
      document.removeEventListener('keydown', onKey)
      // Restore focus to the trigger on close, if it is still in the document
      // and outside the (now-closing) panel.
      if (
        previouslyFocused &&
        document.contains(previouslyFocused) &&
        !panel?.contains(previouslyFocused)
      ) {
        previouslyFocused.focus?.()
      }
    }
  }, [open, panelRef])
}
