import type { RowDef } from '@/lib/entity-blocks/layout'
import type { ProfileBlockId } from '@/lib/spaces/profile-blocks'
import { MAX_SECTION_ANCHORS, type SectionNavItem, type SectionPresence } from '@/lib/spaces/section-anchors'

// ─────────────────────────────────────────────────────────────────────────────
// THE SECTION MENU FOR THE PAGE THAT ACTUALLY RENDERS (LIVE-517).
//
// `section-anchors.ts` derives the Home anchor menu from a PUCK DOC. ADR-508 U3
// cut the Home body over to the MODULE ENGINE — `app/(main)/spaces/[slug]/
// (profile)/full/page.tsx` renders `resolveRows(parseEntityLayout(
// preferences.profileLayout), 'space')` through <SpaceProfileModules> and never
// reads the Puck doc at all. The menu kept deriving from the doc, so on Home the
// two describe different pages, and for a Space with no stored doc (`pageDocs`
// absent — Royal Temple, and every Space seeded since the cutover)
// `resolveSpacePageDoc` falls back to the SEEDED DEFAULT, which means the menu is
// derived from a template nobody ever edited or rendered.
//
// WHAT THAT COST, measured rather than argued:
//
//   • `SpaceBooking` maps to the anchor `book`. NO module block renders `#book` —
//     `components/widgets/space-profile/booking.tsx` renders `<ModuleSection
//     anchor="booking">`. So the Book item was a dead link on every Space that
//     showed it, and no test could see it because the two halves were never
//     compared. `moduleAnchorsMatchRenderedSections` in the sibling test is that
//     comparison, and it fails on the old map.
//   • `SpaceFAQ` has no SECTION_ANCHORS entry at all, so a rendered FAQ section
//     can never be linked — while `sectionRendersContent` carries a live
//     `case 'SpaceFAQ'` arm that nothing can reach, because the anchor lookup
//     misses first. `SpaceAbout` is the same: a reachable render rule behind an
//     unreachable anchor.
//   • Royal Temple's saved layout is 13 rows of editorial / gallery / events /
//     circles / faq / contact / business. The seeded default doc it was being
//     menued from holds offerings / booking / practices, none of which are on its
//     page. Its menu agreed with its page only because presence filtered the
//     other three to nothing.
//
// THE RULE HERE: one anchor per block the grid will actually render, in the grid's
// own reading order, and the anchor IS the ProfileBlockId, because that is what
// <ModuleSection> emits. A block whose section we cannot PROVE will render is
// omitted. That asymmetry is deliberate: an omission costs a menu row, a dead
// link costs the reader's trust in the whole menu (the honest-menu rule this
// file inherits from section-anchors.ts).
//
// PURE + total: types only, tolerant of a malformed grid.
// ─────────────────────────────────────────────────────────────────────────────

/** The DOM anchor + short menu label per anchor-able MODULE block. The anchor equals the block id
 *  because `<ModuleSection anchor={…}>` is mounted with the block id in every space-profile block;
 *  the sibling test re-reads those component sources and fails if any pair drifts. The LABELS stay
 *  fixed short nouns (NAMING.md), not the operator's heading, so the menu stays scannable. */
export const MODULE_SECTION_ANCHORS: Record<ProfileBlockId, SectionNavItem> = {
  about: { anchor: 'about', label: 'About' },
  story: { anchor: 'story', label: 'Story' },
  highlights: { anchor: 'highlights', label: 'Highlights' },
  offerings: { anchor: 'offerings', label: 'Offerings' },
  // 🔴 `booking`, NOT `book`. The Puck map said `book` and the renderer says `booking`; that
  // mismatch is the dead link this row exists to close. The LABEL stays "Book" — short, a verb the
  // reader acts on — but the anchor has to be the id the section mounts under.
  booking: { anchor: 'booking', label: 'Book' },
  memberships: { anchor: 'memberships', label: 'Memberships' },
  events: { anchor: 'events', label: 'Events' },
  practices: { anchor: 'practices', label: 'Practices' },
  circles: { anchor: 'circles', label: 'Circles' },
  team: { anchor: 'team', label: 'Team' },
  reviews: { anchor: 'reviews', label: 'Reviews' },
  faq: { anchor: 'faq', label: 'FAQ' },
  contact: { anchor: 'contact', label: 'Contact' },
  business: { anchor: 'business', label: 'Business' },
}

/** Which presence flag proves a LIVE block will render. A block absent from this map is authored:
 *  it renders from the operator's own content bag, and is judged by `authoredHasContent` below. */
const LIVE_FLAG: Partial<Record<ProfileBlockId, keyof SectionPresence>> = {
  about: 'about',
  highlights: 'highlights',
  booking: 'booking',
  events: 'events',
  practices: 'practices',
  circles: 'circles',
  team: 'team',
  reviews: 'reviews',
  faq: 'faqs',
}

/** The authored-content emptiness rule, kept in sync with `hasContent` in
 *  components/entity-blocks/content-block-view.tsx — restated here rather than imported so this
 *  module stays free of React. The sibling test cross-checks the two over a matrix of inputs, so a
 *  change to either side fails by name rather than drifting quietly. */
export function authoredHasContent(id: string, props: Record<string, unknown> | undefined): boolean {
  if (!props) return false
  if (id === 'divider') return true
  return Object.keys(props).length > 0
}

/** Every block id the grid will render, in reading order: row by row, then column by column, then
 *  down each column's stack. Mirrors `<EntityGrid>`'s own traversal of the rows `resolveRows`
 *  returns — which has already dropped hidden ids, unknown types and duplicates. */
export function listGridBlockIds(rows: readonly RowDef[] | null | undefined): string[] {
  const out: string[] = []
  for (const row of Array.isArray(rows) ? rows : []) {
    const cells = Array.isArray(row?.cells) ? row.cells : []
    for (const stack of cells) {
      for (const id of Array.isArray(stack) ? stack : []) {
        if (typeof id === 'string') out.push(id)
      }
    }
  }
  return out
}

/** Will this module block draw a section worth linking to? Live blocks are judged by the presence
 *  flags (the SAME request-cached read the body renders from); authored blocks by their own content
 *  bag. A live block ALSO counts when the operator authored into it, because the block prefers the
 *  authored body over the live data (ADR-542). Unknown ids are false — design and content blocks
 *  (editorial, gallery, zigzag) mount their own anchors and are not menu sections. */
export function moduleSectionRenders(
  id: string,
  presence: SectionPresence,
  content: Record<string, Record<string, unknown>> | undefined,
): boolean {
  // ⚠️ `contact` IS UNDER-COUNTED HERE, on purpose and with a bound. The contact block also draws
  // from the Space's published facts (`profileData` address / phone / email / hours), which this
  // pure module cannot see, so a Space with facts but no authored header reads as "renders
  // nothing". It costs nothing today because `buildSpaceProfileNav` filters `contact` out as a
  // DEDICATED tab either way. If that filter is ever lifted, give contact a presence flag rather
  // than letting it guess — under-counting is safe here only while the anchor is unreachable.
  if (!(id in MODULE_SECTION_ANCHORS)) return false
  const authored = authoredHasContent(id, content?.[id])
  const flag = LIVE_FLAG[id as ProfileBlockId]
  return flag ? presence[flag] || authored : authored
}

/** Derive the pre-populated section menu from the grid the page renders: one anchor per block that
 *  will actually draw, in reading order, deduped, capped at MAX_SECTION_ANCHORS. */
export function deriveModuleSectionNav(
  rows: readonly RowDef[] | null | undefined,
  presence: SectionPresence,
  content?: Record<string, Record<string, unknown>>,
): SectionNavItem[] {
  const seen = new Set<string>()
  const out: SectionNavItem[] = []
  for (const id of listGridBlockIds(rows)) {
    const meta = MODULE_SECTION_ANCHORS[id as ProfileBlockId]
    if (!meta || seen.has(meta.anchor)) continue
    if (!moduleSectionRenders(id, presence, content)) continue
    seen.add(meta.anchor)
    out.push(meta)
    if (out.length >= MAX_SECTION_ANCHORS) break
  }
  return out
}
