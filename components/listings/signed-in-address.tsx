'use client'

import { useEffect, useState } from 'react'
import { useViewer } from '@/components/layout/viewer-chrome'

// The street address a host chose to show signed-in members only (SCAN-760). The detail page is
// ISR, so it renders the same HTML for everyone and cannot know who is looking; this leaf asks
// /api/housing/[id]/address after hydration, where the session is known, and stays empty for an
// anonymous reader. Nothing here is cached, so a signed-out page never carries the address.
export function SignedInAddress({ listingId }: { listingId: string }) {
  const { signedIn } = useViewer()
  const [addressLine, setAddressLine] = useState<string | null>(null)

  useEffect(() => {
    if (!signedIn) return
    let live = true
    fetch(`/api/housing/${encodeURIComponent(listingId)}/address`, { cache: 'no-store', credentials: 'same-origin' })
      .then((r) => (r.ok ? r.json() : null))
      .then((body: { addressLine?: string | null } | null) => {
        if (live && body?.addressLine) setAddressLine(body.addressLine)
      })
      .catch(() => {})
    return () => {
      live = false
    }
  }, [signedIn, listingId])

  if (!addressLine) return null
  return (
    <dl className="mb-5">
      <div>
        <dt className="text-2xs font-semibold uppercase tracking-wide text-muted">Address</dt>
        <dd className="mt-0.5 text-body-sm font-medium text-text">{addressLine}</dd>
      </div>
    </dl>
  )
}
