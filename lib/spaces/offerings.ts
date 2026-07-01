// The Offerings surface catalog — the ONE source of truth for which commerce sub-surfaces a Space
// type composes onto the unified Offerings settings page (/spaces/<slug>/settings/offerings).
//
// The console's Offerings group used to show up to five separate type-gated cards, each linking to
// its own settings sub-page (availability / memberships / donations / enrollment / tickets / check-in).
// This collapses them into ONE adaptive surface: the Offerings page stacks whichever of these
// sections apply to THIS space's type, and the console shows a single Offerings card.
//
// PURE metadata (no React, no Supabase, no `'use server'`), so it can be imported by the registry,
// the page, the console, and a unit test alike. Each entry names:
//   - the per-Space FUNCTION that gates the section (the SAME gate the section's body re-checks), and
//   - the Space TYPES that compose the section, and
//   - the anchor `id` the old individual route redirects to (/settings/offerings#<anchor>).
//
// Copy that surfaces to operators/members lives on the section bodies + the registry, not here.

import type { SpaceFunctionKey } from './functions'
import type { SpaceType } from './types'

/** One commerce sub-surface that composes onto the unified Offerings page. */
export interface OfferingSection {
  /** The anchor id on the Offerings page (also the old route's redirect target: #<anchor>). */
  anchor: string
  /** The per-Space function the section's body re-checks (the console gate = the section gate). */
  requiredFunction: SpaceFunctionKey
  /** The Space types that compose this section. */
  types: readonly SpaceType[]
}

/**
 * THE catalog, in the order the sections stack on the Offerings page. This mirrors the type spine
 * the individual surfaces carried before the merge:
 *   practitioner -> Availability
 *   business     -> Memberships
 *   organization -> Donations + Enrollment
 *   event_space  -> Tickets + Check in
 */
export const OFFERING_SECTIONS: readonly OfferingSection[] = [
  { anchor: 'availability', requiredFunction: 'availability', types: ['practitioner'] },
  { anchor: 'memberships', requiredFunction: 'memberships', types: ['business'] },
  { anchor: 'donations', requiredFunction: 'donations', types: ['organization'] },
  { anchor: 'enroll', requiredFunction: 'enroll', types: ['organization'] },
  { anchor: 'tickets', requiredFunction: 'tickets', types: ['event_space'] },
  { anchor: 'checkin', requiredFunction: 'checkin', types: ['event_space'] },
] as const

/** Does a section compose onto this Space type? */
function offeringAppliesToType(section: OfferingSection, type: SpaceType): boolean {
  return section.types.includes(type)
}

/** The offering sections a Space type composes, in stack order (empty for a type with none). */
export function offeringSectionsForType(type: SpaceType): OfferingSection[] {
  return OFFERING_SECTIONS.filter((s) => offeringAppliesToType(s, type))
}

/**
 * Does this Space type have ANY commerce section at all? Gates the console's Offerings CARD: a type
 * with zero commerce functions (lab / partner / coaching / root) shows no Offerings card, so the
 * console never opens an empty Offerings surface. PURE (type alone; the per-tool gate is the page's job).
 */
export function typeHasOfferings(type: SpaceType): boolean {
  return offeringSectionsForType(type).length > 0
}

/** The set of function keys any offering section uses (the console gates the card on "can use one"). */
export function offeringFunctionsForType(type: SpaceType): SpaceFunctionKey[] {
  return offeringSectionsForType(type).map((s) => s.requiredFunction)
}
