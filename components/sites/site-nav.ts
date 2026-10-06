// THE WEBSITE'S SECTION MENU (owner ask 2026-10-06: "create a header menu related to the features of
// the space"). PURE. The menu is built from the blocks the Space actually placed on Home, in their page
// order, each linking to the section anchor its block already renders (ModuleSection `id`, e.g. #faq).
// A block that renders nothing (no FAQ entries yet, no events) leaves an empty `<section id>`, which
// `empty:hidden` already collapses; `siteNavCss` hides that block's menu link the same way, with
// `:has()`, so the menu never offers a section the page does not show and the site needs no client JS.

/** A section a menu can link to: the block id(s) that render it, its anchor and its menu label. */
const SECTIONS: readonly { ids: readonly string[]; anchor: string; label: string }[] = [
  { ids: ['about'], anchor: 'about', label: 'About' },
  { ids: ['story'], anchor: 'story', label: 'Story' },
  { ids: ['offerings'], anchor: 'offerings', label: 'Services' },
  { ids: ['events'], anchor: 'events', label: 'Events' },
  { ids: ['practices'], anchor: 'practices', label: 'Practices' },
  { ids: ['journeys'], anchor: 'journeys', label: 'Journeys' },
  { ids: ['circles'], anchor: 'circles', label: 'Circles' },
  { ids: ['memberships'], anchor: 'memberships', label: 'Memberships' },
  { ids: ['team'], anchor: 'team', label: 'Team' },
  { ids: ['reviews'], anchor: 'reviews', label: 'Reviews' },
  { ids: ['faq'], anchor: 'faq', label: 'FAQ' },
  { ids: ['contact'], anchor: 'contact', label: 'Contact' },
]

/** The anchor the header's Book button scrolls to. */
export const SITE_BOOK_ANCHOR = 'booking'

/** The most section links the header shows; the rest stay in the footer. */
export const SITE_NAV_MAX = 6

export interface SiteSectionLink {
  anchor: string
  label: string
}

/** The menu for a Home page whose placed block ids are `blockIds` (page order, duplicates allowed):
 *  one link per known section, first placement wins, unknown and decorative blocks skipped. */
export function siteSectionLinks(blockIds: readonly string[]): SiteSectionLink[] {
  const out: SiteSectionLink[] = []
  const seen = new Set<string>()
  for (const id of blockIds) {
    const section = SECTIONS.find((s) => s.ids.includes(id))
    if (!section || seen.has(section.anchor)) continue
    seen.add(section.anchor)
    out.push({ anchor: section.anchor, label: section.label })
  }
  return out
}

/** Whether the Space placed a booking block, so the header can offer Book. */
export function siteHasBooking(blockIds: readonly string[]): boolean {
  return blockIds.includes(SITE_BOOK_ANCHOR)
}

/** CSS that hides a menu link (and the Book button) whose section rendered empty. Anchors come only
 *  from the fixed SECTIONS table above, never from stored data, so the rules are safe to inline. */
export function siteNavCss(anchors: readonly string[]): string {
  return anchors
    .map((a) => `[data-site-root]:not(:has(#${a}:not(:empty))) [data-site-link="${a}"]{display:none}`)
    .join('\n')
}
