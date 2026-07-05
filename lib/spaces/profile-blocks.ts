import type { SpaceType } from './types'
import type { SpaceFunctionKey } from './functions'

// The space PROFILE block registry (Epic 1.7, docs/SPACES-EDITOR.md). The member-facing sections of a
// space profile, expressed as module blocks for the block-picker editor that replaces Puck on internal
// pages (Puck stays for marketing/website). Each block declares its gating: an optional SPACE_FUNCTION
// that must be enabled for it to appear by default, and the space types it applies to.
//
// `defaultProfileLayout` derives the FRESH-DEFAULT ordered block list for a space from its type + the
// functions it has enabled (owner decision: fresh default for all at cutover, no Puck doc carry-over).
// The block-picker editor starts from this default and lets the operator toggle/reorder; the saved
// layout fails safe back to this default. PURE (types only) — trivially unit-testable.

/** A member-facing profile section. Mirrors the existing Puck Space* content blocks (structural
 *  blocks like SpaceLayout / IdentityHeader / SectionTitle are chrome, not pickable sections). */
export type ProfileBlockId =
  | 'about'
  | 'highlights'
  | 'offerings'
  | 'booking'
  | 'events'
  | 'practices'
  | 'circles'
  | 'team'
  | 'reviews'
  | 'faq'
  | 'updates'
  | 'contact'
  | 'business'

export interface ProfileBlockDef {
  id: ProfileBlockId
  label: string
  /** One plain line for the block-picker (voice canon: no em dashes). */
  description: string
  /** A SPACE_FUNCTION that must be enabled for this block to appear in the fresh default. `null` = a
   *  universal content section (shown by default for its applicable types, toggleable in the editor). */
  requiresFunction: SpaceFunctionKey | null
  /** Space types this block applies to. `'*'` = every type. */
  types: readonly (SpaceType | '*')[]
  /** Display order in the default profile (ascending). */
  order: number
}

/** THE profile block registry, in default display order. Adding a section = a row here. */
export const PROFILE_BLOCKS: readonly ProfileBlockDef[] = [
  { id: 'about', label: 'About', description: 'Who this space is and what it offers.', requiresFunction: null, types: ['*'], order: 10 },
  { id: 'highlights', label: 'Highlights', description: 'Live counts and standout stats.', requiresFunction: null, types: ['*'], order: 20 },
  { id: 'offerings', label: 'Offerings', description: 'The services or products members can book or buy.', requiresFunction: null, types: ['*'], order: 30 },
  { id: 'booking', label: 'Booking', description: 'Pick a time and book a session.', requiresFunction: 'availability', types: ['*'], order: 40 },
  { id: 'events', label: 'Events', description: 'Upcoming events to show up to.', requiresFunction: null, types: ['*'], order: 50 },
  { id: 'practices', label: 'Practices and journeys', description: 'Practices and journeys to start here.', requiresFunction: null, types: ['*'], order: 60 },
  { id: 'circles', label: 'Circles', description: 'The community circles inside this space.', requiresFunction: null, types: ['*'], order: 70 },
  { id: 'team', label: 'Team', description: 'The people who run this space.', requiresFunction: 'members', types: ['*'], order: 80 },
  { id: 'reviews', label: 'Reviews', description: 'What members say.', requiresFunction: null, types: ['*'], order: 90 },
  { id: 'faq', label: 'FAQ', description: 'Common questions, answered.', requiresFunction: null, types: ['*'], order: 100 },
  { id: 'updates', label: 'Updates', description: 'Recent posts from this space.', requiresFunction: null, types: ['*'], order: 110 },
  { id: 'contact', label: 'Contact and hours', description: 'How and when to reach this space.', requiresFunction: null, types: ['*'], order: 120 },
  { id: 'business', label: 'Business presence', description: 'Find this space online.', requiresFunction: null, types: ['*'], order: 130 },
] as const

/** A profile block by id, or null. */
export function profileBlockById(id: string): ProfileBlockDef | null {
  return PROFILE_BLOCKS.find((b) => b.id === id) ?? null
}

/**
 * The FRESH-DEFAULT ordered profile layout for a space: every registry block whose required function is
 * enabled (or that has none). FUNCTION-ONLY — the stale per-TYPE gate was retired so this matches the
 * live grid palette (blocksForKind('space') filtered by requiresFunction), which never gates by type;
 * the two render paths stay uniform. Pure: pass the set of enabled function keys (resolve those with
 * `spaceFunctionEnabled` in the caller). The `type` param is kept for signature stability (its callers
 * pass it), but no longer restricts the block set.
 */
export function defaultProfileLayout(
  type: SpaceType,
  enabledFunctions: ReadonlySet<SpaceFunctionKey>,
): ProfileBlockId[] {
  void type
  return PROFILE_BLOCKS.filter((b) => b.requiresFunction === null || enabledFunctions.has(b.requiresFunction))
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((b) => b.id)
}
