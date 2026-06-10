'use client'

import { useTransition } from 'react'
import { Loader2, Plus } from 'lucide-react'
import { createDealForProfile } from '../actions'

// Starts a pipeline deal pre-linked to this member, then opens the deal detail.
export function StartDealButton({ profileId, name }: { profileId: string; name: string }) {
  const [pending, start] = useTransition()
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => start(() => createDealForProfile(profileId, name))}
      title="Start a deal with this contact"
      className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-border px-3 py-2 text-sm font-medium text-text transition-colors hover:bg-surface-elevated disabled:opacity-50"
    >
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
      Deal
    </button>
  )
}
