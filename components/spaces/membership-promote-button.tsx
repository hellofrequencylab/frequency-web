'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { isError } from '@/lib/action-result'
import { promoteMembership } from '@/lib/spaces/memberships-actions'

// PROMOTE (ADR-824): flip a waitlist spot to an active membership. Space-admin gated server-side;
// the action re-checks capacity so a promotion can't overfill the tier.

export function MembershipPromoteButton({ membershipId }: { membershipId: string }) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  function promote() {
    setError(null)
    start(async () => {
      const result = await promoteMembership(membershipId)
      if (isError(result)) {
        setError(result.error)
        return
      }
      router.refresh()
    })
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={promote}
        disabled={pending}
        className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs font-semibold text-muted transition-colors hover:bg-surface-elevated disabled:opacity-50"
      >
        {pending ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> : null}
        Promote
      </button>
      {error && <span className="text-xs text-danger">{error}</span>}
    </span>
  )
}
