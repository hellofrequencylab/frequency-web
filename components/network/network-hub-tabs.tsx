'use client'

import { usePathname } from 'next/navigation'
import { NetworkTabs } from '@/components/network/network-tabs'

// Hub chrome placement (ADR-172): the Community page now renders the tab strip
// *inline*, below its own page header (header → divider → tabs → content), so it
// owns the order. Every OTHER surface under the Network hub (My Contacts and its
// sub-pages) still gets the strip from the layout, on top, as before.
//
// This wrapper sits in the layout and simply withholds the strip on the bare
// `/network` index — where the page draws its own — while keeping it for the
// rest of the hub. One tab component, one source of truth, two placements.
export function NetworkHubTabs() {
  const pathname = usePathname()
  if (pathname === '/network') return null
  return <NetworkTabs />
}
