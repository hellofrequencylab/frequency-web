'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { X, BookOpen } from 'lucide-react'
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
      {/* No desktop button — Capture lives in the mobile centre-nav; on web the feed's
          inline Capture box is the entry. This component only hosts the modal. */}
      {open && (
        <div
          className="fixed inset-0 z-[70] flex items-stretch justify-center bg-black/70 backdrop-blur-sm sm:items-center sm:p-4"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) close()
          }}
        >
          {/* Full-screen on mobile, a centred card on desktop. */}
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Capture a moment"
            className="relative flex w-full flex-col overflow-y-auto border-border bg-canvas p-4 shadow-2xl motion-safe:animate-[slideUp_0.25s_ease-out] sm:max-h-[90vh] sm:max-w-md sm:rounded-3xl sm:border"
            style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
          >
            <div className="mb-1 flex items-center justify-between px-1 pt-[max(0px,env(safe-area-inset-top))]">
              <p className="text-base font-bold text-text">Capture a moment</p>
              <button
                type="button"
                onClick={close}
                aria-label="Close"
                className="rounded-full p-1.5 text-subtle transition-colors hover:bg-surface-elevated hover:text-text"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="mb-3 px-1 text-xs leading-relaxed text-muted">
              Log a moment as it happens — add a contact to your CRM, or share a post, note, or photo.
              It lands in your journal and the community feed.
            </p>

            <CaptureBox key={mode} scopeId={scopeId} visibility="public" defaultMode={mode} />

            <Link
              href="/journal"
              onClick={close}
              className="mt-3 flex items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold text-subtle transition-colors hover:bg-surface-elevated hover:text-text"
            >
              <BookOpen className="h-3.5 w-3.5" aria-hidden /> View your journal
            </Link>
          </div>
        </div>
      )}
    </>
  )
}
