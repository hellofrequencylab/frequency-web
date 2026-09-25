// THE MEMBERSHIPS TAB's one pure question: has this Space earned a public Memberships door?
//
// Kept database-free and React-free so it can be unit-tested directly, which is the lib/spaces/*-tab
// idiom (ADR-841 / ADR-843) that Circles, Discussion and Contact already follow.
//
// 🔴 THE JOIN SURFACE WAS NOT MISSING, IT WAS UNREACHABLE. `/spaces/<slug>/book` has rendered the
// real tier picker for every membership-Focus Space since ENTITY-SPACES-SYSTEM 2.5, and the only
// link to it was the profile's single header CTA. An operator who repointed that CTA at anything
// else (contact, offerings, a custom URL) orphaned their own paid memberships: four live tiers, a
// working Stripe path, and no door on the Space. This gate is the door, and it does not depend on
// what the header button happens to say.

/** What the tab gate needs to know about a Space, as plain facts. */
export interface MembershipsDoorFacts {
  spaceType: string
  /** The `memberships` space function is switched on (a missing def reads as ON, like every sibling). */
  membershipsEnabled: boolean
  /** The Space has at least one ACTIVE tier a visitor could actually join. */
  hasActiveTiers: boolean
  /** The viewer manages this Space (or is staff previewing it). */
  canManage: boolean
}

/**
 * Whether to offer the Memberships tab.
 *
 * THE HONEST-EMPTY RULE, which every sibling tab in this group follows: a tab pointing at a room
 * with nothing in it spends a click to say "nothing here". So a visitor gets the tab once the Space
 * publishes a tier they could join, and never before.
 *
 * A MANAGER SEES IT AT ZERO, for the same reason the Circles tab does: the empty state is where
 * they go to set it up, and for them an empty tab is a to-do rather than a disappointment.
 *
 * THE FUNCTION SWITCH IS A HARD OFF, for BOTH. Unlike the honest-empty arm this one is an operator
 * decision, not a data fact: a Space that turned memberships off in the Module Manager has said it
 * does not sell them, and a manager-only tab over a switched-off feature is the Space arguing with
 * its own settings.
 *
 * ROOT NEVER OFFERS IT — the platform tenant sells its own plans at /pricing, not a Space membership.
 */
export function canSeeSpaceMembershipsTab(facts: MembershipsDoorFacts): boolean {
  if (facts.spaceType === 'root') return false
  if (!facts.membershipsEnabled) return false
  return facts.hasActiveTiers || facts.canManage
}
