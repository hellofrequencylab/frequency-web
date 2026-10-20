// THE SPACE CONSOLE'S BACK LINK (one place). A console page's back link names its PARENT, the hub tab its
// catalog row lives on (lib/admin/modules/space-modules.ts `hub`), never "Manage" or the Home dashboard
// by habit. The sidebar lights that same tab for the page (space-console.tsx `match`), so the back link and
// the highlighted row always agree. PURE: no React, no reads.

import { SPACE_HUB_SECTION_LABEL, type SpaceHubSection } from '@/lib/admin/modules/space-hub'
import { isConsoleSpaceType, spaceManageHref, type SpaceType } from '@/lib/spaces/types'

interface ConsoleBack {
  href: string
  label: string
}

/** The back link to a hub tab of a Space's console. Home is the bare /manage; every other tab is
 *  /manage?section=<tab> and wears the tab's own name. */
export function consoleBack(slug: string, tab: SpaceHubSection): ConsoleBack {
  const base = `/spaces/${slug}/manage`
  return { href: tab === 'dashboard' ? base : `${base}?section=${tab}`, label: SPACE_HUB_SECTION_LABEL[tab] }
}

/** The same link for a page that also serves a Space type with no console (it keeps its legacy settings
 *  hub, spaceManageHref): there the parent is that hub, named "Manage". */
export function consoleBackFor(space: { type: SpaceType; slug: string }, tab: SpaceHubSection): ConsoleBack {
  return isConsoleSpaceType(space.type)
    ? consoleBack(space.slug, tab)
    : { href: spaceManageHref(space.type, space.slug), label: 'Manage' }
}
