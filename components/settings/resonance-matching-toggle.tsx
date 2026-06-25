'use client'

import { useState, useTransition } from 'react'
import { Sparkles, Check, TriangleAlert, EyeOff } from 'lucide-react'
import { setResonanceMatching, setResonanceTargetMute } from '@/app/(main)/settings/connections/resonance-actions'

// Resonance matching consent (ADR-385) — the member's own opt-IN to the match pool, plus the
// secondary "mute being suggested" control. Opt-in is OFF by default (a person-to-person surface
// is opt-in, like email marketing): say nothing and you are simply not matched. Mirrors the
// LiveLocationToggle pattern (optimistic switch, inline saved/error). Nothing here sends a message:
// matching only proposes; any intro still needs both people to say yes and an operator to approve.
export function ResonanceMatchingToggle({
  initialOptedIn,
  initialMuted,
}: {
  initialOptedIn: boolean
  initialMuted: boolean
}) {
  const [optedIn, setOptedIn] = useState(initialOptedIn)
  const [muted, setMuted] = useState(initialMuted)
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  function flash() {
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  function toggleMatching() {
    setError(null)
    const next = !optedIn
    setOptedIn(next)
    start(async () => {
      const r = await setResonanceMatching(next)
      if (!r.ok) {
        setError(r.error ?? 'Could not save that.')
        setOptedIn(!next)
        return
      }
      flash()
    })
  }

  function toggleMute() {
    setError(null)
    const next = !muted
    setMuted(next)
    start(async () => {
      const r = await setResonanceTargetMute(next)
      if (!r.ok) {
        setError(r.error ?? 'Could not save that.')
        setMuted(!next)
        return
      }
      flash()
    })
  }

  return (
    <section className="mt-5 rounded-2xl border border-border bg-surface p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-sm font-bold text-text">
            <Sparkles className="h-4 w-4 text-primary-strong" /> Resonance matching
          </h2>
          <p className="mt-1 text-sm text-muted">
            Let Frequency quietly find the few people you would most click with, from the Circles,
            Journeys, and practices you already share. Off by default. We only ever suggest. No one is
            introduced until you both say yes, and a human still sends the hello.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={optedIn}
          onClick={toggleMatching}
          disabled={pending}
          className={`relative mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${
            optedIn ? 'bg-primary' : 'bg-surface-elevated border border-border'
          }`}
        >
          <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${optedIn ? 'translate-x-6' : 'translate-x-1'}`} />
        </button>
      </div>

      {/* Secondary control — only meaningful once you are in the pool. */}
      {optedIn && (
        <div className="mt-4 flex items-start justify-between gap-4 border-t border-border/60 pt-4">
          <div className="min-w-0">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-text">
              <EyeOff className="h-3.5 w-3.5 text-subtle" /> Mute being suggested
            </h3>
            <p className="mt-1 text-sm text-muted">
              Keep getting your own matches, but stop being suggested to other people.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={muted}
            onClick={toggleMute}
            disabled={pending}
            className={`relative mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${
              muted ? 'bg-primary' : 'bg-surface-elevated border border-border'
            }`}
          >
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${muted ? 'translate-x-6' : 'translate-x-1'}`} />
          </button>
        </div>
      )}

      <div className="mt-2 min-h-[1.25rem] text-2xs">
        {pending && <span className="text-subtle">Updating…</span>}
        {saved && !pending && (
          <span className="inline-flex items-center gap-1 text-primary-strong"><Check className="h-3 w-3" /> Saved</span>
        )}
        {error && !pending && (
          <span className="inline-flex items-center gap-1 text-danger"><TriangleAlert className="h-3 w-3" /> {error}</span>
        )}
      </div>
    </section>
  )
}
