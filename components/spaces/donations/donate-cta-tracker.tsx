'use client'

import { useRef, type ReactNode } from 'react'
import { recordSpaceCtaClickAction } from '@/lib/spaces/analytics-actions'

// DONATE CTA TRACKER (client, render-transparent). The Donate engine has no member action button yet
// (giving is not wired up in v1, by design), so there is no click seam to hang the primary-CTA event
// on the way the enroll / reserve buttons do. This thin tracker fires one `space.cta_click` event
// (Epic 1.11) when the Donate surface first mounts, so the organization role keeps the CTA telemetry
// the placeholder session list used to record. Fire-and-forget + fail-safe (the recorder swallows its
// own errors); a strict-mode double-mount is guarded so it fires once per surface. Renders nothing.
//
// 2026-09-05 (scan2 L9-07): the paragraph above is retired. A click recorded on MOUNT is a click per
// page view, which pre-inflates the count the Space Home dashboard now reads (getSpaceProfileStats).
// The tracker now wraps the amount picker and records ONE `space.cta_click` on the first real click
// inside it (a chip, the custom amount field), the same "on the member's primary interaction" rule
// the enroll / reserve buttons follow. Still fire-and-forget, still once per surface.

export function DonateCtaTracker({ spaceId, children }: { spaceId: string; children: ReactNode }) {
  const fired = useRef(false)
  function handleClickCapture() {
    if (fired.current) return
    fired.current = true
    // Fire-and-forget: kick the recorder off without awaiting. The recorder is itself fail-safe.
    void recordSpaceCtaClickAction(spaceId)
  }
  // A capture-phase listener on a plain wrapper: the picker's own controls keep their handlers and
  // focus behaviour; this only observes the first click that lands anywhere inside.
  return <div onClickCapture={handleClickCapture}>{children}</div>
}
