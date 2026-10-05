'use client'

import { useEffect, useState } from 'react'
import { useViewer } from '@/components/layout/viewer-chrome'

// The Address fact on a housing detail page, for a signed-in viewer only (SCAN-760).
//
// The page is ISR, so its HTML never carries the street address. The server mounts this only
// when the host chose 'exact'; once ViewerProvider learns the viewer is signed in, the line is
// fetched from /api/housing/[id]/address, which applies the same resolveAddressDisplay rule
// with signedIn: true. Anonymous viewers and crawlers never trigger the fetch, and a fetch
// that fails leaves the row out. Renders a <dt>/<dd> pair, so it sits inside the facts <dl>.
export function ViewerHousingAddress({ listingId }: { listingId: string }) {
  const { signedIn } = useViewer()
  const [addressLine, setAddressLine] = useState<string | null>(null)

  useEffect(() => {
    if (!signedIn) return
    let live = true
    fetch(`/api/housing/${encodeURIComponent(listingId)}/address`, { credentials: 'same-origin' })
      .then((r) => (r.ok ? r.json() : null))
      .then((v: { addressLine?: string | null } | null) => {
        if (live && v?.addressLine) setAddressLine(v.addressLine)
      })
      .catch(() => {})
    return () => {
      live = false
    }
  }, [signedIn, listingId])

  if (!addressLine) return null
  return (
    <div>
      <dt className="text-2xs font-semibold uppercase tracking-wide text-muted">Address</dt>
      <dd className="mt-0.5 text-body-sm font-medium text-text">{addressLine}</dd>
    </div>
  )
}
