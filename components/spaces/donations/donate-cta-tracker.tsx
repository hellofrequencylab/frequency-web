'use client'

import { useEffect, useRef } from 'react'
import { recordSpaceCtaClickAction } from '@/lib/spaces/analytics-actions'

// DONATE CTA TRACKER (client, render-nothing). The Donate engine has no member action button yet
// (giving is not wired up in v1, by design), so there is no click seam to hang the primary-CTA event
// on the way the enroll / reserve buttons do. This thin tracker fires one `space.cta_click` event
// (Epic 1.11) when the Donate surface first mounts, so the organization role keeps the CTA telemetry
// the placeholder session list used to record. Fire-and-forget + fail-safe (the recorder swallows its
// own errors); a strict-mode double-mount is guarded so it fires once per surface. Renders nothing.

export function DonateCtaTracker({ spaceId }: { spaceId: string }) {
  const fired = useRef(false)
  useEffect(() => {
    if (fired.current) return
    fired.current = true
    // Fire-and-forget: kick the recorder off without awaiting. The recorder is itself fail-safe.
    void recordSpaceCtaClickAction(spaceId)
  }, [spaceId])
  return null
}
