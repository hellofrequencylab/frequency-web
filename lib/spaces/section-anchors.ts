import type { Data } from '@/lib/page-editor/types'

// ─────────────────────────────────────────────────────────────────────────────
// SECTION ANCHORS — the profile nav's PRE-POPULATED menu (feature-block model).
//
// A Space's default menu is not a set of separate pages: it is a row of ANCHOR
// links into the sections of the Home page, one per feature block the operator
// has placed (Offerings, Book, Events, Reviews, FAQ, About, Contact, ...). The
// chrome derives the menu FROM the page doc, so rearranging blocks in the editor
// re-derives the menu with zero extra operator work; custom sub-pages (the
// `pages` model) still append after the anchors.
//
// HONEST MENU: an anchor is included only when its section will actually render,
// so a link never scrolls to an empty spot. Authored sections (About, Contact,
// Offerings, Team, Quick links) are knowable from the doc's own props; live
// sections (Events, Reviews, FAQ, Booking, Practices, Circles, Updates) come
// from the caller-supplied presence flags (one request-cached read, shared with
// the page body's render — lib/spaces/content-data.ts).
//
// PURE + total: no server/Next imports, tolerant of malformed docs.
// ─────────────────────────────────────────────────────────────────────────────

/** One derived menu item: the section's DOM anchor + its short menu label. */
export interface SectionNavItem {
  anchor: string
  label: string
}

/** Which LIVE sections currently have real rows to show (one shared read per request). */
export interface SectionPresence {
  booking: boolean
  events: boolean
  reviews: boolean
  faqs: boolean
  updates: boolean
  practices: boolean
  community: boolean
}

/** Every flag false: the fail-safe presence for callers that cannot (or need not) read live data. */
export const NO_PRESENCE: SectionPresence = {
  booking: false,
  events: false,
  reviews: false,
  faqs: false,
  updates: false,
  practices: false,
  community: false,
}

/** The DOM anchor + short menu label per anchor-able block type. Blocks not listed here (layout
 *  boxes, stat strips, CTA hooks) never appear in the menu. The LABELS are fixed short nouns, not
 *  the operator's section heading, so the menu stays scannable (a heading can be a full sentence). */
export const SECTION_ANCHORS: Record<string, SectionNavItem> = {
  SpaceOfferings: { anchor: 'offerings', label: 'Offerings' },
  SpaceBooking: { anchor: 'book', label: 'Book' },
  SpaceEvents: { anchor: 'events', label: 'Events' },
  SpacePractices: { anchor: 'practices', label: 'Practices' },
  SpaceCommunity: { anchor: 'community', label: 'Community' },
  SpaceReviews: { anchor: 'reviews', label: 'Reviews' },
  SpaceFAQ: { anchor: 'faq', label: 'FAQ' },
  SpaceUpdates: { anchor: 'updates', label: 'Updates' },
  SpaceTeam: { anchor: 'team', label: 'Team' },
  SpaceAbout: { anchor: 'about', label: 'About' },
  SpaceContact: { anchor: 'contact', label: 'Contact' },
}

/** The most anchors the menu shows (Home + anchors + custom pages must stay one scannable row). */
export const MAX_SECTION_ANCHORS = 7

type AnyBlock = { type?: unknown; props?: Record<string, unknown> }

/** The doc's section-level blocks in READING order: top-level content, with a SpaceLayout box
 *  expanded main-column-first then side rail (matching the rendered visual order on desktop). */
export function listSectionBlocks(doc: Data | null | undefined): AnyBlock[] {
  const content = Array.isArray(doc?.content) ? (doc?.content as AnyBlock[]) : []
  const out: AnyBlock[] = []
  for (const block of content) {
    if (block?.type === 'SpaceLayout') {
      const props = (block.props ?? {}) as Record<string, unknown>
      for (const slot of ['main', 'side']) {
        const items = props[slot]
        if (Array.isArray(items)) out.push(...(items as AnyBlock[]))
      }
      continue
    }
    out.push(block)
  }
  return out
}

const filled = (v: unknown): boolean => typeof v === 'string' && v.trim().length > 0

/** Will this block render VISIBLE content on the live page? Authored blocks are judged from their
 *  own props; live blocks from the presence flags. Unknown types default to false (never a dead
 *  menu link). Mirrors each block's own honest-empty rule (profile.tsx / spaces.tsx). */
export function sectionRendersContent(block: AnyBlock, presence: SectionPresence): boolean {
  const props = (block.props ?? {}) as Record<string, unknown>
  switch (block.type) {
    case 'SpaceOfferings': {
      const items = Array.isArray(props.items) ? (props.items as Record<string, unknown>[]) : []
      return items.some((o) => filled(o?.title) || filled(o?.blurb))
    }
    case 'SpaceTeam': {
      const members = Array.isArray(props.members) ? (props.members as Record<string, unknown>[]) : []
      return members.some((m) => filled(m?.name) || filled(m?.role))
    }
    case 'SpaceAbout':
      return filled(props.body)
    case 'SpaceContact':
      return (
        filled(props.address) || filled(props.hours) || filled(props.phone) || filled(props.email) || filled(props.linkHref)
      )
    case 'SpaceBooking':
      return presence.booking
    case 'SpaceEvents':
      return presence.events
    case 'SpaceReviews':
      return presence.reviews
    case 'SpaceFAQ':
      return presence.faqs
    case 'SpaceUpdates':
      return presence.updates
    case 'SpacePractices':
      return presence.practices
    case 'SpaceCommunity':
      return presence.community
    default:
      return false
  }
}

/** Derive the pre-populated section menu for a page doc: one anchor item per anchor-able block that
 *  will actually render, in reading order, deduped by anchor, capped at MAX_SECTION_ANCHORS. */
export function deriveSectionNav(doc: Data | null | undefined, presence: SectionPresence): SectionNavItem[] {
  const seen = new Set<string>()
  const out: SectionNavItem[] = []
  for (const block of listSectionBlocks(doc)) {
    const meta = typeof block.type === 'string' ? SECTION_ANCHORS[block.type] : undefined
    if (!meta || seen.has(meta.anchor)) continue
    if (!sectionRendersContent(block, presence)) continue
    seen.add(meta.anchor)
    out.push(meta)
    if (out.length >= MAX_SECTION_ANCHORS) break
  }
  return out
}
