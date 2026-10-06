'use client'

// The arrival follow-up (ADR-1715, LIVE-795). One optional question after the persona pick, in the
// member's own words, that maps them to an archetype (lib/audience/archetypes.ts). Shared by the
// induction (/join) and the lead-flow chooser (/start/[flow]) so the two can never ask differently.
//
// Privacy: the answer rides ONE first-party cookie (fq_archetype) to the server, which stores it at
// profiles.meta.archetype / contacts.meta.archetype and as a tag. It is never passed to track(), an ad
// pixel or an analytics pixel, and the archetype name is never rendered here. Skipping is allowed:
// tapping the picked option again clears it.

import { useEffect } from 'react'
import { followUpsFor, type ArchetypeId } from '@/lib/audience/archetypes'

export const ARCHETYPE_COOKIE = 'fq_archetype'

export function ArrivalFollowUp({
  persona,
  value,
  onChange,
  persist = true,
}: {
  persona: string | null | undefined
  value: ArchetypeId | null
  onChange: (next: ArchetypeId | null) => void
  /** Preview never writes the cookie. */
  persist?: boolean
}) {
  const options = followUpsFor(persona)

  // A persona change makes an answer from another persona's list meaningless: drop it.
  useEffect(() => {
    if (value && !options.some((o) => o.archetype === value)) onChange(null)
  }, [options, value, onChange])

  useEffect(() => {
    if (!persist) return
    document.cookie = value
      ? `${ARCHETYPE_COOKIE}=${encodeURIComponent(value)}; path=/; max-age=2592000; samesite=lax`
      : `${ARCHETYPE_COOKIE}=; path=/; max-age=0; samesite=lax`
  }, [persist, value])

  if (options.length === 0) return null
  return (
    <fieldset className="mx-auto mt-6 max-w-2xl text-left">
      <legend className="text-body-sm font-semibold text-text">One more, if you like. Which sounds most like you?</legend>
      <div className="mt-3 flex flex-wrap gap-2">
        {options.map((o) => {
          const active = value === o.archetype
          return (
            <button
              key={o.archetype}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(active ? null : o.archetype)}
              className={`rounded-pill border px-4 py-2 text-body-sm transition-colors ${active ? 'border-primary bg-primary/10 text-text' : 'border-border bg-surface text-muted hover:border-primary/40'}`}
            >
              {o.label}
            </button>
          )
        })}
      </div>
      <p className="mt-2 text-2xs text-subtle">Optional. It only changes what we show you first.</p>
    </fieldset>
  )
}
