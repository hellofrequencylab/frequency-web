'use client'

import Link from 'next/link'
import { buttonClasses } from '@/components/ui/button'
import { recordSpaceCtaClickAction } from '@/lib/spaces/analytics-actions'

// THE PRIMARY-CTA LINK (Epic 1.11, CTA-click telemetry). The session-list CTA on an entity profile is
// plain navigation to the session page, so there is no server seam on the action path to hang a write
// on. This thin client wrapper adds one: on click it fires `recordSpaceCtaClickAction` fire-and-forget
// (the `void`-ed promise is never awaited) and then lets the <Link> navigate as normal. It mirrors the
// profile-view tracker: non-blocking, fail-safe (the action swallows its own errors), and it never
// preventDefaults, so a telemetry hiccup can never stop the member reaching the session.
//
// Styling stays the kit primary button (buttonClasses), identical to the server-rendered CTA it replaces.

export function EntityCtaLink({
  spaceId,
  href,
  label,
}: {
  spaceId: string
  href: string
  label: string
}) {
  return (
    <Link
      href={href}
      className={buttonClasses('primary', 'sm', 'w-full justify-center')}
      onClick={() => {
        // Fire-and-forget: kick the recorder off and keep navigating. The action is itself fail-safe.
        void recordSpaceCtaClickAction(spaceId)
      }}
    >
      {label}
    </Link>
  )
}
