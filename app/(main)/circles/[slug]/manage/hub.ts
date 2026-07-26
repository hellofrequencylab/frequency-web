// THE CIRCLE MANAGE HUB sections (ADR-828 standardization). The circle console adopts the SAME
// category-navigated hub the Space /manage console (space-hub.ts) and the event Manage hub
// (events/[slug]/manage/hub.ts) use: one master page, a pill sub-menu, `?section=` in the URL.
// A PURE, route-local grouping of the page's own areas — NOT a module catalog (MENU-CONTRACT/
// ADR-553 stays intact): the circle's admin modules stay in ADMIN_MODULES and render through
// the shared EntityManageConsole under the Settings tab.

/** A hub tab id. `home` is the command-center landing: the stat strip + the message center. */
export type CircleHubSection = 'home' | 'settings'

/** The hub tabs, in display order. Home leads (stats + the message center, the owner directive:
 *  messaging sits up front on every primary management dashboard). */
export const CIRCLE_HUB_SECTIONS: readonly {
  key: CircleHubSection
  label: string
  blurb: string
}[] = [
  {
    key: 'home',
    label: 'Home',
    blurb: 'Your command center: the numbers at a glance, and a direct line to every member.',
  },
  {
    key: 'settings',
    label: 'Settings',
    blurb: 'Everything about your circle, edited in place: basics, place and time, people, engage, and the danger zone.',
  },
]

/** The default landing tab. */
export const DEFAULT_CIRCLE_HUB_SECTION: CircleHubSection = 'home'

/** Narrow an arbitrary `?section=` value to a known hub tab, defaulting to Home. PURE. */
export function asCircleHubSection(raw: string | null | undefined): CircleHubSection {
  return CIRCLE_HUB_SECTIONS.some((s) => s.key === raw) ? (raw as CircleHubSection) : DEFAULT_CIRCLE_HUB_SECTION
}
