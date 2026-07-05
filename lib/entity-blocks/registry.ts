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
  { id: 'story', label: 'Story', description: 'The longer story of this space.', category: 'data', kinds: ['space'], order: 15 },
  { id: 'stats', label: 'Highlights', description: 'Headline counts and standout stats.', category: 'data', kinds: ['member', 'space'], order: 20 },
  { id: 'offerings', label: 'Offerings', description: 'The services or products to book or buy.', category: 'data', kinds: ['space'], order: 30 },
  { id: 'booking', label: 'Booking', description: 'Pick a time and book a session.', category: 'data', kinds: ['space'], requiresFunction: 'availability', order: 40 },
  { id: 'events', label: 'Events', description: 'Upcoming events to show up to.', category: 'data', kinds: ['space'], order: 50 },
  { id: 'practices', label: 'Practices and journeys', description: 'Practices and journeys to start here.', category: 'data', kinds: ['space'], order: 60 },
  { id: 'journeys', label: 'Journeys', description: 'The journeys you host here.', category: 'data', kinds: ['space'], order: 66 },
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
  // The SPACE free-form blocks (ADR-542): a Callout and a Features section (space-only, interleaved with the
  // legacy authored blocks in ascending order). The Image Gallery reuses the existing `gallery` block below.
  { id: 'heading', label: 'Heading', description: 'A section heading you write.', category: 'content', kinds: ['member', 'space'], order: 200 },
  { id: 'callout', label: 'Callout', description: 'A highlighted message with a button and an image.', category: 'content', kinds: ['space'], order: 205 },
  { id: 'text', label: 'Text', description: 'A paragraph of your own words.', category: 'content', kinds: ['member', 'space'], order: 210 },
  { id: 'links', label: 'Links', description: 'A row of links (the bio-link list).', category: 'content', kinds: ['member', 'space'], order: 220 },
  { id: 'image', label: 'Image', description: 'A single image.', category: 'content', kinds: ['member', 'space'], order: 230 },
  { id: 'features', label: 'Features', description: 'A set of features, each with an icon, title, and text.', category: 'content', kinds: ['space'], order: 235 },
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

/** The CURATED profile block set (ADR-529 → ADR-536, owner directive: "super simple, only the blocks that
 *  actually connect to real profile info"). This is the OFFERED palette — the block-picker + bench only
 *  surface these, so the operator never sees a block that renders empty (the old "20 listed, 6 working"
 *  mess). A block NOT here is retired from the offer (existing placements still RENDER, fail-safe; they just
 *  cannot be re-added). Kept: the CONNECTED data sections that show live profile info (About, Offerings,
 *  Book, Events, Team, Reviews, Contact, Find-us-online) + the standard/custom content blocks (Heading,
 *  Text, Image). Retired: highlights, practices, circles, faq, updates (no wired data) + gallery, quote,
 *  embed, divider (rarely used), and the authored `links` block (Find-us-online covers links now). */
export const CORE_PROFILE_BLOCK_IDS: ReadonlySet<string> = new Set([
  // Connected data sections — each shows live profile info the operator entered in Identity & Branding /
  // Info & Connect, or a wired feature.
  'about',
  'story',
  'offerings',
  'booking',
  'events',
  'journeys', // The journeys this space hosts (auto-pulled — ADR-542).
  'team',
  'reviews',
  'contact',
  'business', // "Find us online" — the social + business links from Info & Connect (SPACE).
  // Member-only data section (kept for the member profile).
  'topfriends',
  // SPACE free-form blocks (ADR-542): Callout, Image Gallery, Features section.
  'callout',
  'gallery',
  'features',
  // Legacy authored content blocks — kept in the union for the MEMBER palette (Heading/Text/Links/Image);
  // the SPACE palette excludes them (KIND_PALETTE_EXCLUSIONS) in favour of Callout + the connected sections.
  'heading',
  'text',
  'links',
  'image',
])

/** Block ids curated OUT of a specific kind's palette (ADR-536 → ADR-542), even though they are in the core
 *  set for the other kind. The SPACE editor offers ONLY its connected data sections + the four free-form
 *  blocks (Callout, Gallery, Journeys, Features), so the legacy authored blocks are dropped: `links` →
 *  the connected "Find us online" (`business`) covers links; `heading`/`text` → a Callout carries a title +
 *  body; `image` → the Gallery. They stay for the MEMBER, whose profile still uses them. The MEMBER excludes
 *  the space-only free-form `gallery`/`callout`? (both are space-kind here, so blocksForKind already drops
 *  them for members — no member exclusion needed). */
const KIND_PALETTE_EXCLUSIONS: Record<EntityKind, ReadonlySet<string>> = {
  space: new Set(['links', 'heading', 'text', 'image']),
  member: new Set(['gallery']),
}

/** The curated, best-practice palette for a profile builder: `blocksForKind` narrowed to the core set, minus
 *  the per-kind exclusions. */
export function profilePaletteForKind(kind: EntityKind): EntityBlockDef[] {
  const excluded = KIND_PALETTE_EXCLUSIONS[kind]
  return blocksForKind(kind).filter((b) => CORE_PROFILE_BLOCK_IDS.has(b.id) && !excluded.has(b.id))
}
