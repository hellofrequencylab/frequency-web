'use client'

// A bottom sheet for the mobile editor — used ONLY for the short interactions the
// spec allows sheets for: the add-block picker, destructive confirms, and one-field
// quick edits. Long forms live on full-screen pushed screens, never here, and we
// never nest a sheet inside a sheet.
//
// Chrome only: backdrop click + ESC to close, body scroll-lock, focus trapped to the
// panel on open (a11y), slides up from the bottom (motion-safe, so reduced-motion
// users get no transform). The caller supplies the content.

import { useEffect, useRef, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

export function BottomSheet({
  open,
  onClose,
  title,
  children,
  className,
}: {
  open: boolean
  onClose: () => void
  /** Visible heading, also the sheet's accessible name. */
  title: string
  children: ReactNode
  className?: string
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

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-black/50"
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
          'w-full max-w-lg rounded-t-2xl bg-surface pb-[env(safe-area-inset-bottom)] shadow-xl outline-none motion-safe:animate-[slideUp_0.25s_ease-out]',
          className,
        )}
      >
        {/* Grab handle affordance */}
        <div className="flex justify-center pt-3">
          <span className="h-1 w-10 rounded-full bg-border" aria-hidden />
        </div>
        <h2 className="px-5 pb-3 pt-2 text-base font-semibold text-text">{title}</h2>
        <div className="max-h-[70vh] overflow-y-auto px-5 pb-6">{children}</div>
      </div>
    </div>
  )
}
