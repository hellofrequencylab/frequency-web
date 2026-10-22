'use client'

import { useSearchParams } from 'next/navigation'
import { MapPin } from 'lucide-react'
import { ClaimButton } from '@/app/(main)/n/[nodeId]/claim-button'
import { CHECKIN_PARAMS } from '@/lib/spaces/checkin-landing'

// THE FEATURED CHECK-IN BOX. A tapped placard (or a scanned door code) for a Space lands on the Space's
// own page with `?checkin=<nodeId>&s=...&m=...` (app/(main)/n/[nodeId]/page.tsx → spaceCheckinHref).
// This box reads those params and puts the check-in first, above the page body, so the member sees the
// Space they walked into and claims in one tap. Without the params it renders nothing.
//
// It reads the params on the CLIENT on purpose: the signed-out Space page is an ISR document served to
// everyone, so the server render cannot see a query string. The claim itself is the same verified
// server action the node page runs; a bad or foreign node id simply fails there.
export function FeaturedCheckin({ spaceName }: { spaceName: string }) {
  const params = useSearchParams()
  const nodeId = params.get(CHECKIN_PARAMS.node)
  if (!nodeId) return null

  return (
    <section
      aria-labelledby="featured-checkin-title"
      className="mx-auto my-4 w-full max-w-xl rounded-card border border-primary bg-surface px-5 py-6 text-center lift-1"
    >
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-card bg-primary-bg text-primary-strong">
        <MapPin className="h-7 w-7" aria-hidden />
      </div>
      <h2 id="featured-checkin-title" className="mt-3 text-display-h3 text-text">
        You&apos;re at {spaceName}
      </h2>
      <p className="mt-1 text-body-sm text-muted">Check in to earn your Zaps and a stamp on your Regulars card.</p>
      <div className="mt-5 flex justify-center">
        <ClaimButton nodeId={nodeId} secret={params.get(CHECKIN_PARAMS.secret)} medium={params.get(CHECKIN_PARAMS.medium)} />
      </div>
    </section>
  )
}
