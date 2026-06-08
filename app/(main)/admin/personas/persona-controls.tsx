'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Zap, Ban, RotateCcw, Loader2 } from 'lucide-react'
import { transitionPersona } from './actions'
import { isError } from '@/lib/action-result'
import { canStaffTransition, type PartnerPersona, type PersonaState } from '@/lib/personas'

// The staff verify/activate/suspend/reinstate buttons for one persona row. Only the
// transitions the state machine allows from the current state render (canStaffTransition).
const ACTIONS: { to: PersonaState; label: string; Icon: typeof Check; tone: 'go' | 'warn' | 'danger' }[] = [
  { to: 'verified', label: 'Verify', Icon: Check, tone: 'go' },
  { to: 'active', label: 'Activate', Icon: Zap, tone: 'go' },
  { to: 'suspended', label: 'Suspend', Icon: Ban, tone: 'danger' },
]

export function PersonaControls({
  profileId,
  persona,
  state,
}: {
  profileId: string
  persona: PartnerPersona
  state: PersonaState
}) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  function move(to: PersonaState) {
    setError(null)
    startTransition(async () => {
      const r = await transitionPersona(profileId, persona, to)
      if (isError(r)) setError(r.error)
      else router.refresh()
    })
  }

  const reinstate = canStaffTransition(state, 'verified') && state === 'suspended'

  return (
    <div className="flex flex-wrap items-center justify-end gap-1.5">
      {error && <span className="mr-1 text-xs text-danger">{error}</span>}
      {isPending && <Loader2 className="h-4 w-4 animate-spin text-muted" />}
      {reinstate ? (
        <button
          onClick={() => move('verified')}
          disabled={isPending}
          className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-xs font-semibold text-text transition-colors hover:bg-surface-elevated disabled:opacity-60"
        >
          <RotateCcw className="h-3.5 w-3.5" /> Reinstate
        </button>
      ) : (
        ACTIONS.filter((a) => canStaffTransition(state, a.to)).map((a) => (
          <button
            key={a.to}
            onClick={() => move(a.to)}
            disabled={isPending}
            className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors disabled:opacity-60 ${
              a.tone === 'danger'
                ? 'border border-danger/40 text-danger hover:bg-danger-bg/30'
                : 'bg-primary text-on-primary hover:bg-primary-hover'
            }`}
          >
            <a.Icon className="h-3.5 w-3.5" /> {a.label}
          </button>
        ))
      )}
    </div>
  )
}
