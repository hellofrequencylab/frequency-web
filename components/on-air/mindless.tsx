'use client'

// Mindless — the ONE practice-timer door (ADR-229, docs/ON-AIR.md). The same On
// Air session, launchable from anywhere via the header / Zap menu / practice
// pages, layered over the whole site instead of routed to.
//
// One overlay, two MODES the member toggles between on the setup screen:
//   • Be Still   → the sit engine (components/on-air/session.tsx): Meditate /
//                  Breathe / Stillness / Ritual / Journal / Just Log.
//   • Get Moving → the movement engine (components/on-air/movement-session.tsx):
//                  Walk / Run / Yoga / Strength / Stretch / Play.
//
// The provider loads the member's setup state ONCE (loadOnAirSession) and holds a
// `mode` state, rendering OnAirSession (still) or MovementSession (move) with the
// already-loaded data — so toggling between the two is INSTANT (no second fetch,
// no "Settling in…"/"Lacing up…" flash). It passes `mode` + `onModeChange` down so
// each session's SETUP screen renders the Be Still | Get Moving toggle and switches.
//
// The initial mode is AUTO-ROUTED from the opened practice's timer_kind: 'movement'
// → Get Moving, 'mindless'/'none' → Be Still. A generic open (no practice) opens to
// the member's last chosen mode (localStorage), else Be Still. Crash recovery checks
// BOTH live-session kinds and opens in the matching mode so the right engine re-prompts.

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { X } from 'lucide-react'
import { isError } from '@/lib/action-result'
import { requestAppFullscreen, exitAppFullscreen } from '@/lib/fullscreen'
import { loadOnAirSession } from '@/app/(main)/on-air/actions'
import type { OnAirSessionData } from '@/lib/on-air/session-data'
import { OnAirSession } from '@/components/on-air/session'
import { MovementSession } from '@/components/on-air/movement-session'
import { LotusIcon } from '@/components/on-air/icons'
import { loadLiveSession } from '@/lib/on-air/live-session'
import type { MovementMode } from '@/lib/movement'

/** The two member-facing modes of the one timer: the sit ('still', "Be Still") and
 *  the movement timer ('move', "Get Moving"). */
export type TimerMode = 'still' | 'move'

/** localStorage key for the member's last chosen mode (a generic open re-opens to it). */
const LAST_MODE_KEY = 'fq_timer_mode'

function readLastMode(): TimerMode | null {
  if (typeof window === 'undefined') return null
  try {
    const v = window.localStorage.getItem(LAST_MODE_KEY)
    return v === 'still' || v === 'move' ? v : null
  } catch {
    return null
  }
}

function writeLastMode(mode: TimerMode): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(LAST_MODE_KEY, mode)
  } catch {
    // remembering the mode is a nicety, never a blocker
  }
}

/** What `open` accepts. `practiceId` pre-selects an adopted practice (and the door opens in
 *  that practice's timer_kind mode — Be Still for 'mindless'/'none', Get Moving for 'movement').
 *  `mode` (Movement) forces Get Moving on a given movement sub-mode. A "Finish Practice" resume
 *  passes BOTH `resumeFromSec` (how far the partial sit already got) and `secondsTarget` (the
 *  practice's full length): the timer then runs only the REMAINING time and reports the TOTAL. */
export interface MindlessOpenOpts {
  practiceId?: string
  /** Force Get Moving on this movement sub-mode (a movement practice / the Movement entry). */
  mode?: MovementMode
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
  | {
      phase: 'loading'
      practiceId?: string
      movementMode?: MovementMode
      resume?: ResumeInfo
      /** A crash-recovery open forces the mode so the engine that owns the saved record mounts. */
      forceMode?: TimerMode
    }
  | {
      phase: 'ready'
      data: OnAirSessionData
      /** The mode the door is showing (auto-routed from the practice / entry; member-togglable). */
      mode: TimerMode
      /** A Movement sub-mode forced by the entry (a movement practice / the Movement door). */
      movementMode?: MovementMode
      resume?: ResumeInfo
    }
  | { phase: 'error' }

/** The mode to open in, routed from the opened practice's timer_kind. A 'movement' practice
 *  opens Get Moving; 'mindless' / 'none' open Be Still. A crash-recovery open forces the mode.
 *  A generic open (no practice) falls back to the member's last chosen mode, then Be Still. */
function routeInitialMode(
  data: OnAirSessionData,
  requestedPracticeId: string | undefined,
  forcedMovementMode: MovementMode | undefined,
  forceMode: TimerMode | undefined,
): TimerMode {
  if (forceMode) return forceMode
  // An explicit Movement entry (the Movement practice button passes its mode) wins.
  if (forcedMovementMode) return 'move'
  const practice = requestedPracticeId
    ? data.practices.find((p) => p.id === requestedPracticeId)
    : undefined
  // A SPECIFIC practice routes by its timer_kind ('movement' → Get Moving; else Be Still).
  if (requestedPracticeId && practice) {
    return practice.timerKind === 'movement' ? 'move' : 'still'
  }
  // Generic open: remember where the member last was.
  return readLastMode() ?? 'still'
}

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

  // The open implementation. `forceMode` is the crash-recovery override (open Get Moving so the
  // Movement engine, which owns the saved 'movement' record, mounts and re-prompts).
  const openInternal = useCallback((opts?: MindlessOpenOpts, forceMode?: TimerMode) => {
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
    setState({ phase: 'loading', practiceId: opts?.practiceId, movementMode: opts?.mode, resume, forceMode })
  }, [])

  const open = useCallback((opts?: MindlessOpenOpts) => openInternal(opts), [openInternal])

  // Switch between Be Still and Get Moving WITHOUT re-fetching: the data is already loaded, so the
  // toggle just swaps which engine renders. Remembered so a later generic open re-opens here.
  const setMode = useCallback((mode: TimerMode) => {
    writeLastMode(mode)
    setState((s) => (s.phase === 'ready' ? { ...s, mode } : s))
  }, [])

  // Load the member's setup state on open, then auto-route the opening mode from the practice's
  // timer_kind. The request is tied to a token so a close (or a second open) before the load lands
  // is ignored, never flashing a stale overlay.
  useEffect(() => {
    if (state.phase !== 'loading') return
    let live = true
    const requestedPracticeId = state.practiceId
    const forcedMovementMode = state.movementMode
    const requestedResume = state.resume
    const forceMode = state.forceMode
    void (async () => {
      const result = await loadOnAirSession(requestedPracticeId)
      if (!live) return
      if (isError(result)) {
        setState({ phase: 'error' })
        return
      }
      const mode = routeInitialMode(result.data, requestedPracticeId, forcedMovementMode, forceMode)
      writeLastMode(mode)
      setState({
        phase: 'ready',
        data: result.data,
        mode,
        movementMode: forcedMovementMode,
        resume: requestedResume,
      })
    })()
    return () => {
      live = false
    }
  }, [state])

  // Crash recovery (preserves #984): a tab discard drops a running sit (its React state is gone),
  // but the record survives in localStorage. On the next app load, re-open the overlay so the
  // session can surface its Resume prompt. Both engines persist under their OWN kind ('mindless' /
  // 'movement'), so open in the matching mode and the right engine mounts + re-prompts. Movement
  // wins if (improbably) both exist. Runs once on mount; only ONE door opens (no double-open).
  useEffect(() => {
    if (loadLiveSession('movement')) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      openInternal(undefined, 'move')
    } else if (loadLiveSession('mindless')) {
      openInternal(undefined, 'still')
    }
  }, [openInternal])

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
        ) : state.mode === 'move' ? (
          <MovementSession
            // Loaded ONCE by the provider; passed to both engines so toggling is instant.
            practices={state.data.practices}
            defaultPracticeId={state.data.defaultPracticeId}
            // The Movement sub-mode to open on: the forced one (a movement practice / Movement
            // entry), else the pre-selected practice's movement_config, else MovementSession's own
            // Walk default. A generic toggle into Get Moving opens neutral.
            defaultMode={state.movementMode ?? resolveDefaultMode(state.data)}
            practicedToday={state.data.practicedToday}
            resumeFromSec={state.resume?.resumeFromSec}
            secondsTarget={state.resume?.secondsTarget}
            onExit={close}
            // The Be Still | Get Moving toggle: passing onModeChange tells the session it's inside
            // the unified door (the standalone /on-air route omits it, so no toggle there).
            mode={state.mode}
            onModeChange={setMode}
          />
        ) : (
          <OnAirSession
            practices={state.data.practices}
            defaultPracticeId={state.data.defaultPracticeId}
            prefs={state.data.prefs}
            practicedToday={state.data.practicedToday}
            resumeFromSec={state.resume?.resumeFromSec}
            secondsTarget={state.resume?.secondsTarget}
            onExit={close}
            mode={state.mode}
            onModeChange={setMode}
          />
        ))}
    </MindlessContext.Provider>
  )
}

/** The Movement sub-mode to open on when the entry didn't force one: read it off the pre-selected
 *  practice's movement_config. A stored config may still carry the legacy `'workout'` string, so
 *  map that to `'strength'` to match the six-mode engine. Undefined lets MovementSession fall back
 *  to its own default (Walk). */
function resolveDefaultMode(data: OnAirSessionData): MovementMode | undefined {
  const id = data.defaultPracticeId
  const practice = id ? data.practices.find((p) => p.id === id) : undefined
  const stored = practice?.movementConfig?.mode as string | undefined
  if (!stored) return undefined
  return stored === 'workout' ? 'strength' : (stored as MovementMode)
}

/** The takeover frame for the overlay's NON-session states (loading, error,
 *  empty) — matches the session's own `fixed inset-0 z-50` shell so the
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
