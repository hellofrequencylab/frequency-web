import { parseEntityLayout } from '@/lib/entity-blocks/layout'

// THE CONTACT TAB's two pure questions: what the form should say, and whether the Space has earned
// the tab at all. Kept database-free and React-free so both can be unit-tested directly, which is
// the lib/spaces/*-gate idiom (ADR-841 / ADR-843) the Circles and Discussion doors already follow.
//
// 🔴 THE COPY IS NOT STORED TWICE. `contactForm` already owns nine authored strings in its block
// content bag on the Space's page layout. The tab reads THAT bag. The alternative — a
// `preferences.contactTab` node — would put the same nine keys in two places, which forces a
// precedence rule into every render site and means an operator can edit one sentence in two
// screens and get two answers. The block is the home; this is a reader.

/** The operator's authored `contactForm` copy, or {} when they have never placed the block. */
export function readContactFormContent(preferences: unknown): Record<string, unknown> {
  const prefs =
    preferences && typeof preferences === 'object' && !Array.isArray(preferences)
      ? (preferences as Record<string, unknown>)
      : null
  if (!prefs) return {}
  // The SAME node and the SAME pure parser the profile body reads (`preferences.profileLayout` →
  // parseEntityLayout), so a bag the page renders and a bag this tab renders are one object, not
  // two readings of it. FAIL-SAFE: a malformed or absent layout parses to null and the form falls
  // back to its own default wording rather than throwing on a Space that never laid out a page.
  const layout = parseEntityLayout(prefs.profileLayout)
  const bag = layout?.content?.contactForm
  return bag && typeof bag === 'object' && !Array.isArray(bag) ? (bag as Record<string, unknown>) : {}
}

/** What the tab gate needs to know about a Space, as plain facts. */
export interface ContactDoorFacts {
  spaceType: string
  /** The operator has placed a contactForm block (its bag exists on the saved layout). */
  hasFormBlock: boolean
  /** The Space published at least one way to reach it: address, phone, email, hours or website. */
  hasContactFacts: boolean
  /** The viewer manages this Space (or is staff previewing it). */
  canManage: boolean
}

/**
 * Whether to offer the Contact tab.
 *
 * THE HONEST-EMPTY RULE, which every sibling tab in this group follows: a tab pointing at a room
 * with nothing in it spends a click to say "nothing here". So the tab appears once the Space has
 * either authored a form or published a way to reach it — both of which are operator actions, so
 * nobody wakes up with a new public lead door they did not ask for. That last part is the reason
 * this is not simply "always on for a non-root Space": the form writes a CRM lead and notifies the
 * owner, and switching that on for every Space on the platform is a product decision, not a tab.
 *
 * A MANAGER SEES IT AT ZERO, for the same reason the Circles tab does: the empty state is where
 * they go to set it up, and for them an empty tab is a to-do rather than a disappointment.
 *
 * ROOT NEVER OFFERS IT — the platform tenant is not a business anyone writes to.
 */
export function canSeeSpaceContactTab(facts: ContactDoorFacts): boolean {
  if (facts.spaceType === 'root') return false
  return facts.hasFormBlock || facts.hasContactFacts || facts.canManage
}
