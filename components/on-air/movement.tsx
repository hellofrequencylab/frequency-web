'use client'

// Movement — now a thin SHIM over the unified Mindless door (the timer-merge:
// one member-facing timer "Mindless" with two modes, Be Still + Get Moving).
//
// Movement is no longer a separate overlay with its own provider entry. The one
// door is MindlessProvider (components/on-air/mindless.tsx): it loads the session
// once, holds the mode, and renders the sit (Be Still) or the Movement engine
// (Get Moving). MovementSession is still the Get Moving engine — but it's mounted
// BY the Mindless door, not by this file.
//
// To keep every existing caller working unchanged, this file keeps exporting:
//   • useMovement() — its open() forwards to the Mindless door, opening it in Get
//     Moving (the movement `mode` becomes the door's forced sub-mode).
//   • MovementProvider — a no-op pass-through. app-shell still wraps with it, but
//     the real overlay is MindlessProvider's. Retiring the SEPARATE entry here is
//     what makes there be exactly one door (no double-open on crash recovery, no
//     second 'Lacing up…' overlay).

import { useCallback, useMemo } from 'react'
import { useMindless } from '@/components/on-air/mindless'
import type { MovementMode } from '@/lib/movement'

interface MovementApi {
  /** Open the ONE timer door in Get Moving. `practiceId` pre-selects an adopted practice;
   *  `mode` the Movement sub-mode to open on. `resumeFromSec` + `secondsTarget` open a
   *  "Finish Practice" resume. Forwards straight to the unified Mindless door. */
  open: (opts?: {
    practiceId?: string
    mode?: MovementMode
    resumeFromSec?: number
    secondsTarget?: number
    /** A practice-select launch auto-starts the movement timer (skips setup). */
    autoStart?: boolean
  }) => void
  close: () => void
}

/** The Movement launcher API — kept for back-compat. It now delegates to the unified Mindless
 *  door (useMindless), opening it in Get Moving. There is no separate Movement overlay anymore. */
export function useMovement(): MovementApi {
  const mindless = useMindless()
  const open = useCallback<MovementApi['open']>(
    (opts) =>
      mindless.open({
        practiceId: opts?.practiceId,
        // A bare Get Moving open with no sub-mode still routes to Get Moving: the door treats a
        // `mode` of undefined-but-movement-intent via 'play' so the neutral Free Practice opens.
        mode: opts?.mode ?? 'play',
        resumeFromSec: opts?.resumeFromSec,
        secondsTarget: opts?.secondsTarget,
        autoStart: opts?.autoStart,
      }),
    [mindless],
  )
  return useMemo<MovementApi>(() => ({ open, close: mindless.close }), [open, mindless.close])
}

/** A no-op pass-through, kept so app-shell's existing wrapping doesn't have to change. The real
 *  overlay is MindlessProvider's; this provider holds no state and renders no overlay (the
 *  SEPARATE Movement entry is retired — there is one door). */
export function MovementProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
