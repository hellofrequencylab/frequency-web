// THE SPACE CONSOLE'S BACK LINK (one place). A console page's back link names its PARENT, the hub tab its
// catalog row lives on (lib/admin/modules/space-modules.ts `hub`), never "Manage" or the Home dashboard
// by habit. The sidebar lights that same tab for the page (space-console.tsx `match`), so the back link and
// the highlighted row always agree. PURE: no React, no reads.

import type { SpaceHubSection } from '@/lib/admin/modules/space-modules'
import { isConsoleSpaceType, spaceManageHref, type SpaceType } from '@/lib/spaces/types'

// The tab names, kept here (a test pins them to SPACE_HUB_SECTION_LABEL) so the ~30 console pages that build a
// back link do not each pull the whole module catalog and its icons into their bundle.
const TAB_LABEL: Record<SpaceHubSection, string> = {
  dashboard: 'Home',
  resonance: 'Community Resonance',
  marketing: 'Marketing',
  offerings: 'Offerings & Money',
  programs: 'Content & Programs',
  settings: 'Profile & Settings',
}

interface ConsoleBack {
  href: string
  label: string
}

/** The back link to a hub tab of a Space's console. Home is the bare /manage; every other tab is
 *  /manage?section=<tab> and wears the tab's own name. */
export function consoleBack(slug: string, tab: SpaceHubSection): ConsoleBack {
  const base = `/spaces/${slug}/manage`
  return { href: tab === 'dashboard' ? base : `${base}?section=${tab}`, label: TAB_LABEL[tab] }
}

/** The same link for a page that also serves a Space type with no console (it keeps its legacy settings
 *  hub, spaceManageHref): there the parent is that hub, named "Manage". */
export function consoleBackFor(space: { type: SpaceType; slug: string }, tab: SpaceHubSection): ConsoleBack {
  return isConsoleSpaceType(space.type)
    ? consoleBack(space.slug, tab)
    : { href: spaceManageHref(space.type, space.slug), label: 'Manage' }
}
