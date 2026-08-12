'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { Zap, Flame, Activity, EyeOff, Eye, Loader2 } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { setLeaderboardVisibility } from '@/app/(main)/crew/leaderboard/actions'

// BoardControls — the controls that sit ABOVE the secondary individual board:
//  1. Scope (Circle / Hub / Global) — defaults to Circle (local), so a member is
//     compared with people they know first, not the whole world. DROPPED on a board
//     that is already one scope: see `showScope`.
//  2. Track — which single metric each row leads with. Which tracks are offered is
//     the caller's call (`tracks`), because the crew board and the Circle board do
//     not measure the same thing:
//       · Zaps        — season total. A straight ranking; crew board only.
//       · Consistency — daily practice streak, so a steady, tired adult can lead on
//         showing up rather than on raw output (the Strava "Local Legend" model).
//       · Effort      — this week against YOUR OWN usual week (lib/quest/effort.ts).
//  3. A one-tap "hide me from the board" toggle — ranking is opt-in by feel. Hiding
//     still counts you toward the collective goal; it only removes your row here.
//
// ONE COMPONENT, NOT A FORK. The Circle board needed a different href root and a
// different track set, so this takes `basePath` + `tracks` + `showScope` rather than
// growing a second copy that would drift the moment either surface changed. The
// defaults are the crew board's exact previous behaviour.
//
// Scope + track are URL params (server-rendered, shareable, no client fetch). Only
// the visibility toggle mutates, via a server action — and the preference it writes is
// per-MEMBER, not per-board, so hiding on one board hides on both. That is deliberate:
// a member who does not want to be listed did not mean "except over there".

type Scope = 'circle' | 'hub' | 'global'
type Track = 'zaps' | 'consistency' | 'effort'

const SCOPES: { key: Scope; label: string }[] = [
  { key: 'circle', label: 'Circle' },
  { key: 'hub', label: 'Hub' },
  { key: 'global', label: 'Global' },
]

const TRACK_LABELS: Record<Track, { label: string; icon: LucideIcon }> = {
  zaps: { label: 'Zaps', icon: Zap },
  consistency: { label: 'Consistency', icon: Flame },
  effort: { label: 'Effort', icon: Activity },
}

const DEFAULT_TRACKS: Track[] = ['zaps', 'consistency']

/** The board's own URL, with the scope + track params it reads back. `scope` is omitted when the
 *  board has no scope switcher, so a Circle board's links stay clean. */
export function boardHref(basePath: string, scope: Scope, track: Track, withScope: boolean): string {
  return withScope ? `${basePath}?scope=${scope}&track=${track}` : `${basePath}?track=${track}`
}

export function BoardControls({
  scope = 'circle',
  track,
  hidden,
  basePath = '/crew/leaderboard',
  tracks = DEFAULT_TRACKS,
  showScope = true,
}: {
  scope?: Scope
  track: Track
  /** The viewer's current "hide me from the board" preference. */
  hidden: boolean
  /** Which route the segmented controls link back to. Defaults to the crew board. */
  basePath?: string
  /** Which tracks this board offers, in order. */
  tracks?: Track[]
  /** Whether to offer the Circle / Hub / Global switcher. FALSE on the Circle board: that surface
   *  IS one circle, and zooming out to a global comparison is precisely what the research says
   *  demotivates the people a local board exists for. */
  showScope?: boolean
}) {
  const [isHidden, setIsHidden] = useState(hidden)
  const [pending, startTransition] = useTransition()

  function toggleVisibility() {
    const next = !isHidden
    setIsHidden(next)
    startTransition(async () => {
      const res = await setLeaderboardVisibility(next, basePath)
      if (!res.ok) setIsHidden(!next) // revert on failure
    })
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Scope segmented control */}
      {showScope && (
        <div
          className="flex gap-1 rounded-card bg-surface-elevated/60 p-1"
          role="tablist"
          aria-label="Leaderboard scope"
        >
          {SCOPES.map(({ key, label }) => {
            const active = scope === key
            return (
              <Link
                key={key}
                href={boardHref(basePath, key, track, showScope)}
                role="tab"
                aria-selected={active}
                className={`inline-flex min-h-11 items-center rounded-control px-3 py-1.5 text-meta font-semibold transition-colors motion-reduce:transition-none ${
                  active ? 'bg-surface text-text lift-1' : 'text-muted hover:text-text'
                }`}
              >
                {label}
              </Link>
            )
          })}
        </div>
      )}

      {/* Track segmented control */}
      <div
        className="flex gap-1 rounded-card bg-surface-elevated/60 p-1"
        role="tablist"
        aria-label="Leaderboard track"
      >
        {tracks.map((key) => {
          const { label, icon: Icon } = TRACK_LABELS[key]
          const active = track === key
          return (
            <Link
              key={key}
              href={boardHref(basePath, scope, key, showScope)}
              role="tab"
              aria-selected={active}
              className={`inline-flex min-h-11 items-center gap-1.5 rounded-control px-3 py-1.5 text-meta font-semibold transition-colors motion-reduce:transition-none ${
                active ? 'bg-surface text-text lift-1' : 'text-muted hover:text-text'
              }`}
            >
              <Icon className="h-3.5 w-3.5" aria-hidden />
              {label}
            </Link>
          )
        })}
      </div>

      {/* Hide-me toggle — pushed to the end; quiet, never alarming. */}
      <button
        type="button"
        onClick={toggleVisibility}
        disabled={pending}
        aria-pressed={isHidden}
        className="ml-auto inline-flex min-h-11 items-center gap-1.5 rounded-control px-3 py-1.5 text-meta font-semibold text-muted transition-colors hover:bg-surface-elevated hover:text-text disabled:opacity-50 motion-reduce:transition-none"
      >
        {pending ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden />
        ) : isHidden ? (
          <Eye className="h-3.5 w-3.5" aria-hidden />
        ) : (
          <EyeOff className="h-3.5 w-3.5" aria-hidden />
        )}
        {isHidden ? 'Show me on the board' : 'Hide me from the board'}
      </button>
    </div>
  )
}
