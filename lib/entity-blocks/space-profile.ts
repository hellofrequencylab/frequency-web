import type { SpaceType } from '../spaces/types'
import type { SpaceFunctionKey } from '../spaces/functions'
import { blocksForKind } from './registry.ts'

// THE SPACE PROFILE SECTIONS, READ FROM THE ONE BLOCK REGISTRY (PROG-E2B, 2026-11-16).
//
// Until this file, the member-facing sections of a Space profile were a second, hand-written catalog
// (lib/spaces/profile-blocks.ts, Epic 1.7): fourteen rows that restated the label, description, order and
// function gate the entity-block registry already held for the same blocks. Two lists of the same thing
// drift, and these had (see SECTION_COPY). That file is gone. A section is now a VIEW of a registry row:
// this module names which registry rows are profile sections and reads everything else from ENTITY_BLOCKS.
//
// What is still local, and why (said plainly, so nobody reads this as "fully unified"):
//   · SECTION_SOURCE: which registry rows are flat profile sections, and the one id that differs. The
//     registry calls the headline counts `stats`; saved profile layouts and the renderer map call the same
//     section `highlights`. The stored id is kept, so no layout is rewritten and no migration is needed.
//   · SECTION_COPY: three descriptions where the profile wording differed from the registry wording. They
//     are kept so the output is byte for byte what it was. Making the two read the same is a copy decision
//     for the owner, not a refactor; delete an entry here and that section takes the registry's line.
//   · The RENDERER map (components/widgets/space-profile/space-profile-modules.tsx) is still its own
//     fourteen-key map. That is a second map, not a second catalog, and it is not folded here.
//
// Nothing here adds a block to a palette: the registry is unchanged, so every palette reads what it read.
// PURE (types and data only). The goldens in space-profile.golden.test.ts freeze the derived list.

/** Profile section id -> the registry row it is a view of. Insertion order is not the display order; the
 *  registry's `order` is. Adding a section = a registry row, then one line here. */
const SECTION_SOURCE = {
  about: 'about',
  story: 'story',
  highlights: 'stats',
  offerings: 'offerings',
  booking: 'booking',
  memberships: 'memberships',
  events: 'events',
  practices: 'practices',
  circles: 'circles',
  team: 'team',
  reviews: 'reviews',
  faq: 'faq',
  contact: 'contact',
  business: 'business',
} as const

/** A member-facing profile section. */
export type ProfileBlockId = keyof typeof SECTION_SOURCE

/** The profile's own one-line descriptions where they differ from the registry's (voice canon: no em
 *  dashes). Kept so the fold changes no output. Unifying the copy is an open question for the owner. */
const SECTION_COPY: Partial<Record<ProfileBlockId, string>> = {
  about: 'Who this space is and what it offers.',
  highlights: 'Live counts and standout stats.',
  offerings: 'The services or products members can book or buy.',
}

interface ProfileBlockDef {
  id: ProfileBlockId
  label: string
  /** One plain line for the block-picker. */
  description: string
  /** A SPACE_FUNCTION that must be enabled for this section to appear in the fresh default. `null` = a
   *  universal content section. */
  requiresFunction: SpaceFunctionKey | null
  /** Space types this section applies to. `'*'` = every type (the per-type gate was retired). */
  types: readonly (SpaceType | '*')[]
  /** Display order in the default profile (ascending). */
  order: number
}

const SECTION_IDS = Object.keys(SECTION_SOURCE) as ProfileBlockId[]

/** The profile sections, derived from the registry's Space blocks in the registry's order. A section whose
 *  registry row is missing is left out (fail-safe); the goldens fail on that, so it cannot ship quietly. */
export const PROFILE_BLOCKS: readonly ProfileBlockDef[] = blocksForKind('space').flatMap((row) => {
  const id = SECTION_IDS.find((sectionId) => SECTION_SOURCE[sectionId] === row.id)
  if (!id) return []
  return [
    {
      id,
      label: row.label,
      description: SECTION_COPY[id] ?? row.description,
      requiresFunction: row.requiresFunction ?? null,
      types: ['*'],
      order: row.order,
    },
  ]
})

/** A profile section by id, or null. */
export function profileBlockById(id: string): ProfileBlockDef | null {
  return PROFILE_BLOCKS.find((b) => b.id === id) ?? null
}

/**
 * The FRESH-DEFAULT ordered profile layout for a space: every section whose required function is enabled
 * (or that has none). FUNCTION-ONLY: the per-TYPE gate was retired so this matches the live grid palette,
 * which never gates by type. Pure: pass the set of enabled function keys. The `type` param is kept for
 * signature stability (its callers pass it) and does not restrict the set.
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
