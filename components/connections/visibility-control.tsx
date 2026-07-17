'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Globe, Lock } from 'lucide-react'
import { setVisibility } from '@/app/(main)/connections/actions'
import type { Visibility } from '@/lib/connections/types'

// The owner-only Private ↔ Network toggle for one capture (ADR-132/154). Only the two
// tiers members get: 'shared' is a separate deferred decision and is never offered here.
// The helper text is kept honest to canViewLead's `network_local` rule: 'network' makes
// the capture findable by same-city stewards, and only their business-card fields ever
// surface. Email, phone, notes, and tags stay owner-private in every case.

export function VisibilityControl({
  contactId,
  initial,
  city,
}: {
  contactId: string
  initial: Visibility
  city: string | null
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  // Only ever private/network on this surface (never 'shared').
  const [visibility, setV] = useState<'private' | 'network'>(initial === 'network' ? 'network' : 'private')
  const isNetwork = visibility === 'network'

  function toggle() {
    const next: 'private' | 'network' = isNetwork ? 'private' : 'network'
    setV(next)
    start(async () => {
      await setVisibility(contactId, next as Visibility)
      router.refresh()
    })
  }

  const where = city ? `stewards in ${city}` : 'stewards in the same city'

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={toggle}
        disabled={pending}
        role="switch"
        aria-checked={isNetwork}
        aria-label={isNetwork ? 'Shared to your network' : 'Private to you'}
        className="inline-flex items-center gap-1.5 rounded-lg border border-border-strong px-3 py-1.5 text-sm font-medium text-text transition-colors hover:bg-surface-elevated disabled:opacity-50"
      >
        {isNetwork ? <Globe className="h-4 w-4" aria-hidden /> : <Lock className="h-4 w-4" aria-hidden />}
        {isNetwork ? 'Network' : 'Private'}
      </button>
      <p className="text-sm text-muted">
        {isNetwork ? (
          <>
            Network: {where} can find this person and see their basic card (name, role, company). Your
            email, phone, notes, and tags stay private to you.
          </>
        ) : (
          <>Private: only you can see this contact. Switch to Network to let local stewards find them.</>
        )}
      </p>
    </div>
  )
}
