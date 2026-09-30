import type { SpaceProfileTab } from '@/components/spaces/space-profile-tabs'

// THE SPACE MENU'S BUDGET — the pure half of the condensed menu (LIVE-529).
//
// WHAT THIS FIXES, measured, because the number is the whole argument. The Space profile menu was a
// flat `overflow-x-auto` scroller with no grouping and no overflow control. Its renderer's own header
// recorded the consequence: on a 360px phone a Space with seven tabs
// (Home/Book/Events/Practices/Calendar/Circles/Reviews, ~536px against a 328px content column) put
// roughly 210px of its own navigation past the right edge. Mobile browsers hide the scrollbar at
// rest, so the last tabs were reachable only by a horizontal drag most people never discover.
//
// 🔴 AND IT COULD ONLY GET WORSE. Two of the sources feeding that list are UNBOUNDED: the Home
// section anchors (one per module row the operator's layout renders) and the operator's custom
// sub-pages (as many as they create). Every earlier fix in this area — the gutter bleed, `shrink-0`,
// suppressing the duplicate `#reviews` / `#circles` / `#contact` / `#events` anchors — made a fixed
// list render better. None of them bounded it. This module bounds it.
//
// WHY THE PARTITION IS PURE AND LIVES HERE, not in the renderer: the SAME menu renders on the
// signed-out ISR share URL (a server component) and on the signed-in member surfaces (a client
// wrapper). A shared pure function is the only way those two can be condensed identically, and it is
// the only way the consequence — "nothing became unreachable" — can be measured without a browser.
//
// 🔴 WHAT THIS MODULE MUST NOT DO: it must not drop a row. Condensing is not hiding. Every tab handed
// in comes back out, in exactly one of the two halves, which is the invariant LIVE-529's probe
// measures over a worst-case row set.

/**
 * How many menu rows stay VISIBLE in the bar, Home included. The rest move into the "More"
 * disclosure, which is one additional control and is not counted here.
 *
 * WHY FOUR. Measured at the default viewer generation on a 360px phone, against the ~360px the
 * gutter-bled bar spans: the four widest plausible labels a Space actually renders
 * (Home 58px · Calendar 84px · Memberships 112px · Circles 72px, plus three 4px gaps) come to
 * ~338px, and the More chip is ~76px more. So four rows plus More fits ONE line for the common
 * label set and wraps to at most TWO short lines in the worst case. Both outcomes are reachable
 * without a horizontal drag, which is the thing the old bar could not promise at any width.
 *
 * Three would always fit one line and was rejected: it leaves a Space only two destinations besides
 * Home, and a menu that folds almost everything reads as a menu that has nothing in it. Five is
 * ~494px, which is two lines at 360px in the COMMON case rather than the worst one, and is barely a
 * condense against the 536px that started this.
 *
 * The number is deliberately not responsive. The same menu renders on the public chrome and the
 * owner surfaces by design, and a per-breakpoint budget would need every row in the markup twice
 * (once shown, once folded) for CSS to choose between them, which is two accessible names for one
 * destination and a duplicate link in the crawled HTML.
 */
export const SPACE_MENU_VISIBLE_BUDGET = 4

/**
 * The lead ranking: which DESTINATIONS earn a visible row first, keyed on the last path segment.
 *
 * The order the tab list arrives in was never a priority ranking — it grew one row at a time, and
 * it puts Collaborators ahead of Circles purely because Collaborators shipped first. Ranking here
 * instead makes the fold STABLE: an operator adding a Home section or a custom page can no longer
 * evict Circles from the bar.
 *
 * Why this order:
 *   1. calendar      — what is happening, and the reason to come back.
 *   2. circles       — a Space's community IS its Circles (docs/NAMING.md, ADR-1091).
 *   3. memberships   — the door that joins, and the commercial answer to "what is this place".
 *   4. shop          — the other commercial door, for a Space that published a storefront.
 *   5. contact       — how a person reaches a real business.
 *   6. reviews       — social proof; valuable, but nobody arrives for it.
 *   7. people        — the member directory: a narrower audience (members and managers only).
 *   8. collaborators — who this Space works with; least often the reason for the visit.
 *
 * Anything not listed keeps its source order BEHIND these: first the operator's custom sub-pages,
 * then the Home section anchors. Anchors fold last-in/first-out for a reason that is not about
 * value — an anchor only scrolls a page the reader can already scroll, so folding one costs less
 * than folding a destination they would otherwise have no route to.
 *
 * 🔴 Keyed on the SEGMENT, never the label. The Shop tab's word is operator-renameable
 * (`storefront.tabLabel`) and a custom page's label is free text, so a label-keyed rank would be an
 * operator-controlled ranking. Every segment here is also a RESERVED page slug, so a custom page
 * cannot borrow one of these ranks.
 */
export const SPACE_MENU_LEAD_SEGMENTS = [
  'calendar',
  'circles',
  'memberships',
  'shop',
  'contact',
  'reviews',
  'people',
  'collaborators',
] as const

/** The bar, and the tail behind the "More" disclosure. Together they are always the whole input. */
interface CondensedSpaceMenu {
  /** The rows the bar shows, Home first. At most `budget` of them. */
  primary: SpaceProfileTab[]
  /** The rest, in the "More" disclosure. Real links in the DOM whether it is open or shut. */
  overflow: SpaceProfileTab[]
}

/** An in-page jump (`/spaces/x#offerings`) rather than a route. */
function isAnchor(tab: SpaceProfileTab): boolean {
  return tab.href.includes('#')
}

/** Lower sorts earlier. Ranked lead segments, then custom pages, then Home section anchors. */
function rankOf(tab: SpaceProfileTab): number {
  const tail = SPACE_MENU_LEAD_SEGMENTS.length
  if (isAnchor(tab)) return tail + 1
  const path = tab.href.split('?')[0].replace(/\/+$/, '')
  const segment = path.slice(path.lastIndexOf('/') + 1)
  const at = (SPACE_MENU_LEAD_SEGMENTS as readonly string[]).indexOf(segment)
  return at >= 0 ? at : tail
}

/**
 * Split `tabs` into the rows the bar shows and the tail the "More" disclosure holds.
 *
 * `tabs[0]` is Home (the profile index) and is always visible: it is the one row that is also the
 * page every other row hangs off, and a menu whose own index is folded is not a menu.
 *
 * Order within each half is the lead ranking above, then source order, so the result is stable
 * against an operator adding rows: the same Space always folds the same way.
 */
export function condenseSpaceProfileNav(
  tabs: SpaceProfileTab[],
  budget: number = SPACE_MENU_VISIBLE_BUDGET,
): CondensedSpaceMenu {
  if (tabs.length === 0) return { primary: [], overflow: [] }
  const [home, ...rest] = tabs
  const ordered = rest
    .map((tab, i) => ({ tab, i, rank: rankOf(tab) }))
    // Sorted explicitly on the source index rather than leaning on sort stability, so the fold is
    // the same on every engine.
    .sort((a, b) => a.rank - b.rank || a.i - b.i)
    .map((r) => r.tab)
  // Home takes one of the slots, and there is always at least one slot.
  const room = Math.max(1, Math.trunc(budget)) - 1
  return { primary: [home, ...ordered.slice(0, room)], overflow: ordered.slice(room) }
}

/**
 * Never fold the row the viewer is STANDING ON.
 *
 * Without this, a member who opens Reviews watches the Reviews row vanish from the bar at the moment
 * it becomes their location — the menu would stop answering "where am I", which is the one question
 * a persistent menu exists to answer. The active row trades places with the lowest-ranked visible
 * row, so the budget is exactly as it was and the demoted row goes to the FRONT of the tail (it
 * outranks everything already there, so the tail stays in rank order).
 *
 * `isActive` is the renderer's own predicate, passed in rather than reimplemented: the bar and this
 * promotion can then never disagree about which row is lit.
 */
export function keepActiveVisible(
  menu: CondensedSpaceMenu,
  isActive: (tab: SpaceProfileTab) => boolean,
): CondensedSpaceMenu {
  // With one visible slot it is Home's, and there is nothing to trade.
  if (menu.primary.length < 2) return menu
  const at = menu.overflow.findIndex(isActive)
  if (at < 0) return menu
  const primary = [...menu.primary]
  const overflow = [...menu.overflow]
  const [active] = overflow.splice(at, 1)
  overflow.unshift(primary[primary.length - 1])
  primary[primary.length - 1] = active
  return { primary, overflow }
}
