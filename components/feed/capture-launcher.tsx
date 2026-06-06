'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Camera, X, BookOpen } from 'lucide-react'
import { CaptureBox } from './capture-box'

// Capture — the app-wide primary action (§6 Phase 2, the rework). A raised FAB
// (bottom-centre, clear of the Vera launcher + chores pill) opens the Capture box
// in a modal so you can log a moment — or a contact — from anywhere. On mobile this
// is the centre-nav button; it opens contact-forward (you're out meeting people).
// Posts default to your wall.

export function CaptureLauncher({ scopeId }: { scopeId: string }) {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()
  // The feed already carries the inline Capture box; don't double up there.
  const hidden = pathname === '/feed'

  const close = useCallback(() => setOpen(false), [])

  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      document.removeEventListener('keydown', onKey)
    }
  }, [open, close])

  if (hidden) return null

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Capture a moment"
        className="fixed left-1/2 z-40 inline-flex h-14 w-14 -translate-x-1/2 items-center justify-center rounded-full bg-primary text-on-primary shadow-pop transition-transform hover:scale-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus-ring)] bottom-[calc(4rem+env(safe-area-inset-bottom)+0.75rem)] md:bottom-6"
      >
        <Camera className="h-6 w-6" aria-hidden />
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[70] flex items-end justify-center bg-black/70 p-4 backdrop-blur-sm sm:items-center"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) close()
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Capture a moment"
            className="relative w-full max-w-md rounded-3xl border border-border bg-canvas p-4 shadow-2xl motion-safe:animate-[slideUp_0.25s_ease-out]"
          >
            <div className="mb-2 flex items-center justify-between px-1">
              <p className="text-sm font-semibold text-text">Capture a moment</p>
              <button
                type="button"
                onClick={close}
                aria-label="Close"
                className="rounded-full p-1 text-subtle transition-colors hover:bg-surface-elevated hover:text-text"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <CaptureBox scopeId={scopeId} visibility="public" />

            <Link
              href="/journal"
              onClick={close}
              className="mt-2 flex items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold text-subtle transition-colors hover:bg-surface-elevated hover:text-text"
            >
              <BookOpen className="h-3.5 w-3.5" aria-hidden /> View your journal
            </Link>
          </div>
        </div>
      )}
    </>
  )
}
