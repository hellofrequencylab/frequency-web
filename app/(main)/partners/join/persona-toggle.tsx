'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Plus, Clock, X, Loader2 } from 'lucide-react'
import { setPersona } from './actions'
import { isError } from '@/lib/action-result'
import type { PartnerPersona } from '@/lib/core/access-matrix'
import type { PersonaState } from '@/lib/personas'

// The member's claim/release control. Reflects the verification ladder:
//   none/suspended → "Claim"; claimed → "Pending review" (+ release); verified/active
//   → live (+ release). Claiming sends it to the staff queue; it doesn't go live here.
export function PersonaToggle({ persona, state }: { persona: PartnerPersona; state: PersonaState | null }) {
  const [isPending, startTransition] = useTransition()
  const router = useRouter()
  const held = state != null && state !== 'suspended'

  function act(claim: boolean) {
    startTransition(async () => {
      const r = await setPersona(persona, claim)
      if (!isError(r)) router.refresh()
    })
  }

  if (!held) {
    return (
      <button
        onClick={() => act(true)}
        disabled={isPending}
        className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-60"
      >
        {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
        Claim
      </button>
    )
  }

  const pending = state === 'claimed'
  return (
    <div className="inline-flex items-center gap-2">
      <span
        className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold ${
          pending ? 'bg-warning-bg/50 text-warning' : 'bg-success-bg/40 text-success'
        }`}
      >
        {pending ? <Clock className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5" />}
        {pending ? 'Pending review' : state === 'active' ? 'Active' : 'Verified'}
      </span>
      <button
        onClick={() => act(false)}
        disabled={isPending}
        title="Release this program"
        className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-xs font-medium text-muted transition-colors hover:bg-surface-elevated hover:text-text disabled:opacity-60"
      >
        {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
        Release
      </button>
    </div>
  )
}
