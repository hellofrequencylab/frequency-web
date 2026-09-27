'use client'

import { usePathname, useSearchParams } from 'next/navigation'
import { SpaceProfileMenuView } from '@/components/spaces/space-profile-menu-view'
import type { SpaceProfileTab } from '@/components/spaces/space-profile-tabs'

// THE PERSISTENT SPACE MENU, for a surface that HAS a viewer. Rendered as a direct child of the
// profile page root (DetailTemplate's `stickyNav` slot), so the menu bar pins under the global header
// and stays in view for the whole scroll.
//
// The markup lives in space-profile-menu-view.tsx, which takes `pathname` and `panel` as props. This
// wrapper is the half that reads them from the router, and it is the half the signed-out ISR page
// cannot use: `useSearchParams()` in a prerendered page bails the subtree out of the static HTML, and
// that page is the one crawlers read. See the view file's header for the build error it cost.
//
// The page + anchor tabs are Links (soft-nav; active via usePathname). The operator's "Manage" is a
// soft-nav to `?panel=manage`, which swaps ONLY the profile body (the App Router layout does not
// re-render on a query change) — so the hero + menu stay put and the body becomes the Manage
// dashboard. It is NOT a dropdown/fold-out anymore, and there is no separate CRM item (the CRM lives
// inside the Manage dashboard's Community area now). Only an owner sees the Manage item.
export function SpaceProfileMenu({
  tabs,
  canManage = false,
}: {
  tabs: SpaceProfileTab[]
  /** Whether the viewer manages this Space — gates the "Manage" item. */
  canManage?: boolean
}) {
  return (
    <SpaceProfileMenuView
      tabs={tabs}
      canManage={canManage}
      pathname={usePathname()}
      panel={useSearchParams().get('panel') ?? undefined}
    />
  )
}
