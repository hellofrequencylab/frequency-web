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
import { loadOnAirSession } from '@/app/(main)/on-air/actions'
import type { OnAirSessionData } from '@/lib/on-air/session-data'
import { OnAirSession } from '@/components/on-air/session'
import { LotusIcon } from '@/components/on-air/icons'

interface MindlessApi {
  /** Open the overlay; `practiceId` pre-selects an adopted practice. */
  open: (opts?: { practiceId?: string }) => void
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

type OverlayState =
  | { phase: 'closed' }
  | { phase: 'loading'; practiceId?: string }
  | { phase: 'ready'; data: OnAirSessionData }
  | { phase: 'error' }

export function MindlessProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [state, setState] = useState<OverlayState>({ phase: 'closed' })

  // Closing the overlay refreshes the page underneath so anything the sit just changed (a practice
  // logged, the streak) lands without a navigation — e.g. a Journey step's "logged today" gating
  // (docs/JOURNEYS.md) clears the moment the timer overlay closes. A no-op when nothing changed.
  const close = useCallback(() => {
    setState({ phase: 'closed' })
    router.refresh()
  }, [router])

  const open = useCallback((opts?: { practiceId?: string }) => {
    setState({ phase: 'loading', practiceId: opts?.practiceId })
  }, [])

  // Load the member's setup state on open. The request is tied to a token so a
  // close (or a second open) before the load lands is ignored, never flashing
  // a stale overlay.
  useEffect(() => {
    if (state.phase !== 'loading') return
    let live = true
    const requestedPracticeId = state.practiceId
    void (async () => {
      const result = await loadOnAirSession(requestedPracticeId)
      if (!live) return
      if (isError(result)) {
        setState({ phase: 'error' })
        return
      }
      setState({ phase: 'ready', data: result.data })
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
    <div className="fixed inset-0 z-50 overflow-y-auto bg-canvas">
      <div className="mx-auto flex min-h-full w-full max-w-md flex-col px-6 py-5">
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
