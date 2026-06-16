'use client'

import { useEffect, type ReactNode } from 'react'
import { X } from 'lucide-react'

// The Studio — the one familiar "creation window" reused across the site. Anywhere
// there's something to make (a journey today; circles, practices, events next), the
// same shell launches: an overlay panel (full-screen on mobile) with a top chrome
// bar, a scrollable body the entity fills with its tools, and a sticky footer action
// bar. Entity-specific content + footer are passed in; the chrome, focus-trap-lite,
// Esc-to-close, scroll-lock, and feel are shared. See docs ADR-142.
//
// Reuse for a new entity: render <StudioWindow eyebrow="Studio · Circle" footer={…}>
// with that entity's tool components as children — no new chrome.

export function StudioWindow({
  open,
  onClose,
  eyebrow,
  children,
  footer,
  closeLabel = 'Close',
}: {
  open: boolean
  onClose: () => void
  /** Small kicker top-left, e.g. "Studio · Journey". */
  eyebrow?: ReactNode
  children: ReactNode
  /** Sticky bottom action bar (save state · primary actions). */
  footer?: ReactNode
  closeLabel?: string
}) {
  // Esc to close + lock the page scroll behind the window while open.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[80] flex items-stretch justify-center bg-black/50 backdrop-blur-sm sm:items-center sm:p-4 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-150"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
      role="dialog"
      aria-modal="true"
    >
      {/* Desktop: size to the content (a quick "name it" create step stays a compact card),
          capped at 86vh so a full builder scrolls instead of overflowing. */}
      <div className="flex h-full w-full flex-col overflow-hidden bg-canvas shadow-2xl sm:h-auto sm:max-h-[86vh] sm:max-w-3xl sm:rounded-3xl sm:border sm:border-border">
        {/* Chrome bar */}
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-widest text-primary-strong">{eyebrow}</p>
          <button
            type="button"
            onClick={onClose}
            aria-label={closeLabel}
            className="rounded-full p-1.5 text-subtle transition-colors hover:bg-surface-elevated hover:text-text"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body — the entity's tools */}
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6">{children}</div>

        {/* Sticky footer action bar */}
        {footer && (
          <div className="shrink-0 border-t border-border bg-surface/80 px-4 py-3 backdrop-blur">{footer}</div>
        )}
      </div>
    </div>
  )
}
