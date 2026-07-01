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
// Chrome only: backdrop click + ESC to close, body scroll-lock, focus moved into the
// panel on open (a11y), slides up from the bottom (motion-safe). Caller supplies content.

import { useEffect, useRef, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

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

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    // Move focus into the sheet so keyboard + screen-reader users land inside it.
    const t = window.setTimeout(() => panelRef.current?.focus(), 0)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
      window.clearTimeout(t)
    }
  }, [open, onClose])

  if (!open) return null

  const tall = size === 'tall'

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-[70] flex items-end justify-center bg-black/50"
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
          'flex w-full max-w-lg flex-col rounded-t-2xl bg-surface pb-[env(safe-area-inset-bottom)] shadow-xl outline-none motion-safe:animate-[slideUp_0.25s_ease-out]',
          tall && 'max-h-[85dvh]',
          className,
        )}
      >
        {/* Grab handle affordance */}
        <div className="flex shrink-0 justify-center pt-3">
          <span className="h-1 w-10 rounded-full bg-border" aria-hidden />
        </div>
        <div className="flex shrink-0 items-center justify-between gap-3 px-5 pb-3 pt-2">
          <h2 className="text-base font-semibold text-text">{title}</h2>
          {headerAction}
        </div>
        <div className={cn('overflow-y-auto px-5 pb-6', tall ? 'min-h-0 flex-1' : 'max-h-[70vh]')}>
          {children}
        </div>
      </div>
    </div>
  )
}
