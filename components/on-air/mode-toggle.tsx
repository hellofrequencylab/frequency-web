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
 *  in the accent wash for the mode it selects (Be Still = amber primary, Get Moving = the teal/blue
 *  move accent), so the toggle itself previews the scheme each mode switches the door into. */
export function ModeToggle({
  mode,
  onModeChange,
}: {
  mode: TimerMode
  onModeChange: (mode: TimerMode) => void
}) {
  // Each active segment wears its OWN mode's accent (not the door's current mode), so the
  // control reads as a two-color toggle: amber for Be Still, teal/blue move for Get Moving.
  const seg = (active: boolean, accent: 'still' | 'move') =>
    `flex flex-1 items-center justify-center gap-1.5 rounded-full px-3 py-2 text-sm font-semibold transition-colors ${
      active
        ? accent === 'move'
          ? 'bg-move text-on-move shadow-sm'
          : 'bg-primary text-on-primary shadow-sm'
        : 'text-muted hover:text-text'
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
        className={seg(mode === 'still', 'still')}
      >
        <LotusIcon className="h-4 w-4 shrink-0" aria-hidden /> Be Still
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={mode === 'move'}
        onClick={() => onModeChange('move')}
        className={seg(mode === 'move', 'move')}
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
  // The masthead accent follows the active mode: Be Still wears the amber primary, Get Moving
  // the teal/blue move accent. The lotus + MINDLESS wordmark recolor together so the whole
  // door reads in one scheme. Tokens only (docs/THEME.md).
  const moving = mode === 'move'
  const wordmarkAccent = moving ? 'text-move-strong' : 'text-primary-strong'
  return (
    <>
      {/* Comfortable top margin so the lotus + MINDLESS wordmark breathe from the overlay top
          instead of sitting squished against it (item #7). */}
      <div className="relative flex items-center justify-center pb-2 pt-[max(1.5rem,env(safe-area-inset-top))] lg:pt-8">
        <p className={`flex items-center gap-2.5 text-base font-bold uppercase tracking-[0.35em] lg:text-lg ${wordmarkAccent}`}>
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
