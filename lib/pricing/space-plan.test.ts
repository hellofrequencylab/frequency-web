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

describe('setSpacePlan, set-to-target the billing namespace (ADR-458)', () => {
  it('writes the plan + REPLACES entitlements.billing with the plan core key set', async () => {
    const res = await setSpacePlan('space-1', 'pro')
    expect(res.ok).toBe(true)
    expect(res.plan).toBe('pro')
    expect(lastUpdate?.plan).toBe('pro')
    // Pro core = crm + crm.playbooks, written ONLY under the billing namespace.
    expect(writtenBilling()).toEqual({ crm: true, 'crm.playbooks': true })
  })

  it('narrows a legacy plan label to its new equivalent before writing', async () => {
    const res = await setSpacePlan('space-1', 'business') // legacy -> pro
    expect(res.plan).toBe('pro')
    expect(lastUpdate?.plan).toBe('pro')
    expect(writtenBilling()).toEqual({ crm: true, 'crm.playbooks': true })
  })

  it('LEAVES top-level manual grants untouched; only the billing object changes', async () => {
    // An operator hand-granted `email` at the top level; setSpacePlan must not disturb it.
    spaceRow = { id: 'space-1', entitlements: { email: true, 'crm.autonomy': 'safe_auto' } }
    await setSpacePlan('space-1', 'pro')
    const ents = lastUpdate?.entitlements as Blob
    expect(ents.email).toBe(true) // manual grant preserved
    expect(ents['crm.autonomy']).toBe('safe_auto') // operator dial preserved
    expect(ents[BILLING_NAMESPACE]).toEqual({ crm: true, 'crm.playbooks': true })
  })

  it('set-to-target: a downgrade REPLACES (not merges) the billing object', async () => {
    // Start with a Space whose billing namespace carries the all-inclusive set.
    spaceRow = {
      id: 'space-1',
      entitlements: { [BILLING_NAMESPACE]: { crm: true, email: true, whitelabel: true, 'crm.resonance_ai': true } },
    }
    await setSpacePlan('space-1', 'pro')
    // Downgraded to pro core: the marketing/branding/ai keys are GONE from the billing namespace.
    expect(writtenBilling()).toEqual({ crm: true, 'crm.playbooks': true })
    expect(spaceHasEntitlement(spaceRow, 'email')).toBe(false)
    expect(spaceHasEntitlement(spaceRow, 'whitelabel')).toBe(false)
  })

  it('free wipes the billing namespace to empty (no paid keys)', async () => {
    spaceRow = { id: 'space-1', entitlements: { [BILLING_NAMESPACE]: { crm: true } } }
    await setSpacePlan('space-1', 'free')
    expect(writtenBilling()).toEqual({})
  })

  it('is GATED on billingLive(): a no-op while OFF, unless forced', async () => {
    billingIsLive = false
    const off = await setSpacePlan('space-1', 'pro')
    expect(off).toEqual({ ok: false, reason: 'billing_off', plan: 'pro' })
    expect(lastUpdate).toBeNull() // nothing written

    const forced = await setSpacePlan('space-1', 'pro', { force: true })
    expect(forced.ok).toBe(true)
    expect(writtenBilling()).toEqual({ crm: true, 'crm.playbooks': true })
  })

  it('FAIL-SAFE: a missing space returns not_found; a DB error returns error', async () => {
    spaceRow = null
    expect(await setSpacePlan('nope', 'pro')).toMatchObject({ ok: false, reason: 'not_found' })
    spaceRow = { id: 'space-1', entitlements: {} }
    updateError = { message: 'boom' }
    expect(await setSpacePlan('space-1', 'pro')).toMatchObject({ ok: false, reason: 'error' })
  })
})

describe('setSpaceAddons, toggle-off removes only billing keys (ADR-458)', () => {
  it('writes plan core unioned with each active add-on key set', async () => {
    const res = await setSpaceAddons('space-1', { plan: 'pro', addons: ['marketing', 'ai'] })
    expect(res.ok).toBe(true)
    expect(res.plan).toBe('pro')
    const billing = writtenBilling()
    // core
    expect(billing.crm).toBe(true)
    expect(billing['crm.playbooks']).toBe(true)
    // marketing
    expect(billing.email).toBe(true)
    expect(billing.multi_pipeline).toBe(true)
    expect(billing.reporting).toBe(true)
    // ai
    expect(billing['crm.resonance']).toBe(true)
    expect(billing['crm.resonance_ai']).toBe(true)
    // team / branding NOT active
    expect(billing.team).toBeUndefined()
    expect(billing.whitelabel).toBeUndefined()
  })

  it('toggling an add-on OFF removes ONLY its billing keys (a manual grant of the same key survives)', async () => {
    // Start: Marketing on (billing namespace carries email) AND an operator hand-granted `reporting`.
    spaceRow = {
      id: 'space-1',
      entitlements: {
        reporting: true, // manual top-level grant
        [BILLING_NAMESPACE]: { crm: true, 'crm.playbooks': true, email: true, automation: true, multi_pipeline: true, reporting: true },
      },
    }
    // Recompute with Marketing toggled OFF (no add-ons active).
    await setSpaceAddons('space-1', { plan: 'pro', addons: [] })
    const billing = writtenBilling()
    // Marketing billing keys are gone from the namespace.
    expect(billing.email).toBeUndefined()
    expect(billing.automation).toBeUndefined()
    expect(billing.multi_pipeline).toBeUndefined()
    expect(billing.reporting).toBeUndefined()
    // Core stays.
    expect(billing).toEqual({ crm: true, 'crm.playbooks': true })
    // The union reader: email is GONE (only billing had it), but `reporting` SURVIVES via the manual top-level grant.
    expect(spaceHasEntitlement(spaceRow, 'email')).toBe(false)
    expect(spaceHasEntitlement(spaceRow, 'reporting')).toBe(true)
  })

  it('drops unknown add-on keys (default-deny) and dedups', async () => {
    await setSpaceAddons('space-1', { plan: 'pro', addons: ['team', 'team', 'bogus' as never] })
    expect(writtenBilling()).toEqual({ crm: true, 'crm.playbooks': true, team: true })
  })

  it('is GATED on billingLive() with the same force escape', async () => {
    billingIsLive = false
    const off = await setSpaceAddons('space-1', { plan: 'pro', addons: ['marketing'] })
    expect(off).toMatchObject({ ok: false, reason: 'billing_off' })
    expect(lastUpdate).toBeNull()

    const forced = await setSpaceAddons('space-1', { plan: 'pro', addons: ['marketing'] }, { force: true })
    expect(forced.ok).toBe(true)
    expect(writtenBilling().email).toBe(true)
  })
})
