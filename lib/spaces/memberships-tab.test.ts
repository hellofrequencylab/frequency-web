import { describe, it, expect } from 'vitest'
import { canSeeSpaceMembershipsTab, type MembershipsDoorFacts } from './memberships-tab'

// The Memberships tab gate (LIVE-509). Same shape as contact-tab.test.ts: the gate is pure, so every
// arm is a table row rather than a rendered page.

const facts = (over: Partial<MembershipsDoorFacts> = {}): MembershipsDoorFacts => ({
  spaceType: 'business',
  membershipsEnabled: true,
  hasActiveTiers: true,
  canManage: false,
  ...over,
})

describe('canSeeSpaceMembershipsTab', () => {
  it('offers the tab to a visitor once the Space publishes a tier', () => {
    expect(canSeeSpaceMembershipsTab(facts())).toBe(true)
  })

  // THE HONEST-EMPTY RULE. A tab over zero tiers spends a visitor's click to say "nothing here".
  it('withholds it from a visitor at zero tiers', () => {
    expect(canSeeSpaceMembershipsTab(facts({ hasActiveTiers: false }))).toBe(false)
  })

  // A manager keeps it at zero, because the empty state is where they set memberships up.
  it('keeps it for a manager at zero tiers', () => {
    expect(canSeeSpaceMembershipsTab(facts({ hasActiveTiers: false, canManage: true }))).toBe(true)
  })

  // THE FUNCTION SWITCH IS A HARD OFF FOR BOTH, which is what separates it from the empty arm: a
  // Space that switched memberships off has SAID it does not sell them, and a manager-only tab over
  // a switched-off feature is the Space arguing with its own settings. The manager case is the one
  // that matters here — the visitor case would already be false on a Space with no tiers, so a gate
  // that dropped the switch entirely would still pass a visitor-only test.
  it('withholds it from a manager when the memberships function is off', () => {
    expect(
      canSeeSpaceMembershipsTab(facts({ membershipsEnabled: false, canManage: true })),
    ).toBe(false)
  })

  it('withholds it from a visitor with live tiers when the function is off', () => {
    expect(canSeeSpaceMembershipsTab(facts({ membershipsEnabled: false }))).toBe(false)
  })

  // ROOT is the platform tenant. It sells its own plans at /pricing, never a Space membership, and
  // this is the same leak every sibling tab in the group closes. The manager arm is the one worth
  // asserting: a janitor previewing root would otherwise be handed the tab.
  it('never offers it on root, not even to a manager with tiers', () => {
    expect(
      canSeeSpaceMembershipsTab(facts({ spaceType: 'root', canManage: true })),
    ).toBe(false)
  })
})
