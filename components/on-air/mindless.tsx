'use client'

// Mindless — the global timer overlay (ADR-229, docs/ON-AIR.md). The same
// On Air session, launchable from anywhere via the header, layered over the
// whole site instead of routed to. OnAirSession is already a `fixed inset-0
// z-50` takeover, so the provider just decides WHEN it's mounted and feeds it
// the member's setup state (loaded on open through a server action), then
// hands it `onExit` so leaving closes the overlay in place rather than
// navigating.

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { X } from 'lucide-react'
import { isError } from '@/lib/action-result'
import { requestAppFullscreen, exitAppFullscreen } from '@/lib/fullscreen'
import { loadOnAirSession } from '@/app/(main)/on-air/actions'
import type { OnAirSessionData } from '@/lib/on-air/session-data'
import { OnAirSession } from '@/components/on-air/session'
import { LotusIcon } from '@/components/on-air/icons'

/** What `open` accepts. `practiceId` pre-selects an adopted practice (and the timer opens
 *  at that practice's mindless_mode). A "Finish Practice" resume passes BOTH `resumeFromSec`
 *  (how far the partial sit already got) and `secondsTarget` (the practice's full length): the
 *  timer then runs only the REMAINING time and, on completion, reports the TOTAL seconds so the
 *  server tops the partial log up to complete. */
export interface MindlessOpenOpts {
  practiceId?: string
  /** Seconds already banked on a partial log today (the "Finish Practice" resume). */
  resumeFromSec?: number
  /** The full target length in seconds (the practice's authored duration). */
  secondsTarget?: number
}

interface MindlessApi {
  /** Open the overlay. See MindlessOpenOpts: pre-select a practice + its mode, or resume a
   *  partial sit (`resumeFromSec` + `secondsTarget`) to finish the remaining time. */
  open: (opts?: MindlessOpenOpts) => void
  close: () => void
}

const MindlessContext = createContext<MindlessApi | null>(null)

/** The overlay launcher API. Available to anything under <MindlessProvider>
 *  (the header and every in-app page). */
export function useMindless(): MindlessApi {
  const ctx = useContext(MindlessContext)
  if (!ctx) {
    throw new Error('useMindless must be used within a MindlessProvider')
  }
  return ctx
}

// A resume carries the partial sit's progress + full target so the live timer runs the
// REMAINING time and reports the TOTAL on completion (the server tops the log up to full).
interface ResumeInfo {
  resumeFromSec: number
  secondsTarget: number
}

type OverlayState =
  | { phase: 'closed' }
  | { phase: 'loading'; practiceId?: string; resume?: ResumeInfo }
  | { phase: 'ready'; data: OnAirSessionData; resume?: ResumeInfo }
  | { phase: 'error' }

export function MindlessProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [state, setState] = useState<OverlayState>({ phase: 'closed' })

  // Closing the overlay refreshes the page underneath so anything the sit just changed (a practice
  // logged, the streak) lands without a navigation — e.g. a Journey step's "logged today" gating
  // (docs/JOURNEYS.md) clears the moment the timer overlay closes. A no-op when nothing changed.
  const close = useCallback(() => {
    // Drop true fullscreen if the open gesture entered it (C.1-3); the dvh takeover
    // is unmounted with the overlay.
    void exitAppFullscreen()
    setState({ phase: 'closed' })
    router.refresh()
  }, [router])

  const open = useCallback((opts?: MindlessOpenOpts) => {
    // Go fullscreen straight from the click that opened the overlay — fullscreen is
    // gesture-gated, so it has to ride the same tap, not a later effect (C.1-3).
    // Best-effort: iOS Safari no-ops and the dvh takeover is the fallback.
    void requestAppFullscreen()
    // A resume needs BOTH the progress + the full target to compute the remaining time;
    // anything partial is ignored so a malformed call just opens a normal sit.
    const resume =
      typeof opts?.resumeFromSec === 'number' &&
      typeof opts?.secondsTarget === 'number' &&
      opts.secondsTarget > 0 &&
      opts.resumeFromSec >= 0
        ? { resumeFromSec: Math.round(opts.resumeFromSec), secondsTarget: Math.round(opts.secondsTarget) }
        : undefined
    setState({ phase: 'loading', practiceId: opts?.practiceId, resume })
  }, [])

  // Load the member's setup state on open. The request is tied to a token so a
  // close (or a second open) before the load lands is ignored, never flashing
  // a stale overlay.
  useEffect(() => {
    if (state.phase !== 'loading') return
    let live = true
    const requestedPracticeId = state.practiceId
    const requestedResume = state.resume
    void (async () => {
      const result = await loadOnAirSession(requestedPracticeId)
      if (!live) return
      if (isError(result)) {
        setState({ phase: 'error' })
        return
      }
      setState({ phase: 'ready', data: result.data, resume: requestedResume })
    })()
    return () => {
      live = false
    }
  }, [state])

  // Lock body scroll while the overlay owns the viewport — the page behind
  // shouldn't scroll under the takeover. Restores whatever was there before.
  useEffect(() => {
    if (state.phase === 'closed') return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [state.phase])

  // Esc closes the loading / error / empty states (the live session has its
  // own close affordances and shouldn't be torn out of a sit by a stray key).
  useEffect(() => {
    if (state.phase === 'closed') return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [state.phase, close])

  const api = useMemo<MindlessApi>(() => ({ open, close }), [open, close])

  return (
    <MindlessContext.Provider value={api}>
      {children}
      {state.phase === 'loading' && (
        <MindlessShell>
          <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4">
            <LotusIcon className="h-8 w-8 animate-pulse text-primary" />
            <p className="text-sm font-medium text-muted">Settling in...</p>
          </div>
        </MindlessShell>
      )}
      {state.phase === 'error' && (
        <MindlessShell onClose={close}>
          <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
            <p className="text-sm font-medium text-text">That didn&rsquo;t open. Give it another go.</p>
            <button
              type="button"
              onClick={() => open()}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary hover:bg-primary-hover"
            >
              Try again
            </button>
          </div>
        </MindlessShell>
      )}
      {state.phase === 'ready' &&
        (state.data.practices.length === 0 ? (
          <MindlessShell onClose={close}>
            <div className="flex min-h-[60vh] flex-col items-center justify-center">
              <div className="w-full rounded-2xl border border-border bg-surface p-6 text-center">
                <p className="text-sm font-medium text-text">Nothing on your list yet.</p>
                <p className="mt-1 text-sm text-muted">
                  Adopt a practice first; then this is where you do it.
                </p>
                <Link
                  href="/practices"
                  onClick={close}
                  className="mt-4 inline-block rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary hover:bg-primary-hover"
                >
                  Browse practices
                </Link>
              </div>
            </div>
          </MindlessShell>
        ) : (
          <OnAirSession
            practices={state.data.practices}
            defaultPracticeId={state.data.defaultPracticeId}
            prefs={state.data.prefs}
            practicedToday={state.data.practicedToday}
            resumeFromSec={state.resume?.resumeFromSec}
            secondsTarget={state.resume?.secondsTarget}
            onExit={close}
          />
        ))}
    </MindlessContext.Provider>
  )
}

/** The takeover frame for the overlay's NON-session states (loading, error,
 *  empty) — matches OnAirSession's own `fixed inset-0 z-50` shell so the
 *  hand-off into the live session is seamless. */
function MindlessShell({
  children,
  onClose,
}: {
  children: React.ReactNode
  onClose?: () => void
}) {
  return (
    <div className="fixed inset-x-0 top-0 z-50 h-[100dvh] overflow-y-auto bg-canvas">
      <div className="mx-auto flex min-h-[100dvh] w-full max-w-md flex-col px-6 py-5">
        {onClose && (
          <div className="flex justify-end">
            <button
              type="button"
              onClick={onClose}
              aria-label="Close Mindless"
              className="rounded-full p-2 text-subtle transition-colors hover:bg-surface-elevated hover:text-text"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
        <div className="flex flex-1 flex-col">{children}</div>
      </div>
    </div>
  )
}
