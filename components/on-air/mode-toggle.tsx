'use client'

// The Be Still | Get Moving toggle + the shared Mindless masthead, rendered at the top of BOTH
// session setup screens (the sit + the movement engine) when they run inside the unified door.
// One timer, two modes; the masthead reads "Mindless" with the locked tagline, and the segmented
// control swaps engines instantly (the provider already holds the loaded data).
//
// Voice (docs/CONTENT-VOICE.md): plain, no em or en dashes. Labels + tagline are LOCKED:
// "Be Still" / "Get Moving" and "Get out of your head, and into your life."
// Semantic tokens only, no hardcoded hex (docs/THEME.md).

import { X, Footprints } from 'lucide-react'
import { LotusIcon } from '@/components/on-air/icons'
import type { TimerMode } from '@/components/on-air/mindless'

/** The locked tagline under the Mindless masthead (both modes). */
export const MINDLESS_TAGLINE = 'Get out of your head, and into your life.'

/** The segmented Be Still | Get Moving control. Wired to onModeChange; the active segment reads
 *  in the primary token wash so it matches the rest of the setup styling. */
export function ModeToggle({
  mode,
  onModeChange,
}: {
  mode: TimerMode
  onModeChange: (mode: TimerMode) => void
}) {
  const seg = (active: boolean) =>
    `flex flex-1 items-center justify-center gap-1.5 rounded-full px-3 py-2 text-sm font-semibold transition-colors ${
      active ? 'bg-primary text-on-primary shadow-sm' : 'text-muted hover:text-text'
    }`
  return (
    <div
      role="tablist"
      aria-label="Timer mode"
      className="mx-auto flex w-full max-w-xs items-center gap-1 rounded-full border border-border bg-surface-elevated/60 p-1"
    >
      <button
        type="button"
        role="tab"
        aria-selected={mode === 'still'}
        onClick={() => onModeChange('still')}
        className={seg(mode === 'still')}
      >
        <LotusIcon className="h-4 w-4 shrink-0" aria-hidden /> Be Still
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={mode === 'move'}
        onClick={() => onModeChange('move')}
        className={seg(mode === 'move')}
      >
        <Footprints className="h-4 w-4 shrink-0" aria-hidden /> Get Moving
      </button>
    </div>
  )
}

/** The shared masthead for both setup screens inside the unified door: the lotus + MINDLESS
 *  wordmark, a close affordance, the locked tagline, and the Be Still | Get Moving toggle. The
 *  caller owns the surrounding layout; this is just the top block. */
export function MindlessMasthead({
  mode,
  onModeChange,
  onClose,
}: {
  mode: TimerMode
  onModeChange: (mode: TimerMode) => void
  onClose: () => void
}) {
  return (
    <>
      <div className="relative flex items-center justify-center pb-2">
        <p className="flex items-center gap-2.5 text-base font-bold uppercase tracking-[0.35em] text-primary-strong lg:text-lg">
          <LotusIcon className="h-6 w-6 lg:h-7 lg:w-7" /> Mindless
        </p>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute -right-2 -top-1 rounded-full p-2 text-subtle transition-colors hover:bg-surface-elevated hover:text-text"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <p className="pb-4 text-center text-xs text-subtle lg:pb-5">{MINDLESS_TAGLINE}</p>
      <div className="pb-5 lg:pb-6">
        <ModeToggle mode={mode} onModeChange={onModeChange} />
      </div>
    </>
  )
}
