'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { isError } from '@/lib/action-result'
import { promoteMembership } from '@/lib/spaces/memberships-actions'
import { SITE_DESIGN } from '@/lib/theme/design'

// PROMOTE (ADR-824): flip a waitlist spot to an active membership. Space-admin gated server-side;
// the action re-checks capacity so a promotion can't overfill the tier.

// FREQUENCY (ADR-1737): the members kit's quiet `.btn sm txt`, beside Cancel in the console's renewals
// table. Inlined at build; DAWN's classes below are unchanged.
const FREQUENCY = SITE_DESIGN === 'frequency'

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
        className={FREQUENCY ? 'btn sm txt' : 'inline-flex items-center gap-1 rounded-control border border-border px-2.5 py-1.5 text-meta font-semibold text-muted transition-colors hover:bg-surface-elevated disabled:opacity-50'}
      >
        {pending ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> : null}
        Promote
      </button>
      {error && <span className="text-meta text-danger">{error}</span>}
    </span>
  )
}
