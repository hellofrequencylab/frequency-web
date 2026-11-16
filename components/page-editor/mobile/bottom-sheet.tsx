'use client'

// A bottom sheet for the mobile editor. Two sizes:
//   · 'auto' (default) — short interactions the spec allows sheets for: the add-block
//      picker, destructive confirms, one-field quick edits. Content-height, capped.
//   · 'tall'           — the Discord-style dock panels (Blocks list, injected panels).
//      Animates up from the bottom, caps at ~85dvh with internal scroll and a drag
//      handle, and DELIBERATELY does not cover the whole screen: it sits above the live
//      preview but never over the editor's top bar (no `fixed inset-0` blackout here —
//      the backdrop starts below the top bar so the bar stays visible + tappable).
//
// Long block forms still live on full-screen pushed screens, never here, and we never
// nest a sheet inside a sheet.
//
// Chrome only: backdrop click + ESC to close, body scroll-lock, slides up from the bottom
// (motion-safe). Focus is the kit trap's (components/ui/use-dialog-focus-trap): Tab stays inside
// the panel and focus returns to the trigger on close (a11y). Caller supplies content.

import { useEffect, useRef, type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { useDialogFocusTrap } from '@/components/ui/use-dialog-focus-trap'

export function BottomSheet({
  open,
  onClose,
  title,
  children,
  className,
  size = 'auto',
  /** When set, the top of the backdrop starts this far below the viewport top, so a
   *  sticky top bar of that height stays visible and interactive above the sheet. */
  topInsetPx,
  /** Optional action rendered inline with the title (e.g. a prominent "Add block"). */
  headerAction,
}: {
  open: boolean
  onClose: () => void
  /** Visible heading, also the sheet's accessible name. */
  title: string
  children: ReactNode
  className?: string
  size?: 'auto' | 'tall'
  topInsetPx?: number
  headerAction?: ReactNode
}) {
  const panelRef = useRef<HTMLDivElement>(null)

  // The latest close handler, so the effect below does not rebind (and re-steal focus) on every render.
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  // The kit trap runs first: it remembers the trigger (WCAG 2.4.3), keeps Tab inside the sheet and
  // hands focus back on close. The effect below then puts focus on the PANEL, not its first field,
  // so a quick-edit sheet does not raise the phone keyboard just by opening.
  useDialogFocusTrap(open, panelRef)

  useEffect(() => {
    if (!open) return
    const panel = panelRef.current
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onCloseRef.current()
    }
    document.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    // Move focus onto the sheet so keyboard + screen-reader users land inside it: now, and again
    // after the opening tap has finished settling its own focus.
    panel?.focus()
    const t = window.setTimeout(() => panel?.focus(), 0)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
      window.clearTimeout(t)
    }
  }, [open])

  if (!open) return null

  const tall = size === 'tall'

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-[70] flex items-end justify-center bg-ink/50"
      style={topInsetPx ? { top: topInsetPx } : { top: 0 }}
      onMouseDown={onClose}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(e) => e.stopPropagation()}
        className={cn(
          'flex w-full max-w-lg flex-col rounded-t-card bg-surface pb-[env(safe-area-inset-bottom)] shadow-xl outline-none motion-safe:animate-[slideUp_0.25s_ease-out]',
          tall && 'max-h-[85dvh]',
          className,
        )}
      >
        {/* Grab handle affordance */}
        <div className="flex shrink-0 justify-center pt-3">
          <span className="h-1 w-10 rounded-pill bg-border" aria-hidden />
        </div>
        <div className="flex shrink-0 items-center justify-between gap-3 px-5 pb-3 pt-2">
          <h2 className="text-body font-semibold text-text">{title}</h2>
          {headerAction}
        </div>
        <div className={cn('overflow-y-auto px-5 pb-6', tall ? 'min-h-0 flex-1' : 'max-h-[70vh]')}>
          {children}
        </div>
      </div>
    </div>
  )
}
