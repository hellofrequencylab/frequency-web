'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useRouter, usePathname } from 'next/navigation'
import { Camera, ArrowLeft, X, BookOpen } from 'lucide-react'
import { Composer } from './composer'
import { CAPTURE_MODES, type CaptureMode } from './capture-bar'

// Capture — the app-wide primary action (§6 Phase 2, ADR-155/156). Promotes Capture
// from the feed-only bar to a loud, always-reachable button: a raised FAB docked
// bottom-centre (above the mobile tab bar; floating on desktop), clear of the Vera
// launcher (right) and chores pill (left). Opens the same mode picker in a modal so
// you can log a moment from anywhere in the app. Posts default to your wall (public).

type Live = Exclude<CaptureMode, 'in_person'>

export function CaptureLauncher({ scopeId }: { scopeId: string }) {
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<Live | null>(null)
  const router = useRouter()
  const pathname = usePathname()
  // The feed already carries the inline Capture bar; don't double up there.
  const hidden = pathname === '/feed'

  const close = useCallback(() => {
    setOpen(false)
    setMode(null)
  }, [])

  // ESC closes; lock body scroll while the modal is up.
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
      {/* The dock: a raised circular Capture button. Bottom-centre so it never
          collides with Vera (right) or the chores pill (left). */}
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
            className="relative w-full max-w-md overflow-hidden rounded-3xl border border-border bg-surface p-4 shadow-2xl motion-safe:animate-[slideUp_0.25s_ease-out]"
          >
            <div className="mb-3 flex items-center justify-between px-1">
              {mode ? (
                <button
                  type="button"
                  onClick={() => setMode(null)}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-subtle transition-colors hover:text-text"
                >
                  <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> Capture
                </button>
              ) : (
                <p className="text-sm font-semibold text-text">Capture a moment</p>
              )}
              <button
                type="button"
                onClick={close}
                aria-label="Close"
                className="rounded-full p-1 text-subtle transition-colors hover:bg-surface-elevated hover:text-text"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {mode ? (
              <Composer
                scopeId={scopeId}
                visibility="public"
                kind={mode === 'note' ? 'note' : 'post'}
                autoImage={mode === 'photo'}
                placeholder={mode === 'note' ? 'Jot a note — what happened, what you noticed…' : 'What’s on your mind?'}
              />
            ) : (
              <>
              <div className="grid grid-cols-2 gap-2">
                {CAPTURE_MODES.map((m) => (
                  <button
                    key={m.key}
                    type="button"
                    onClick={() => (m.href ? (close(), router.push(m.href)) : setMode(m.key as Live))}
                    className="flex items-center gap-3 rounded-xl border border-border bg-surface px-3 py-2.5 text-left transition-colors hover:border-broadcast hover:bg-broadcast-bg/30"
                  >
                    <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-broadcast-bg text-broadcast-strong">
                      <m.icon className="h-4 w-4" aria-hidden />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-text">{m.label}</span>
                      <span className="block truncate text-xs text-muted">{m.hint}</span>
                    </span>
                  </button>
                ))}
              </div>
              <Link
                href="/journal"
                onClick={close}
                className="mt-2 flex items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold text-subtle transition-colors hover:bg-surface-elevated hover:text-text"
              >
                <BookOpen className="h-3.5 w-3.5" aria-hidden /> View your journal
              </Link>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}
