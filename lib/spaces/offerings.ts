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
  /** The Space types that compose this section, or '*' for every type. */
  types: readonly (SpaceType | '*')[]
}

/**
 * THE catalog, in the order the sections stack on the Offerings page. UNIVERSAL FUNCTIONS (ADR-517
 * Phase F): every Space has access to every offering, so every section composes onto every type
 * (`types: ['*']`). The comment names each section's ORIGIN Mode preset; it no longer restricts access.
 * Each section body re-checks its own per-Space function gate (now universal) and keeps money dormant.
 */
export const OFFERING_SECTIONS: readonly OfferingSection[] = [
  { anchor: 'availability', requiredFunction: 'availability', types: ['*'] }, // origin: practitioner
  { anchor: 'memberships', requiredFunction: 'memberships', types: ['*'] }, // origin: business
  { anchor: 'donations', requiredFunction: 'donations', types: ['*'] }, // origin: organization
  { anchor: 'enroll', requiredFunction: 'enroll', types: ['*'] }, // origin: organization
  { anchor: 'tickets', requiredFunction: 'tickets', types: ['*'] }, // origin: event_space
  { anchor: 'checkin', requiredFunction: 'checkin', types: ['*'] }, // origin: event_space
] as const

/** Does a section compose onto this Space type? ('*' = every type.) Under universal functions every
 *  section carries '*', so this is true for every real type. */
function offeringAppliesToType(section: OfferingSection, type: SpaceType): boolean {
  return section.types.includes('*') || section.types.includes(type)
}

/** The offering sections a Space type composes, in stack order. UNIVERSAL: every type composes every
 *  section (each section body re-checks its own per-Space function gate, now universal, and keeps money
 *  dormant until the freemium tier lands). */
export function offeringSectionsForType(type: SpaceType): OfferingSection[] {
  return OFFERING_SECTIONS.filter((s) => offeringAppliesToType(s, type))
}

/**
 * Does this Space type have ANY commerce section at all? Gates the console's Offerings CARD. UNIVERSAL
 * (ADR-517 Phase F): every Space can configure every offering, so this is always true for a real type.
 * PURE (type alone; the per-tool gate is the page's job).
 */
export function typeHasOfferings(type: SpaceType): boolean {
  return offeringSectionsForType(type).length > 0
}

/** The set of function keys any offering section uses (the console gates the card on "can use one"). */
export function offeringFunctionsForType(type: SpaceType): SpaceFunctionKey[] {
  return offeringSectionsForType(type).map((s) => s.requiredFunction)
}
