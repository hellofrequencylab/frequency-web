import { describe, it, expect } from 'vitest'

// Phase 0 (ENTITY-SPACES-BUILD §0, Epic 0.1) — ENTITLEMENTS default-deny + the owner/role
// CAPABILITY set. These are the pure halves (no IO); the IO entry point getSpaceCapabilities is
// covered for its owner path here and exercised against the membership seam in membership.test.ts.

import {
  spaceEntitlements,
  spaceHasEntitlement,
  spaceBillingEntitlements,
  spaceCapabilitiesFor,
  resolveSpaceManageAccess,
  spaceAutonomyLevel,
  autoExecutionAllowed,
  asAutonomyLevel,
  DEFAULT_AUTONOMY,
  spaceAiDepth,
  spaceMeetsAiDepth,
  spaceCanRunPlaybooks,
  spaceCanSeeResonance,
  spaceCanUseResonanceAi,
  spaceCanUseAdvancedSegments,
  spaceCanUseFullWebsite,
  SPACE_FULL_WEBSITE_KEY,
  FREE_AI_DEPTH,
  AI_DEPTH_KEYS,
  BILLING_NAMESPACE,
  type SpaceLike,
} from './entitlements'

describe('entitlements (DEFAULT-DENY)', () => {
  it('reads explicit grants', () => {
    const space: SpaceLike = { entitlements: { crm: true, email: true, gamification: false } }
    expect(spaceEntitlements(space)).toEqual({ crm: true, email: true, gamification: false })
    expect(spaceHasEntitlement(space, 'crm')).toBe(true)
    expect(spaceHasEntitlement(space, 'email')).toBe(true)
  })

  it('DEFAULT-DENY: a missing key is off', () => {
    const space: SpaceLike = { entitlements: { crm: true } }
    expect(spaceHasEntitlement(space, 'email')).toBe(false)
    expect(spaceHasEntitlement(space, 'white_label')).toBe(false)
  })

  it('DEFAULT-DENY: a non-true value is off (only `true` grants)', () => {
    const space: SpaceLike = { entitlements: { crm: 'yes', email: 1, sms: false, push: null } }
    expect(spaceHasEntitlement(space, 'crm')).toBe(false)
    expect(spaceHasEntitlement(space, 'email')).toBe(false)
    expect(spaceHasEntitlement(space, 'sms')).toBe(false)
    expect(spaceHasEntitlement(space, 'push')).toBe(false)
  })

  it('DEFAULT-DENY: a missing / malformed / null blob grants nothing', () => {
    expect(spaceEntitlements(null)).toEqual({})
    expect(spaceEntitlements(undefined)).toEqual({})
    expect(spaceEntitlements({})).toEqual({})
    expect(spaceEntitlements({ entitlements: undefined })).toEqual({})
    expect(spaceEntitlements({ entitlements: 'not-an-object' })).toEqual({})
    expect(spaceEntitlements({ entitlements: ['crm'] })).toEqual({}) // arrays are not maps
    expect(spaceHasEntitlement({ entitlements: null }, 'crm')).toBe(false)
  })
})

describe('entitlement partition: billing namespace UNION read (the keystone · ADR-458)', () => {
  it('reads the UNION of top-level manual grants and the billing namespace', () => {
    // crm is a manual top-level grant; email lives only in the billing namespace. Both read granted.
    const space: SpaceLike = {
      entitlements: { crm: true, [BILLING_NAMESPACE]: { email: true, automation: true } },
    }
    expect(spaceHasEntitlement(space, 'crm')).toBe(true) // manual top-level
    expect(spaceHasEntitlement(space, 'email')).toBe(true) // billing namespace
    expect(spaceHasEntitlement(space, 'automation')).toBe(true) // billing namespace
    expect(spaceHasEntitlement(space, 'reporting')).toBe(false) // neither source
    // The reserved `billing` object itself is never a capability key.
    expect(spaceHasEntitlement(space, BILLING_NAMESPACE)).toBe(false)
    expect(spaceEntitlements(space)).toEqual({ crm: true, email: true, automation: true })
  })

  it('a billing key grants even when the top level is absent or explicitly false', () => {
    const space: SpaceLike = {
      entitlements: { email: false, [BILLING_NAMESPACE]: { email: true, crm: true } },
    }
    // The billing `true` wins the OR even over a top-level `false`.
    expect(spaceHasEntitlement(space, 'email')).toBe(true)
    expect(spaceHasEntitlement(space, 'crm')).toBe(true)
  })

  it('a manual top-level grant SURVIVES even when the billing namespace lacks the key (toggle-off)', () => {
    // Simulate an add-on toggled OFF: the billing namespace no longer carries `email`, but an operator
    // hand-granted it at the top level. The union keeps it granted (a billing write never nukes a hand-grant).
    const afterToggleOff: SpaceLike = {
      entitlements: { email: true, [BILLING_NAMESPACE]: { crm: true } },
    }
    expect(spaceHasEntitlement(afterToggleOff, 'email')).toBe(true) // manual grant survives
    expect(spaceHasEntitlement(afterToggleOff, 'crm')).toBe(true) // billing core
  })

  it('a billing-only key is REMOVED when the billing namespace drops it (toggle-off, no manual grant)', () => {
    // Before: the AI Engine add-on granted crm.resonance via the billing namespace.
    const before: SpaceLike = {
      entitlements: { [BILLING_NAMESPACE]: { crm: true, 'crm.resonance': true } },
    }
    expect(spaceHasEntitlement(before, 'crm.resonance')).toBe(true)
    // After the add-on toggles off, the resolver set-to-targets the billing namespace WITHOUT the key.
    const after: SpaceLike = { entitlements: { [BILLING_NAMESPACE]: { crm: true } } }
    expect(spaceHasEntitlement(after, 'crm.resonance')).toBe(false) // gone (no manual grant to keep it)
    expect(spaceHasEntitlement(after, 'crm')).toBe(true) // core stays
  })

  it('spaceBillingEntitlements reads ONLY the billing namespace, default-deny', () => {
    const space: SpaceLike = {
      entitlements: { crm: true, [BILLING_NAMESPACE]: { email: true, reporting: 'yes' } },
    }
    // Only the billing object, and only `true` values.
    expect(spaceBillingEntitlements(space)).toEqual({ email: true, reporting: false })
    // A missing / malformed billing object grants nothing.
    expect(spaceBillingEntitlements({ entitlements: { crm: true } })).toEqual({})
    expect(spaceBillingEntitlements({ entitlements: { [BILLING_NAMESPACE]: 'nope' } })).toEqual({})
    expect(spaceBillingEntitlements(null)).toEqual({})
  })

  it('DEFAULT-DENY survives the partition: a non-true billing value never grants', () => {
    const space: SpaceLike = {
      entitlements: { [BILLING_NAMESPACE]: { email: 'yes', crm: 1, automation: null } },
    }
    expect(spaceHasEntitlement(space, 'email')).toBe(false)
    expect(spaceHasEntitlement(space, 'crm')).toBe(false)
    expect(spaceHasEntitlement(space, 'automation')).toBe(false)
  })

  it('the autonomy DIAL resolves from the TOP LEVEL only (never the billing namespace)', () => {
    // crm.autonomy is a per-Space operator dial, not a billing key. It must read from the top level.
    const topLevelDial: SpaceLike = {
      entitlements: { 'crm.autonomy': 'safe_auto', [BILLING_NAMESPACE]: { crm: true } },
    }
    expect(spaceAutonomyLevel(topLevelDial)).toBe('safe_auto')
    expect(autoExecutionAllowed(topLevelDial)).toBe(true)
    // A stray autonomy value parked in the billing namespace does NOT raise the dial (top-level only).
    const billingDial: SpaceLike = {
      entitlements: { [BILLING_NAMESPACE]: { 'crm.autonomy': 'safe_auto', crm: true } },
    }
    expect(spaceAutonomyLevel(billingDial)).toBe('suggest_only')
    expect(autoExecutionAllowed(billingDial)).toBe(false)
  })

  it('the AI-depth ladder resolves through the UNION (billing-granted depth keys count)', () => {
    // The resonance depth keys arrive via the billing namespace (the AI Engine add-on); the AI-depth
    // readers resolve them through spaceHasEntitlement, so the union read lights up the right rung.
    const aiEngine: SpaceLike = {
      entitlements: { [BILLING_NAMESPACE]: { crm: true, 'crm.resonance': true, 'crm.resonance_ai': true } },
    }
    expect(spaceAiDepth(aiEngine)).toBe('resonance_ai')
    expect(spaceCanSeeResonance(aiEngine)).toBe(true)
    expect(spaceCanUseResonanceAi(aiEngine)).toBe(true)
    // Pro core (playbooks) via the billing namespace lights the playbooks rung but not resonance.
    const proCore: SpaceLike = {
      entitlements: { [BILLING_NAMESPACE]: { crm: true, 'crm.playbooks': true } },
    }
    expect(spaceAiDepth(proCore)).toBe('playbooks')
    expect(spaceCanRunPlaybooks(proCore)).toBe(true)
    expect(spaceCanSeeResonance(proCore)).toBe(false)
  })
})

describe('autonomy slider (FAIL-CLOSED to suggest_only · ADR-384)', () => {
  it('the default everywhere is suggest_only', () => {
    expect(DEFAULT_AUTONOMY).toBe('suggest_only')
    expect(spaceAutonomyLevel(null)).toBe('suggest_only')
    expect(spaceAutonomyLevel(undefined)).toBe('suggest_only')
    expect(spaceAutonomyLevel({})).toBe('suggest_only')
    expect(spaceAutonomyLevel({ entitlements: {} })).toBe('suggest_only')
  })

  it('reads an explicit safe_auto setting off the entitlements blob', () => {
    const space: SpaceLike = { entitlements: { 'crm.autonomy': 'safe_auto' } }
    expect(spaceAutonomyLevel(space)).toBe('safe_auto')
    expect(autoExecutionAllowed(space)).toBe(true)
  })

  it('FAIL-CLOSED: a garbage / unknown value reads as suggest_only', () => {
    expect(spaceAutonomyLevel({ entitlements: { 'crm.autonomy': 'full_send' } })).toBe('suggest_only')
    expect(spaceAutonomyLevel({ entitlements: { 'crm.autonomy': 1 } })).toBe('suggest_only')
    expect(spaceAutonomyLevel({ entitlements: { 'crm.autonomy': null } })).toBe('suggest_only')
    expect(spaceAutonomyLevel({ entitlements: ['crm.autonomy'] })).toBe('suggest_only')
  })

  it('autoExecutionAllowed is false by default (nothing auto-executes until raised)', () => {
    expect(autoExecutionAllowed(null)).toBe(false)
    expect(autoExecutionAllowed({})).toBe(false)
    expect(autoExecutionAllowed({ entitlements: { 'crm.autonomy': 'suggest_only' } })).toBe(false)
  })

  it('asAutonomyLevel normalizes loosely, fail-closed', () => {
    expect(asAutonomyLevel('safe_auto')).toBe('safe_auto')
    expect(asAutonomyLevel('suggest_only')).toBe('suggest_only')
    expect(asAutonomyLevel('nope')).toBe('suggest_only')
    expect(asAutonomyLevel(undefined)).toBe('suggest_only')
  })
})

describe('AI-depth ladder (FAIL-CLOSED to the free wedge · ADR-387)', () => {
  it('the wedge is the free floor: no keys reads as wedge, and the wedge is never paywalled', () => {
    expect(FREE_AI_DEPTH).toBe('wedge')
    expect(spaceAiDepth(null)).toBe('wedge')
    expect(spaceAiDepth(undefined)).toBe('wedge')
    expect(spaceAiDepth({})).toBe('wedge')
    expect(spaceAiDepth({ entitlements: { crm: true } })).toBe('wedge')
    // The wedge is always met (the floor every Space gets).
    expect(spaceMeetsAiDepth(null, 'wedge')).toBe(true)
    expect(spaceMeetsAiDepth({}, 'wedge')).toBe(true)
  })

  it('reads each rung off the entitlements blob (default-deny)', () => {
    const playbooks: SpaceLike = { entitlements: { [AI_DEPTH_KEYS.playbooks]: true } }
    expect(spaceAiDepth(playbooks)).toBe('playbooks')
    expect(spaceCanRunPlaybooks(playbooks)).toBe(true)
    expect(spaceCanUseAdvancedSegments(playbooks)).toBe(true)
    expect(spaceCanSeeResonance(playbooks)).toBe(false)
    expect(spaceCanUseResonanceAi(playbooks)).toBe(false)

    const resonance: SpaceLike = { entitlements: { [AI_DEPTH_KEYS.resonance]: true } }
    expect(spaceAiDepth(resonance)).toBe('resonance')
    expect(spaceCanSeeResonance(resonance)).toBe(true)
    expect(spaceCanUseResonanceAi(resonance)).toBe(false)

    const top: SpaceLike = { entitlements: { [AI_DEPTH_KEYS.resonanceAi]: true } }
    expect(spaceAiDepth(top)).toBe('resonance_ai')
    expect(spaceCanUseResonanceAi(top)).toBe(true)
    // The top rung implies the read-only resonance surface even without the mid key.
    expect(spaceCanSeeResonance(top)).toBe(true)
  })

  it('the top key present wins regardless of the lower keys', () => {
    const all: SpaceLike = {
      entitlements: {
        [AI_DEPTH_KEYS.playbooks]: true,
        [AI_DEPTH_KEYS.resonance]: true,
        [AI_DEPTH_KEYS.resonanceAi]: true,
      },
    }
    expect(spaceAiDepth(all)).toBe('resonance_ai')
    expect(spaceMeetsAiDepth(all, 'playbooks')).toBe(true)
    expect(spaceMeetsAiDepth(all, 'resonance')).toBe(true)
    expect(spaceMeetsAiDepth(all, 'resonance_ai')).toBe(true)
  })

  it('FAIL-CLOSED: a non-true value never grants depth (default-deny)', () => {
    expect(spaceCanRunPlaybooks({ entitlements: { [AI_DEPTH_KEYS.playbooks]: 'yes' } })).toBe(false)
    expect(spaceCanUseResonanceAi({ entitlements: { [AI_DEPTH_KEYS.resonanceAi]: 1 } })).toBe(false)
    expect(spaceAiDepth({ entitlements: ['crm.playbooks'] })).toBe('wedge')
  })

  it('the autonomy slider is orthogonal: a depth key never raises autonomy and vice versa', () => {
    // A Space with the playbooks depth key but no autonomy setting still reads suggest_only: depth
    // (WHAT) and autonomy (HOW MUCH) are independent gates; auto-execution needs both.
    const playbooksOnly: SpaceLike = { entitlements: { [AI_DEPTH_KEYS.playbooks]: true } }
    expect(spaceCanRunPlaybooks(playbooksOnly)).toBe(true)
    expect(spaceAutonomyLevel(playbooksOnly)).toBe('suggest_only')
    expect(autoExecutionAllowed(playbooksOnly)).toBe(false)
  })
})

describe('full website / multi-page upsell lock (DEFAULT-DENY, ignores billingLive)', () => {
  it('is LOCKED by default for every Space (no plan grants it yet)', () => {
    expect(spaceCanUseFullWebsite(null)).toBe(false)
    expect(spaceCanUseFullWebsite(undefined)).toBe(false)
    expect(spaceCanUseFullWebsite({})).toBe(false)
    expect(spaceCanUseFullWebsite({ entitlements: {} })).toBe(false)
    // A paid Space with CRM/email still cannot add pages without the explicit key.
    expect(spaceCanUseFullWebsite({ entitlements: { crm: true, email: true } })).toBe(false)
  })

  it('unlocks ONLY when the space_full_website entitlement is explicitly granted', () => {
    expect(spaceCanUseFullWebsite({ entitlements: { [SPACE_FULL_WEBSITE_KEY]: true } })).toBe(true)
    // Granted via the billing namespace (the union read) also unlocks it.
    expect(
      spaceCanUseFullWebsite({ entitlements: { [BILLING_NAMESPACE]: { [SPACE_FULL_WEBSITE_KEY]: true } } }),
    ).toBe(true)
    // DEFAULT-DENY: a non-true value never grants.
    expect(spaceCanUseFullWebsite({ entitlements: { [SPACE_FULL_WEBSITE_KEY]: 'yes' } })).toBe(false)
  })
})

describe('capabilities (owner + member role)', () => {
  it('owner is admin-equivalent and can do everything', () => {
    const caps = spaceCapabilitiesFor(true, null)
    expect(caps).toMatchObject({
      isOwner: true,
      isAdmin: true,
      role: 'admin',
      canEditProfile: true,
      canManageMembers: true,
      canInvite: true,
    })
  })

  it('admin member (not owner) can manage members + invite + edit', () => {
    const caps = spaceCapabilitiesFor(false, 'admin')
    expect(caps).toMatchObject({ isOwner: false, isAdmin: true, canManageMembers: true, canInvite: true, canEditProfile: true })
  })

  it('moderator can invite + edit but NOT manage members', () => {
    const caps = spaceCapabilitiesFor(false, 'moderator')
    expect(caps.isAdmin).toBe(false)
    expect(caps.canManageMembers).toBe(false)
    expect(caps.canInvite).toBe(true)
    expect(caps.canEditProfile).toBe(true)
  })

  it('editor can edit but cannot invite or manage', () => {
    const caps = spaceCapabilitiesFor(false, 'editor')
    expect(caps.canEditProfile).toBe(true)
    expect(caps.canInvite).toBe(false)
    expect(caps.canManageMembers).toBe(false)
  })

  it('viewer can do none of the operator actions', () => {
    const caps = spaceCapabilitiesFor(false, 'viewer')
    expect(caps.canEditProfile).toBe(false)
    expect(caps.canInvite).toBe(false)
    expect(caps.canManageMembers).toBe(false)
    expect(caps.isAdmin).toBe(false)
  })

  it('no role (stranger) gets nothing', () => {
    const caps = spaceCapabilitiesFor(false, null)
    expect(caps).toMatchObject({ isOwner: false, isAdmin: false, role: null, canEditProfile: false, canManageMembers: false, canInvite: false })
  })
})

describe('resolveSpaceManageAccess (canManage vs staffViewing)', () => {
  // A Space with no `id` skips the membership lookup, so these cases exercise the resolver without
  // touching the IO seam: the owner branch (canEditProfile) and the non-member branches (the web_role
  // staff-preview gate) are all decidable from owner-ness + the web_role alone.
  const space: SpaceLike = { ownerProfileId: 'owner-1' }

  it('the OWNER can manage (never a staff preview)', async () => {
    const access = await resolveSpaceManageAccess(space, 'owner-1', 'janitor')
    expect(access).toEqual({ canManage: true, staffViewing: false })
  })

  it('a JANITOR who is NOT a member gets a read-only staff preview', async () => {
    const access = await resolveSpaceManageAccess(space, 'stranger-1', 'janitor')
    expect(access).toEqual({ canManage: false, staffViewing: true })
  })

  it('a SITE ADMIN (web_role admin, not janitor) gets NO access to a Space they do not manage', async () => {
    // Only the Executive Admin (janitor) previews another operator's owner back-end.
    const access = await resolveSpaceManageAccess(space, 'stranger-1', 'admin')
    expect(access).toEqual({ canManage: false, staffViewing: false })
  })

  it('a non-staff non-member gets nothing', async () => {
    const access = await resolveSpaceManageAccess(space, 'stranger-1', 'none')
    expect(access).toEqual({ canManage: false, staffViewing: false })
  })

  it('an anonymous caller who is a janitor still gets the staff preview (read-only)', async () => {
    // web_role is the staff axis; a janitor with no profile id is degenerate, but the gate is the
    // web_role, so the preview is granted while every write stays gated on canEditProfile.
    const access = await resolveSpaceManageAccess(space, null, 'janitor')
    expect(access).toEqual({ canManage: false, staffViewing: true })
  })

  it('a missing Space yields no access', async () => {
    expect(await resolveSpaceManageAccess(null, 'owner-1', 'janitor')).toEqual({
      canManage: false,
      staffViewing: false,
    })
  })
})
