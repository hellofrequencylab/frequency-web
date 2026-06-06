'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Camera, X, BookOpen } from 'lucide-react'
import { CaptureBox } from './capture-box'

type Mode = 'post' | 'note' | 'photo' | 'contact'

// Capture — the app-wide primary action (ADR-155/156a). Two triggers, one modal:
//   • mobile  → the raised centre-nav button (MobileTabBar) dispatches 'open-capture'
//     (contact-forward — you're out meeting people);
//   • desktop → a floating FAB (the mobile tab bar isn't there).
// The modal is always mounted so either trigger can open it from any page. Posts
// default to the member's wall.
export function CaptureLauncher({ scopeId }: { scopeId: string }) {
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<Mode>('post')
  const pathname = usePathname()
  // The feed carries the inline Capture box, so the desktop FAB is redundant there.
  const showFab = pathname !== '/feed'

  const close = useCallback(() => setOpen(false), [])

  // The centre-nav button (and anything else) opens the modal via a window event,
  // optionally requesting a starting mode.
  useEffect(() => {
    const onOpen = (e: Event) => {
      const m = (e as CustomEvent).detail?.mode as Mode | undefined
      setMode(m ?? 'post')
      setOpen(true)
    }
    window.addEventListener('open-capture', onOpen)
    return () => window.removeEventListener('open-capture', onOpen)
  }, [])

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

  return (
    <>
      {/* Desktop FAB (mobile uses the centre-nav button instead). */}
      {showFab && (
        <button
          type="button"
          onClick={() => {
            setMode('post')
            setOpen(true)
          }}
          aria-label="Capture a moment"
          className="fixed bottom-6 left-1/2 z-40 hidden h-14 w-14 -translate-x-1/2 items-center justify-center rounded-full bg-primary text-on-primary shadow-pop transition-transform hover:scale-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus-ring)] md:inline-flex"
        >
          <Camera className="h-6 w-6" aria-hidden />
        </button>
      )}

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

            <CaptureBox key={mode} scopeId={scopeId} visibility="public" defaultMode={mode} />

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
