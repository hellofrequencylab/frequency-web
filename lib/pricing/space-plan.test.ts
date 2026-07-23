import { describe, it, expect, beforeEach, vi } from 'vitest'

// Pricing ladder Phase A (ADR-458), setSpacePlan / setSpaceAddons become SET-TO-TARGET against the
// billing-managed namespace (spaces.entitlements.billing). These tests drive the IO writers through a
// chainable Supabase mock + a billingLive() stub, and assert the keystone invariants:
//   * the billing namespace is REPLACED wholesale (toggle-off removes the dropped keys);
//   * TOP-LEVEL manual grants survive every write;
//   * the writer is GATED on billingLive() with the force escape;
//   * the union reader (spaceHasEntitlement) sees the right effective set after the write.

type Blob = Record<string, unknown>

// One space row the mock reads + writes. The test seeds `entitlements`, runs the writer, then asserts
// the captured update payload + the post-write effective entitlements via the union reader.
let spaceRow: { id: string; entitlements: Blob } | null
let lastUpdate: Blob | null
let updateError: unknown = null

function queryFor() {
  const api = {
    select() {
      return api
    },
    eq() {
      return api
    },
    maybeSingle() {
      return Promise.resolve({ data: spaceRow, error: null })
    },
    update(v: Blob) {
      lastUpdate = v
      return {
        eq() {
          // Apply the write to the in-memory row so a follow-up read sees it.
          if (spaceRow) spaceRow = { ...spaceRow, ...(v as { entitlements?: Blob }) } as typeof spaceRow
          return Promise.resolve({ error: updateError })
        },
      }
    },
  }
  return api
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: () => queryFor() }),
}))

// billingLive() is stubbed per-test (default ON so the writer runs; flipped OFF for the gate test).
let billingIsLive = true
vi.mock('./settings', () => ({
  billingLive: () => Promise.resolve(billingIsLive),
}))

import { setSpacePlan, setSpaceAddons } from './space-plan'
import { spaceHasEntitlement, BILLING_NAMESPACE } from '@/lib/spaces/entitlements'

/** The billing object the writer set on the space (the set-to-target result). */
function writtenBilling(): Blob {
  const ents = (lastUpdate?.entitlements ?? {}) as Blob
  return (ents[BILLING_NAMESPACE] ?? {}) as Blob
}

beforeEach(() => {
  billingIsLive = true
  updateError = null
  lastUpdate = null
  spaceRow = { id: 'space-1', entitlements: {} }
})

// Community Collective depth sets (ADR-811). Business = run-your-practice; Collective/Non Profit add
// automation+multi_pipeline+team; Independent adds branding (whitelabel).
const BUSINESS_DEPTH = {
  crm: true,
  'crm.playbooks': true,
  email: true,
  reporting: true,
  space_full_website: true,
}
const COLLECTIVE_DEPTH = { ...BUSINESS_DEPTH, automation: true, multi_pipeline: true, team: true }
const INDEPENDENT_DEPTH = { ...COLLECTIVE_DEPTH, whitelabel: true }

describe('setSpacePlan, set-to-target the billing namespace (ADR-552)', () => {
  it('writes the plan + REPLACES entitlements.billing with the Business depth set', async () => {
    const res = await setSpacePlan('space-1', 'business')
    expect(res.ok).toBe(true)
    expect(res.plan).toBe('business')
    expect(lastUpdate?.plan).toBe('business')
    // Business depth = the full paid set, written ONLY under the billing namespace (no AI keys).
    expect(writtenBilling()).toEqual(BUSINESS_DEPTH)
    expect(writtenBilling()['crm.resonance']).toBeUndefined()
    expect(writtenBilling()['crm.resonance_ai']).toBeUndefined()
  })

  it('narrows a retired legacy label to its new tier before writing (whitelabel -> independent, ADR-811)', async () => {
    const res = await setSpacePlan('space-1', 'whitelabel') // retired legacy -> independent (Collective depth + branding)
    expect(res.plan).toBe('independent')
    expect(lastUpdate?.plan).toBe('independent')
    expect(writtenBilling()).toEqual(INDEPENDENT_DEPTH)
  })

  it('nonprofit grants the Collective depth (organization narrows to nonprofit)', async () => {
    expect((await setSpacePlan('space-1', 'nonprofit')).plan).toBe('nonprofit')
    expect(writtenBilling()).toEqual(COLLECTIVE_DEPTH)
    expect((await setSpacePlan('space-1', 'organization')).plan).toBe('nonprofit')
    expect(writtenBilling()).toEqual(COLLECTIVE_DEPTH)
  })

  it('LEAVES top-level manual grants untouched; only the billing object changes', async () => {
    // An operator hand-granted `crm.autonomy` at the top level; setSpacePlan must not disturb it.
    spaceRow = { id: 'space-1', entitlements: { 'crm.autonomy': 'safe_auto' } }
    await setSpacePlan('space-1', 'business')
    const ents = lastUpdate?.entitlements as Blob
    expect(ents['crm.autonomy']).toBe('safe_auto') // operator dial preserved
    expect(ents[BILLING_NAMESPACE]).toEqual(BUSINESS_DEPTH)
  })

  it('set-to-target: a plan change REPLACES (not merges) the billing object', async () => {
    // Start with a Space whose billing namespace carries a stale all-inclusive + AI set.
    spaceRow = {
      id: 'space-1',
      entitlements: { [BILLING_NAMESPACE]: { crm: true, email: true, whitelabel: true, 'crm.resonance_ai': true } },
    }
    await setSpacePlan('space-1', 'business')
    // Set-to-target: the AI resonance key is GONE (business base has no AI), replaced by the full depth.
    expect(writtenBilling()).toEqual(BUSINESS_DEPTH)
    expect(spaceHasEntitlement(spaceRow, 'crm.resonance_ai')).toBe(false)
    expect(spaceHasEntitlement(spaceRow, 'email')).toBe(true)
  })

  it('free wipes the billing namespace to empty (no paid keys)', async () => {
    spaceRow = { id: 'space-1', entitlements: { [BILLING_NAMESPACE]: { crm: true } } }
    await setSpacePlan('space-1', 'free')
    expect(writtenBilling()).toEqual({})
  })

  it('is GATED on billingLive(): a no-op while OFF, unless forced', async () => {
    billingIsLive = false
    const off = await setSpacePlan('space-1', 'business')
    expect(off).toEqual({ ok: false, reason: 'billing_off', plan: 'business' })
    expect(lastUpdate).toBeNull() // nothing written

    const forced = await setSpacePlan('space-1', 'business', { force: true })
    expect(forced.ok).toBe(true)
    expect(writtenBilling()).toEqual(BUSINESS_DEPTH)
  })

  it('FAIL-SAFE: a missing space returns not_found; a DB error returns error', async () => {
    spaceRow = null
    expect(await setSpacePlan('nope', 'business')).toMatchObject({ ok: false, reason: 'not_found' })
    spaceRow = { id: 'space-1', entitlements: {} }
    updateError = { message: 'boom' }
    expect(await setSpacePlan('space-1', 'business')).toMatchObject({ ok: false, reason: 'error' })
  })
})

describe('setSpaceAddons, the AI add-on layers on a tier; toggle-off removes only its keys (ADR-552)', () => {
  it('Business + AI: the Business depth PLUS the AI resonance keys (no automation/team/branding)', async () => {
    const res = await setSpaceAddons('space-1', { plan: 'business', addons: ['ai'] })
    expect(res.ok).toBe(true)
    expect(res.plan).toBe('business')
    const billing = writtenBilling()
    expect(billing.email).toBe(true)
    expect(billing.reporting).toBe(true)
    // Business does NOT grant the Collective/Independent depth (team, automation, white-label).
    expect(billing.team).toBeUndefined()
    expect(billing.whitelabel).toBeUndefined()
    expect(billing['crm.resonance']).toBe(true)
    expect(billing['crm.resonance_ai']).toBe(true)
  })

  it('toggling AI OFF removes ONLY its resonance keys (a manual grant of the same key survives)', async () => {
    // Start: AI on (billing namespace carries the resonance keys) AND an operator hand-granted
    // `crm.resonance_ai` at the top level.
    spaceRow = {
      id: 'space-1',
      entitlements: {
        'crm.resonance_ai': true, // manual top-level grant
        [BILLING_NAMESPACE]: { ...BUSINESS_DEPTH, 'crm.resonance': true, 'crm.resonance_ai': true },
      },
    }
    // Recompute with AI toggled OFF (no add-ons active).
    await setSpaceAddons('space-1', { plan: 'business', addons: [] })
    const billing = writtenBilling()
    // The AI billing keys are gone from the namespace.
    expect(billing['crm.resonance']).toBeUndefined()
    expect(billing['crm.resonance_ai']).toBeUndefined()
    // Business depth stays.
    expect(billing).toEqual(BUSINESS_DEPTH)
    // The union reader: crm.resonance is GONE (only billing had it), but crm.resonance_ai SURVIVES via
    // the manual top-level grant.
    expect(spaceHasEntitlement(spaceRow, 'crm.resonance')).toBe(false)
    expect(spaceHasEntitlement(spaceRow, 'crm.resonance_ai')).toBe(true)
  })

  it('drops the retired add-on keys (marketing/team/branding) and unknowns (default-deny), dedups AI', async () => {
    // The former add-on keys no longer narrow to an AddonKey, so they are ignored: only AI layers on.
    await setSpaceAddons('space-1', { plan: 'business', addons: ['team' as never, 'marketing' as never, 'ai', 'ai', 'bogus' as never] })
    expect(writtenBilling()).toEqual({
      ...BUSINESS_DEPTH,
      'crm.resonance': true,
      'crm.resonance_ai': true,
    })
  })

  it('is GATED on billingLive() with the same force escape', async () => {
    billingIsLive = false
    const off = await setSpaceAddons('space-1', { plan: 'business', addons: ['ai'] })
    expect(off).toMatchObject({ ok: false, reason: 'billing_off' })
    expect(lastUpdate).toBeNull()

    const forced = await setSpaceAddons('space-1', { plan: 'business', addons: ['ai'] }, { force: true })
    expect(forced.ok).toBe(true)
    expect(writtenBilling()['crm.resonance']).toBe(true)
  })
})
