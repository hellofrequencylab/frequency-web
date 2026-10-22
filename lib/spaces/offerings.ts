// The Offerings surface catalog — the ONE source of truth for which commerce sub-surfaces a Space
// type composes onto the unified Offerings settings page (/spaces/<slug>/settings/offerings).
//
// The console's Offerings group used to show up to five separate type-gated cards, each linking to
// its own settings sub-page (availability / memberships / donations). Enrollment, tickets and
// check-in were retired into journeys and events (ADR-1294, LIVE-226): their anchors are gone from
// this catalog rather than filtered out of it downstream, so the list cannot describe a section the
// Offerings page will never compose.
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
interface OfferingSection {
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

/** The tabs of the Offerings and Money page, in bar order. One tab shows at a time, so the page is a few
 *  compact areas instead of one long scroll. `paid` is the payout account state, `checkin` is the door
 *  (Check in came back here from the ?panel=checkin workspace, which had no menu door), and the rest are
 *  the catalog sections above. PURE. */
export const OFFERING_TABS = [
  { key: 'paid', label: 'Get paid' },
  { key: 'bookings', label: 'Bookings' },
  { key: 'memberships', label: 'Memberships' },
  { key: 'donations', label: 'Donations' },
  { key: 'checkin', label: 'Check in' },
] as const

export type OfferingTab = (typeof OFFERING_TABS)[number]['key']

/** Narrow a `?tab=` value to a known tab, defaulting to the first. PURE. */
export function asOfferingTab(raw: string | null | undefined): OfferingTab {
  return OFFERING_TABS.find((t) => t.key === raw)?.key ?? OFFERING_TABS[0].key
}

/** The tab an old `#anchor` link meant (`#availability` was the Bookings section), so every link written
 *  before the tabs still lands in the right place. Null for an unknown or retired anchor. PURE. */
export function offeringTabForAnchor(anchor: string): OfferingTab | null {
  const a = anchor.replace(/^#/, '')
  if (a === 'availability') return 'bookings'
  return OFFERING_TABS.find((t) => t.key === a)?.key ?? null
}

/** The views inside the Check in tab (owner ask 2026-10-22, LIVE-1297): the door itself, and the
 *  cards (the viewer's Crew card and the Space card) on their own page. PURE. */
export const CHECKIN_VIEWS = [
  { key: 'door', label: 'Check in' },
  { key: 'card', label: 'Cards' },
] as const

export type CheckinView = (typeof CHECKIN_VIEWS)[number]['key']

/** Narrow a `?view=` value to a known Check in view, defaulting to the door. PURE. */
export function asCheckinView(raw: string | null | undefined): CheckinView {
  return CHECKIN_VIEWS.find((v) => v.key === raw)?.key ?? CHECKIN_VIEWS[0].key
}

/** The views inside the Memberships tab, so plans, perks, circles, events and the member list are each a
 *  short page of their own instead of one stack. `members` is left out under the Frequency design, where
 *  the members table already leads the Plans view. PURE. */
export const MEMBERSHIP_VIEWS = [
  { key: 'plans', label: 'Plans' },
  { key: 'benefits', label: 'Benefits' },
  { key: 'circles', label: 'Circles' },
  { key: 'events', label: 'Event access' },
  { key: 'members', label: 'Members' },
] as const

export type MembershipView = (typeof MEMBERSHIP_VIEWS)[number]['key']

/** Narrow a `?view=` value to a known Memberships view, defaulting to Plans. PURE. */
export function asMembershipView(raw: string | null | undefined): MembershipView {
  return MEMBERSHIP_VIEWS.find((v) => v.key === raw)?.key ?? MEMBERSHIP_VIEWS[0].key
}
