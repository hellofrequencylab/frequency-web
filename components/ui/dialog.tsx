'use client'

import { useEffect, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

// Shared modal/overlay shell — one place for the backdrop, centering, ESC +
// backdrop-click to close, body scroll-lock, and dialog a11y. Replaces the
// per-modal hand-rolled overlays the audit flagged. The caller renders its own
// panel (card) as children and sets the width via `className` (e.g. `max-w-lg`);
// this owns only the chrome.
export function Dialog({
  open,
  onClose,
  children,
  ariaLabel,
  className,
}: {
  open: boolean
  onClose: () => void
  children: ReactNode
  /** Accessible name when the panel has no visible heading to point at. */
  ariaLabel?: string
  /** Panel sizing / extras — pass a `max-w-*` (the panel is `w-full` otherwise). */
  className?: string
}) {
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-black/60 p-4 backdrop-blur-sm sm:p-8"
      onMouseDown={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        onMouseDown={(e) => e.stopPropagation()}
        className={cn('mt-[6vh] w-full outline-none motion-safe:animate-[slideUp_0.3s_ease-out]', className)}
      >
        {children}
      </div>
    </div>
  )
}
