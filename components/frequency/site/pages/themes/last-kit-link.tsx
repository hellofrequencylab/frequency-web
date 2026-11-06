'use client'

import Link from 'next/link'
import { useSyncExternalStore } from 'react'
import { lastKitFrom } from '@/lib/create-space/last-kit'
import { themePagePath } from '@/lib/themes/library'

/** Kit id (the builder's theme id) to the name a visitor reads. */
const KIT_NAMES: Record<string, string> = {
  'new-world': 'New World',
  'network-kit': 'Network',
  services: 'Services',
  designer: 'Designer',
  bold: 'Bold',
  'temple-kit': 'Temple',
  cyberwitch: 'CyberWitch',
  wildheart: 'Wildheart',
  midnight: 'Nocturne',
}

const noopSubscribe = () => () => {}

/** A quiet pill, bottom left of /themes, back to the kit page they last looked at (the fq_last_kit cookie,
 *  lib/create-space/last-kit.ts). Renders nothing on the server and for a first-time visitor, so the HTML is the same for
 *  everyone. */
export function LastKitLink() {
  const kit = useSyncExternalStore(noopSubscribe, () => lastKitFrom(document.cookie), () => null)
  const name = kit ? KIT_NAMES[kit] : null
  if (!kit || !name) return null
  return (
    <Link
      href={themePagePath(kit)}
      className="fixed bottom-4 left-4 z-40 rounded-pill bg-surface px-4 py-2 text-body-sm font-medium text-muted lift-1 ring-1 ring-border hover:text-text"
    >
      Back to the {name} kit
    </Link>
  )
}
