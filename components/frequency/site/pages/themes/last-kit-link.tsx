'use client'

import Link from 'next/link'
import { useSyncExternalStore } from 'react'
import { lastKitFrom } from '@/lib/create-space/last-kit'
import { themePagePath } from '@/lib/themes/library'

const noopSubscribe = () => () => {}

/** A quiet pill, bottom left of /themes, back to the kit page they last looked at (the fq_last_kit cookie,
 *  lib/create-space/last-kit.ts). Renders nothing on the server and for a first-time visitor, so the HTML is the same for
 *  everyone. */
export function LastKitLink() {
  const kit = useSyncExternalStore(noopSubscribe, () => lastKitFrom(document.cookie), () => null)
  if (!kit) return null
  return (
    <Link
      href={themePagePath(kit)}
      className="fixed bottom-4 left-4 z-40 rounded-full bg-surface px-4 py-2 text-body-sm font-medium text-muted shadow-sm ring-1 ring-border hover:text-text"
    >
      Back to the kit you were viewing
    </Link>
  )
}
