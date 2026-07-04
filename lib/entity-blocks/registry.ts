import type { SpaceFunctionKey } from '@/lib/spaces/functions'

// The UNIFIED entity-block registry (ADR-508, U1). ONE catalog of the blocks a member (Spotlight) or a
// space (Spaces) profile can show, so the same block is a Loom App applicable to any entity and the
// shared grid block-picker (U2) reads one source. It unifies the two prior systems:
//   • Space profile sections  (lib/spaces/profile-blocks.ts, S1) — DATA blocks bound to live space data.
//   • Spotlight blocks         (lib/spotlight/blocks/schema.ts)  — CONTENT blocks the member authors
//                                                                  + a couple of member DATA blocks.
// PURE (types + data only), so it is trivially testable and safe to import anywhere. ADDITIVE: this is
// the new source of truth the U2 editor + U3 cutover build on; the live Spotlight (Puck) and Space
// (S1-S3) renders are untouched until U3.

/** Which kind of entity a profile belongs to. The block context is discriminated on this. */
export type EntityKind = 'member' | 'space'

/** How a block gets its content:
 *  - `data`    — bound to the entity's LIVE data (offerings, stats, reviews). The block renders a
 *                display of connected data; the operator toggles/orders it, never authors its content.
 *  - `content` — free-form, operator-AUTHORED (a heading, a paragraph, a link list, an image).
 */
export type EntityBlockCategory = 'data' | 'content'

/** A block in the unified catalog. Each is (or becomes) a Loom App applicable to the entity kinds it
 *  supports. `requiresFunction` gates a space DATA block on a SPACE_FUNCTION being enabled (member
 *  blocks never set it). Copy is voice-canon: no em dashes. */
export interface EntityBlockDef {
  id: string
  label: string
  description: string
  category: EntityBlockCategory
  /** The entity kinds this block can appear on. A block on both is truly shared. */
  kinds: readonly EntityKind[]
  /** Space-only: the SPACE_FUNCTION that must be enabled for this DATA block to appear by default. */
  requiresFunction?: SpaceFunctionKey
  /** Default display order within a fresh profile (ascending). */
  order: number
}

// ── DATA blocks bound to entity data ──────────────────────────────────────────────────────────────
// `about` + `stats` are the two truly shared DATA blocks (both a member and a space have an identity
// blurb + headline counts). The rest are space sections (no member equivalent) or member-only.
const DATA_BLOCKS: readonly EntityBlockDef[] = [
  { id: 'about', label: 'About', description: 'The identity blurb and story.', category: 'data', kinds: ['member', 'space'], order: 10 },
  { id: 'stats', label: 'Highlights', description: 'Headline counts and standout stats.', category: 'data', kinds: ['member', 'space'], order: 20 },
  { id: 'offerings', label: 'Offerings', description: 'The services or products to book or buy.', category: 'data', kinds: ['space'], order: 30 },
  { id: 'booking', label: 'Booking', description: 'Pick a time and book a session.', category: 'data', kinds: ['space'], requiresFunction: 'availability', order: 40 },
  { id: 'events', label: 'Events', description: 'Upcoming events to show up to.', category: 'data', kinds: ['space'], order: 50 },
  { id: 'practices', label: 'Practices and journeys', description: 'Practices and journeys to start here.', category: 'data', kinds: ['space'], order: 60 },
  { id: 'circles', label: 'Circles', description: 'The community circles inside this space.', category: 'data', kinds: ['space'], order: 70 },
  { id: 'team', label: 'Team', description: 'The people who run this space.', category: 'data', kinds: ['space'], requiresFunction: 'members', order: 80 },
  { id: 'reviews', label: 'Reviews', description: 'What members say.', category: 'data', kinds: ['space'], order: 90 },
  { id: 'faq', label: 'FAQ', description: 'Common questions, answered.', category: 'data', kinds: ['space'], order: 100 },
  { id: 'updates', label: 'Updates', description: 'Recent posts.', category: 'data', kinds: ['space'], order: 110 },
  { id: 'contact', label: 'Contact and hours', description: 'How and when to reach this space.', category: 'data', kinds: ['space'], order: 120 },
  { id: 'business', label: 'Business presence', description: 'Find this space online.', category: 'data', kinds: ['space'], order: 130 },
  { id: 'topfriends', label: 'Top friends', description: 'The people this member is closest to.', category: 'data', kinds: ['member'], order: 140 },
]

// ── CONTENT blocks the operator authors (shared by both kinds) ─────────────────────────────────────
// Generalized from Spotlight's authored block types so a space can use them too (a hand-written
// heading, blurb, link row, image, gallery, quote, embed, or divider anywhere in the grid).
const CONTENT_BLOCKS: readonly EntityBlockDef[] = [
  { id: 'heading', label: 'Heading', description: 'A section heading you write.', category: 'content', kinds: ['member', 'space'], order: 200 },
  { id: 'text', label: 'Text', description: 'A paragraph of your own words.', category: 'content', kinds: ['member', 'space'], order: 210 },
  { id: 'links', label: 'Links', description: 'A row of links (the bio-link list).', category: 'content', kinds: ['member', 'space'], order: 220 },
  { id: 'image', label: 'Image', description: 'A single image.', category: 'content', kinds: ['member', 'space'], order: 230 },
  { id: 'gallery', label: 'Gallery', description: 'A grid of images.', category: 'content', kinds: ['member', 'space'], order: 240 },
  { id: 'quote', label: 'Quote', description: 'A pulled quote with attribution.', category: 'content', kinds: ['member', 'space'], order: 250 },
  { id: 'embed', label: 'Embed', description: 'An embedded video or player.', category: 'content', kinds: ['member', 'space'], order: 260 },
  { id: 'divider', label: 'Divider', description: 'A visual break between sections.', category: 'content', kinds: ['member', 'space'], order: 270 },
]

/** THE unified block catalog (data sections first, then authored content), in default order. */
export const ENTITY_BLOCKS: readonly EntityBlockDef[] = [...DATA_BLOCKS, ...CONTENT_BLOCKS]

/** A block by id, or null. */
export function entityBlockById(id: string): EntityBlockDef | null {
  return ENTITY_BLOCKS.find((b) => b.id === id) ?? null
}

/** Whether a block supports an entity kind. */
export function blockSupportsKind(block: EntityBlockDef, kind: EntityKind): boolean {
  return block.kinds.includes(kind)
}

/** Block ids the MEMBER profile CHROME already renders canonically (ADR-522): the bio in the identity
 *  band and the Zaps/Gems/Streak/Rank in the Standing card. They stay valid registry member blocks (so
 *  the generic layout mechanics + a SPACE profile's own about/highlights are untouched), but the in-app
 *  member builder holds them OUT of its palette + bench so a member cannot add a duplicate of the chrome.
 *  The member starter layouts omit them too, so a fresh member never double-renders. */
export const MEMBER_CHROME_BLOCK_IDS: readonly string[] = ['about', 'stats']

/** Every block available to an entity kind, in default order. The kind-specific default LAYOUT (which
 *  of these show by default, gated by space functions) is resolved per surface in U2/U3; this is the
 *  full palette the block-picker offers. */
export function blocksForKind(kind: EntityKind): EntityBlockDef[] {
  return ENTITY_BLOCKS.filter((b) => blockSupportsKind(b, kind)).slice().sort((a, b) => a.order - b.order)
}
