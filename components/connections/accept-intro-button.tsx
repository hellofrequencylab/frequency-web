'use client'

import { useState, useTransition } from 'react'
import { Check, Hourglass, TriangleAlert, HeartHandshake } from 'lucide-react'
import { acceptResonanceIntro } from '@/app/(main)/settings/connections/resonance-actions'

// The member-side "yes, introduce us" tap for one resonance match. Records ONLY consent (the
// bilateral opt-in) — it never sends a message. When the OTHER person has also said yes, the
// pairing is "accepted" and a human can approve the intro draft; until then it shows "waiting on
// them". Idempotent (re-tapping is a no-op). Self-contained optimistic button.
export function AcceptIntroButton({ otherProfileId }: { otherProfileId: string }) {
  const [state, setState] = useState<'idle' | 'waiting' | 'matched'>('idle')
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function accept() {
    setError(null)
    start(async () => {
      const r = await acceptResonanceIntro(otherProfileId)
      if (!r.ok) {
        setError(r.error ?? 'Could not record that.')
        return
      }
      setState(r.bothOptedIn ? 'matched' : 'waiting')
    })
  }

  if (state === 'matched') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-lg bg-success-bg px-3 py-1.5 text-xs font-semibold text-success">
        <HeartHandshake className="h-3.5 w-3.5" aria-hidden /> You both said yes
      </span>
    )
  }
  if (state === 'waiting') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-lg bg-surface-elevated px-3 py-1.5 text-xs font-semibold text-muted">
        <Hourglass className="h-3.5 w-3.5" aria-hidden /> Waiting on them
      </span>
    )
  }

  return (
    <span className="inline-flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={accept}
        disabled={pending}
        className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-50"
      >
        {pending ? <Hourglass className="h-3.5 w-3.5 animate-pulse" aria-hidden /> : <Check className="h-3.5 w-3.5" aria-hidden />}
        Introduce us
      </button>
      {error && (
        <span className="inline-flex items-center gap-1 text-2xs text-danger">
          <TriangleAlert className="h-3 w-3" aria-hidden /> {error}
        </span>
      )}
    </span>
  )
}
