// THE CHANNEL MANAGE HUB sections (ADR-870). The Channel Manage console is a
// category-navigated hub, mirroring the event /manage dashboard (events/[slug]/manage/hub.ts)
// and the Space /manage console (space-hub.ts): one master page, a pill sub-menu, and
// `?section=` in the URL so every area is server-rendered + shareable. This is a PURE,
// route-local grouping of the dashboard's own body sections. It is NOT a module catalog and
// declares none (MENU-CONTRACT/ADR-553 stays intact): the channel's admin MODULES still live in
// ADMIN_MODULES, and this hub only arranges the bespoke dashboard the contract already carves
// out for entity consoles. Framework-free (data only), so it is trivially unit-testable.

/** A hub tab id. `home` is the command-center landing: the stat strip + quick links. */
export type ChannelHubSection = 'home' | 'members' | 'circles' | 'program' | 'settings'

/** The hub tabs, in display order. `circles` renders as "Chapters" while the channel runs a
 *  Program (the page swaps the label; the key stays stable so links never break). */
export const CHANNEL_HUB_SECTIONS: readonly {
  key: ChannelHubSection
  label: string
  blurb: string
}[] = [
  {
    key: 'home',
    label: 'Home',
    blurb: 'Your command center: who is tuned in, what is running, and where to go next.',
  },
  {
    key: 'members',
    label: 'Members',
    blurb: 'Everyone tuned in to this Channel, newest first.',
  },
  {
    key: 'circles',
    label: 'Circles',
    blurb: 'The Circles practicing in this Channel, with status and how full each one is.',
  },
  {
    key: 'program',
    label: 'Program',
    blurb: 'The Chapter blueprint: attach one to make this Channel a Program, or run the one it has.',
  },
  {
    key: 'settings',
    label: 'Settings',
    blurb: 'Name, description, category, and visibility, edited in place.',
  },
]

/** The default landing tab. */
export const DEFAULT_CHANNEL_HUB_SECTION: ChannelHubSection = 'home'

/** Narrow an arbitrary `?section=` value to a known hub tab, defaulting to Home. PURE. */
export function asChannelHubSection(raw: string | null | undefined): ChannelHubSection {
  return CHANNEL_HUB_SECTIONS.some((s) => s.key === raw)
    ? (raw as ChannelHubSection)
    : DEFAULT_CHANNEL_HUB_SECTION
}
