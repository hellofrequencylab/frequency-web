'use client'

// ─────────────────────────────────────────────────────────────────────────────
// THE STEER PANEL (docs/STUDIO.md, ADR-597).
//
// The three dials that turn a one-shot generation into something an author can actually direct:
//
//   MOOD       one control that re-voices a whole draft (tone, CTA posture, accent emphasis).
//   DIRECTIONS plain language about how to approach it, folded into the AI brief.
//   LOCK       what a redraw must NOT touch.
//
// All three were built once, for the Business Seeder, and worked well enough that the operator
// used them constantly. Nothing else on the platform had them. They are kernel behaviour now, so
// every entity that declares `steer` gets the same three, and the redraw stops being the
// all-or-nothing "generate again and pray" that every other AI creation tool ships.
//
// LOCK is the one that makes the rest safe: without it, liking one thing about a draft means never
// daring to regenerate. Field paths a manifest names in `steer.lock` are offered as pins here, and
// the entity's redraw action is responsible for honouring them.
// ─────────────────────────────────────────────────────────────────────────────

import { Compass, Lock, Palette } from 'lucide-react'
import { Textarea } from '@/components/ui/field'
import { SEED_MOODS, type SeedMood } from '@/lib/studio/kernel/moods'
import type { SteerCapabilities } from '@/lib/studio/kernel/manifest'

export interface SparkSteerProps {
  /** From the manifest. Only the declared dials render. */
  steer: SteerCapabilities
  mood: SeedMood
  onMood: (next: SeedMood) => void
  directions: string
  onDirections: (next: string) => void
  /** The currently pinned lock keys (a subset of `steer.lock`). Optional: an entity that declares
   *  no `steer.lock`, or a CREATE flow where no draft exists yet to protect, has nothing to pin. */
  locked?: readonly string[]
  onLocked?: (next: string[]) => void
  /** Label for a lock key. Falls back to the key itself. */
  lockLabel?: (key: string) => string
  disabled?: boolean
  /** Runs the redraw. Omit to render the dials without an action (the create path sets them up
   *  front; only the edit path redraws). */
  onRedraw?: () => void
  redrawLabel?: string
  busy?: boolean
}

export function SparkSteer({
  steer,
  mood,
  onMood,
  directions,
  onDirections,
  locked,
  onLocked,
  lockLabel,
  disabled,
  onRedraw,
  redrawLabel = 'Draft it again',
  busy,
}: SparkSteerProps) {
  // No handler means locking is not offered here, so the whole section stays out of the DOM rather
  // than rendering pins that cannot be pressed.
  const lockKeys = onLocked ? (steer.lock ?? []) : []
  const pinned = locked ?? []
  const toggleLock = (key: string) =>
    onLocked?.(pinned.includes(key) ? pinned.filter((k) => k !== key) : [...pinned, key])

  if (!steer.mood && !steer.directions && lockKeys.length === 0) return null

  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      {steer.mood && (
        <div>
          <p className="flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wide text-subtle">
            <Palette className="h-3.5 w-3.5 text-primary-strong" aria-hidden /> Mood
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label="Mood">
            {SEED_MOODS.map((m) => (
              <button
                key={m.key}
                type="button"
                onClick={() => onMood(m.key)}
                disabled={disabled || busy}
                aria-pressed={mood === m.key}
                title={m.description}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors disabled:opacity-60 ${
                  mood === m.key
                    ? 'border-primary/40 bg-primary-bg text-primary-strong'
                    : 'border-border bg-surface text-muted hover:text-text'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {steer.directions && (
        <div className={steer.mood ? 'mt-4' : ''}>
          <label htmlFor="spark-directions" className="flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wide text-subtle">
            <Compass className="h-3.5 w-3.5 text-primary-strong" aria-hidden /> Directions
          </label>
          <Textarea
            id="spark-directions"
            rows={2}
            className="mt-2 min-h-16 resize-y"
            placeholder="How should this be approached? Lead with the retreat angle, keep it calm, emphasize the sound baths."
            value={directions}
            onChange={(e) => onDirections(e.target.value)}
            disabled={disabled || busy}
          />
          <p className="mt-1.5 text-2xs text-subtle">
            Steers emphasis and angle. It never overrides the trust rules: no invented facts.
          </p>
        </div>
      )}

      {lockKeys.length > 0 && (
        <div className="mt-4">
          <p className="flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wide text-subtle">
            <Lock className="h-3.5 w-3.5 text-primary-strong" aria-hidden /> Keep as is
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {lockKeys.map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => toggleLock(key)}
                disabled={disabled || busy}
                aria-pressed={pinned.includes(key)}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors disabled:opacity-60 ${
                  pinned.includes(key)
                    ? 'border-primary/40 bg-primary-bg text-primary-strong'
                    : 'border-border bg-surface text-muted hover:text-text'
                }`}
              >
                {lockLabel?.(key) ?? key}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-2xs text-subtle">Anything pinned here survives a redraw untouched.</p>
        </div>
      )}

      {onRedraw && (
        <button
          type="button"
          onClick={onRedraw}
          disabled={disabled || busy}
          className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-text transition-colors hover:bg-surface-elevated disabled:opacity-60"
        >
          {busy ? 'Drafting…' : redrawLabel}
        </button>
      )}
    </div>
  )
}
