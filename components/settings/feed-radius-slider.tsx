'use client'

import { useState, useTransition } from 'react'
import { Radar, Check } from 'lucide-react'
import { saveMyConnectionPrefs } from '@/lib/connections/connection-settings-actions'
import { isError } from '@/lib/action-result'

// The member-controlled "feed reach" slider (Resonance Feed Phase 3, ADR-417). Sets
// feed_radius_m: how far the member's feed casts by default. Distinct from the
// discoverability radius (who can find THEM). The ripple still widens this on its own
// when the local area is sparse, so the slider is a floor + preference, never a cage.
// Commits on release (pointer/key up), not every drag tick.

const MIN_M = 5000
const MAX_M = 500000

function milesLabel(m: number): string {
  const mi = m / 1609.344
  if (mi >= 100) return `${Math.round(mi)} mi`
  if (mi >= 10) return `${Math.round(mi)} mi`
  return `${Math.round(mi * 10) / 10} mi`
}

export function FeedRadiusSlider({ initialRadiusM }: { initialRadiusM: number }) {
  const [committed, setCommitted] = useState(initialRadiusM)
  const [draft, setDraft] = useState(initialRadiusM)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function commit() {
    if (draft === committed) return
    setCommitted(draft)
    setSaved(false)
    setError(null)
    startTransition(async () => {
      const res = await saveMyConnectionPrefs({ feedRadiusM: draft })
      if (isError(res)) setError(res.error)
      else setSaved(true)
    })
  }

  return (
    <section className="rounded-2xl border border-border bg-surface px-4 py-4 shadow-sm">
      <div className="mb-1 flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary-bg text-primary-strong">
          <Radar className="h-4 w-4" />
        </span>
        <h3 className="text-sm font-bold text-text">Feed reach</h3>
      </div>
      <p className="mb-3 text-xs text-muted">
        How far your &ldquo;Nearby&rdquo; feed casts by default. When your area is quiet we widen it on
        its own so you always see something. This is just your starting point.
      </p>
      <div className="mb-2 flex items-baseline justify-between">
        <p className="text-sm font-medium text-text">Show me activity within ~{milesLabel(draft)}</p>
        <span className="text-2xs text-subtle">{milesLabel(MIN_M)}&ndash;{milesLabel(MAX_M)}</span>
      </div>
      <input
        type="range"
        min={MIN_M}
        max={MAX_M}
        step={5000}
        value={draft}
        onChange={(e) => setDraft(Number(e.target.value))}
        onPointerUp={commit}
        onKeyUp={commit}
        aria-label="Feed reach radius in miles"
        className="w-full accent-primary"
      />
      <div className="mt-2 h-4 text-2xs">
        {error ? (
          <span className="text-danger">{error}</span>
        ) : isPending ? (
          <span className="text-subtle">Saving&hellip;</span>
        ) : saved ? (
          <span className="inline-flex items-center gap-1 text-success">
            <Check className="h-3 w-3" /> Saved
          </span>
        ) : null}
      </div>
    </section>
  )
}
