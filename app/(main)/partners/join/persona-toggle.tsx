'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Plus, Loader2 } from 'lucide-react'
import { setPersona } from './actions'
import { isError } from '@/lib/action-result'
import type { PartnerPersona } from '@/lib/core/access-matrix'

export function PersonaToggle({ persona, active }: { persona: PartnerPersona; active: boolean }) {
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  function toggle() {
    startTransition(async () => {
      const r = await setPersona(persona, !active)
      if (!isError(r)) router.refresh()
    })
  }

  return (
    <button
      onClick={toggle}
      disabled={isPending}
      className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-semibold transition-colors disabled:opacity-60 ${
        active
          ? 'border border-success/50 bg-success-bg/30 text-success hover:bg-success-bg/50'
          : 'bg-primary text-on-primary hover:bg-primary-hover'
      }`}
    >
      {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : active ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
      {active ? 'Active' : 'Join'}
    </button>
  )
}
