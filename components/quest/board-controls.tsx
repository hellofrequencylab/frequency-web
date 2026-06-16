'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { Zap, Flame, EyeOff, Eye, Loader2 } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { setLeaderboardVisibility } from '@/app/(main)/crew/leaderboard/actions'

// BoardControls — the controls that sit ABOVE the secondary individual board:
//  1. Scope (Circle / Hub / Global) — defaults to Circle (local), so a member is
//     compared with people they know first, not the whole world.
//  2. Track (Zaps / Consistency) — Consistency ranks by daily practice streak, so a
//     steady, tired adult can lead on showing up, not only on raw output (the Strava
//     "Local Legend" model).
//  3. A one-tap "hide me from the board" toggle — ranking is opt-in by feel. Hiding
//     still counts you toward the collective goal; it only removes your row here.
//
// Scope + track are URL params (server-rendered, shareable, no client fetch). Only
// the visibility toggle mutates, via a server action.

type Scope = 'circle' | 'hub' | 'global'
type Track = 'zaps' | 'consistency'

const SCOPES: { key: Scope; label: string }[] = [
  { key: 'circle', label: 'Circle' },
  { key: 'hub', label: 'Hub' },
  { key: 'global', label: 'Global' },
]

const TRACKS: { key: Track; label: string; icon: LucideIcon }[] = [
  { key: 'zaps', label: 'Zaps', icon: Zap },
  { key: 'consistency', label: 'Consistency', icon: Flame },
]

function href(scope: Scope, track: Track): string {
  return `/crew/leaderboard?scope=${scope}&track=${track}`
}

export function BoardControls({
  scope,
  track,
  hidden,
}: {
  scope: Scope
  track: Track
  /** The viewer's current "hide me from the board" preference. */
  hidden: boolean
}) {
  const [isHidden, setIsHidden] = useState(hidden)
  const [pending, startTransition] = useTransition()

  function toggleVisibility() {
    const next = !isHidden
    setIsHidden(next)
    startTransition(async () => {
      const res = await setLeaderboardVisibility(next)
      if (!res.ok) setIsHidden(!next) // revert on failure
    })
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Scope segmented control */}
      <div
        className="flex gap-1 rounded-xl bg-surface-elevated/60 p-1"
        role="tablist"
        aria-label="Leaderboard scope"
      >
        {SCOPES.map(({ key, label }) => {
          const active = scope === key
          return (
            <Link
              key={key}
              href={href(key, track)}
              role="tab"
              aria-selected={active}
              className={`inline-flex min-h-11 items-center rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors motion-reduce:transition-none ${
                active ? 'bg-surface text-text shadow-sm' : 'text-muted hover:text-text'
              }`}
            >
              {label}
            </Link>
          )
        })}
      </div>

      {/* Track segmented control */}
      <div
        className="flex gap-1 rounded-xl bg-surface-elevated/60 p-1"
        role="tablist"
        aria-label="Leaderboard track"
      >
        {TRACKS.map(({ key, label, icon: Icon }) => {
          const active = track === key
          return (
            <Link
              key={key}
              href={href(scope, key)}
              role="tab"
              aria-selected={active}
              className={`inline-flex min-h-11 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors motion-reduce:transition-none ${
                active ? 'bg-surface text-text shadow-sm' : 'text-muted hover:text-text'
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
        className="ml-auto inline-flex min-h-11 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-muted transition-colors hover:bg-surface-elevated hover:text-text disabled:opacity-50 motion-reduce:transition-none"
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
