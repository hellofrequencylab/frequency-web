'use client'

// Movement — the global Movement timer overlay (WEBSITE-CHANGES-PLAN §4 C.6),
// the sibling of components/on-air/mindless.tsx. The same On Air session data
// (practices to log + presence), but driven by the Movement engine instead of
// the sit. The provider decides WHEN MovementSession is mounted, loads the
// member's practice list through the shared loadOnAirSession action, and hands
// it `onExit` so leaving closes the overlay in place rather than navigating.
//
// open({ practiceId, mode, resumeFromSec, secondsTarget }) pre-selects a practice
// to log against and the Movement mode to open on (a practice's movement_config.mode
// routes here). resumeFromSec + secondsTarget drive a "Finish Practice" resume: the
// live timer runs the REMAINING time and banks resumeFromSec + this session's elapsed.

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { X } from 'lucide-react'
import { isError } from '@/lib/action-result'
import { requestAppFullscreen, exitAppFullscreen } from '@/lib/fullscreen'
import { loadOnAirSession } from '@/app/(main)/on-air/actions'
import type { OnAirSessionData } from '@/lib/on-air/session-data'
import { MovementSession } from '@/components/on-air/movement-session'
import { MovementArt } from '@/components/feed/zap-menu-art'
import type { MovementMode } from '@/lib/movement'
import { loadLiveSession } from '@/lib/on-air/live-session'

interface MovementApi {
  /** Open the overlay. `practiceId` pre-selects an adopted practice; `mode` the
   *  Movement mode to open on (else the practice's movement_config.mode, else Walk).
   *  `resumeFromSec` + `secondsTarget` open a "Finish Practice" resume: the live timer
   *  runs the REMAINING time and banks `resumeFromSec` + this session's elapsed as the
   *  total reported to completeSession. */
  open: (opts?: {
    practiceId?: string
    mode?: MovementMode
    resumeFromSec?: number
    secondsTarget?: number
  }) => void
  close: () => void
}

const MovementContext = createContext<MovementApi | null>(null)

/** The overlay launcher API. Available to anything under <MovementProvider>. */
export function useMovement(): MovementApi {
  const ctx = useContext(MovementContext)
  if (!ctx) {
    throw new Error('useMovement must be used within a MovementProvider')
  }
  return ctx
}

type OverlayState =
  | { phase: 'closed' }
  | { phase: 'loading'; practiceId?: string; mode?: MovementMode; generic?: boolean; resumeFromSec?: number; secondsTarget?: number }
  | { phase: 'ready'; data: OnAirSessionData; mode?: MovementMode; generic?: boolean; resumeFromSec?: number; secondsTarget?: number }
  | { phase: 'error' }

export function MovementProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [state, setState] = useState<OverlayState>({ phase: 'closed' })

  const close = useCallback(() => {
    void exitAppFullscreen()
    setState({ phase: 'closed' })
    router.refresh()
  }, [router])

  const open = useCallback(
    (opts?: { practiceId?: string; mode?: MovementMode; resumeFromSec?: number; secondsTarget?: number }) => {
      // Fullscreen rides the same tap that opened the overlay (gesture-gated).
      void requestAppFullscreen()
      // A GENERIC open (the ZAP button / Movement tile: no practice, no mode) opens
      // NEUTRAL on Free Practice (ADR-354, the Movement parallel to Mindless's Free
      // sit). A SPECIFIC entry carries a practiceId (and usually its mode), which
      // pre-selects that practice + its movement mode below.
      const generic = !opts?.practiceId && !opts?.mode
      setState({
        phase: 'loading',
        practiceId: opts?.practiceId,
        mode: opts?.mode,
        generic,
        resumeFromSec: opts?.resumeFromSec,
        secondsTarget: opts?.secondsTarget,
      })
    },
    [],
  )

  // Load the member's practice list on open. Tied to a token so a close (or a
  // second open) before the load lands is ignored.
  useEffect(() => {
    if (state.phase !== 'loading') return
    let live = true
    const requestedPracticeId = state.practiceId
    const requestedMode = state.mode
    const requestedGeneric = state.generic
    const requestedResumeFromSec = state.resumeFromSec
    const requestedSecondsTarget = state.secondsTarget
    void (async () => {
      const result = await loadOnAirSession(requestedPracticeId)
      if (!live) return
      if (isError(result)) {
        setState({ phase: 'error' })
        return
      }
      setState({
        phase: 'ready',
        data: result.data,
        mode: requestedMode,
        generic: requestedGeneric,
        resumeFromSec: requestedResumeFromSec,
        secondsTarget: requestedSecondsTarget,
      })
    })()
    return () => {
      live = false
    }
  }, [state])

  // Lock body scroll while the overlay owns the viewport.
  useEffect(() => {
    if (state.phase === 'closed') return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [state.phase])

  // Esc closes the non-session states (the live session has its own affordances).
  useEffect(() => {
    if (state.phase === 'closed') return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [state.phase, close])

  // Crash recovery: a tab discard drops a running Movement run (its React state is gone), but the
  // record survives in localStorage. On the next app load, re-open the overlay so MovementSession
  // can surface its Resume prompt. Runs once on mount; the overlay then owns the recovery UX.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (loadLiveSession('movement')) open()
  }, [open])

  // Cross-provider handoff: the Mindless overlay (a sibling provider it can't call
  // through this hook) routes a movement practice here by dispatching an `open-movement`
  // window event carrying the same open() args. Mirror them into open().
  useEffect(() => {
    function onOpen(e: Event) {
      const detail = (e as CustomEvent).detail as
        | { practiceId?: string; mode?: MovementMode; resumeFromSec?: number; secondsTarget?: number }
        | undefined
      open(detail ?? undefined)
    }
    window.addEventListener('open-movement', onOpen as EventListener)
    return () => window.removeEventListener('open-movement', onOpen as EventListener)
  }, [open])

  const api = useMemo<MovementApi>(() => ({ open, close }), [open, close])

  return (
    <MovementContext.Provider value={api}>
      {children}
      {state.phase === 'loading' && (
        <MovementShell>
          <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4">
            <MovementArt className="block h-10 animate-pulse" />
            <p className="text-sm font-medium text-muted">Lacing up...</p>
          </div>
        </MovementShell>
      )}
      {state.phase === 'error' && (
        <MovementShell onClose={close}>
          <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
            <p className="text-sm font-medium text-text">That did not open. Give it another go.</p>
            <button
              type="button"
              onClick={() => open()}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary hover:bg-primary-hover"
            >
              Try again
            </button>
          </div>
        </MovementShell>
      )}
      {state.phase === 'ready' &&
        (state.data.practices.length === 0 ? (
          <MovementShell onClose={close}>
            <div className="flex min-h-[60vh] flex-col items-center justify-center">
              <div className="w-full rounded-2xl border border-border bg-surface p-6 text-center">
                <p className="text-sm font-medium text-text">Nothing on your list yet.</p>
                <p className="mt-1 text-sm text-muted">Adopt a practice first; then this is where you move it.</p>
                <Link
                  href="/practices"
                  onClick={close}
                  className="mt-4 inline-block rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary hover:bg-primary-hover"
                >
                  Browse practices
                </Link>
              </div>
            </div>
          </MovementShell>
        ) : (
          <MovementSession
            practices={state.data.practices}
            defaultPracticeId={state.data.defaultPracticeId}
            // The mode to open on. A GENERIC open (ZAP button / Movement tile) opens on
            // Free Practice (Play): the open, neutral count-up, the Movement parallel to
            // Mindless's Free sit (C.3, ADR-354). A SPECIFIC entry uses the mode given to
            // open(), else the pre-selected practice's movement_config (C.4); MovementSession
            // still falls back to Walk if neither resolves.
            defaultMode={state.generic ? 'play' : (state.mode ?? resolveDefaultMode(state.data))}
            resumeFromSec={state.resumeFromSec}
            secondsTarget={state.secondsTarget}
            practicedToday={state.data.practicedToday}
            onExit={close}
          />
        ))}
    </MovementContext.Provider>
  )
}

/** The mode to open on when open() wasn't given one: read it off the pre-selected
 *  practice's movement_config. A stored config may still carry the legacy `'workout'`
 *  string, so map that to `'strength'` to match the six-mode engine. Undefined lets
 *  MovementSession fall back to its own default (Walk). */
function resolveDefaultMode(data: OnAirSessionData): MovementMode | undefined {
  const id = data.defaultPracticeId
  const practice = id ? data.practices.find((p) => p.id === id) : undefined
  const stored = practice?.movementConfig?.mode as string | undefined
  if (!stored) return undefined
  return stored === 'workout' ? 'strength' : (stored as MovementMode)
}

/** The takeover frame for the overlay's NON-session states (loading, error, empty)
 *  — matches MovementSession's own `fixed inset-0 z-50` shell. */
function MovementShell({
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
              aria-label="Close Movement"
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
