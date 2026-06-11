'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Zap, Ban, RotateCcw, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
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
        <Button variant="secondary" size="sm" onClick={() => move('verified')} disabled={isPending}>
          <RotateCcw className="h-3.5 w-3.5" /> Reinstate
        </Button>
      ) : (
        ACTIONS.filter((a) => canStaffTransition(state, a.to)).map((a) =>
          // Suspend keeps its subtle outlined-danger look (no canonical variant matches);
          // Verify/Activate map cleanly to the primary button.
          a.tone === 'danger' ? (
            <button
              key={a.to}
              onClick={() => move(a.to)}
              disabled={isPending}
              className="inline-flex items-center gap-1 rounded-lg border border-danger/40 px-2.5 py-1 text-xs font-semibold text-danger transition-colors hover:bg-danger-bg/30 disabled:opacity-60"
            >
              <a.Icon className="h-3.5 w-3.5" /> {a.label}
            </button>
          ) : (
            <Button key={a.to} variant="primary" size="sm" onClick={() => move(a.to)} disabled={isPending}>
              <a.Icon className="h-3.5 w-3.5" /> {a.label}
            </Button>
          ),
        )
      )}
    </div>
  )
}
