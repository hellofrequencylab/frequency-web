// SET A SPACE'S PLAN / ADD-ONS, write `spaces.plan` + SET-TO-TARGET the billing-managed namespace
// `spaces.entitlements.billing` from the plan + active add-on key sets (lib/pricing/plans.ts). This
// is the function the Stripe webhook calls when a Space subscribes / changes plan / toggles an add-on;
// it is also callable by an admin/owner action, and is STILL gated by `billing_live` so nothing flips
// a Space's entitlements while billing is OFF.
//
// THE PARTITION (ADR-458, the keystone). It does NOT touch the TOP-LEVEL manual grants: it only
// REPLACES the `billing` object wholesale (set-to-target, not append). So an add-on toggling OFF
// recomputes the target and the removed keys vanish from the billing namespace, while any manual
// top-level grant of the same key survives (the reader unions both). A client can never forge a
// billing key (service-role writes only). Server-only.

import { createAdminClient } from '@/lib/supabase/admin'
import {
  asSpacePlan,
  planEntitlementKeys,
  planKeysWithAddons,
  asAddonKey,
  type AddonKey,
  type SpacePlan,
} from './plans'
import { BILLING_NAMESPACE } from '@/lib/spaces/entitlements'
import { billingLive } from './settings'

export interface SetSpacePlanResult {
  ok: boolean
  /** Why the write was skipped (when ok=false). 'billing_off' | 'not_found' | 'error'. */
  reason?: 'billing_off' | 'not_found' | 'error'
  plan?: SpacePlan
  /** The full `spaces.entitlements` blob after the write (top-level manual grants + the replaced
   *  `billing` object), for callers/tests that assert the result. */
  entitlements?: Record<string, unknown>
}

/** Normalize a raw `spaces.entitlements` jsonb to a plain record (default {} for null/garbage). */
function asBlob(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {}
}

/** Build the next `spaces.entitlements` blob: keep every TOP-LEVEL key as-is (the manual grants the
 *  operator set by hand) and REPLACE the reserved `billing` object with the exact target key set
 *  (`{ key: true }` for each billing key). Set-to-target: keys not in the target are simply absent
 *  from the new billing object, so a toggled-off add-on's keys disappear from the billing namespace.
 *  PURE. */
function withBillingNamespace(
  current: Record<string, unknown>,
  billingKeys: readonly string[],
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...current }
  const billing: Record<string, boolean> = {}
  for (const key of billingKeys) billing[key] = true
  next[BILLING_NAMESPACE] = billing
  return next
}

/** Read the current entitlements blob for a space (untyped, ADR-246). Returns null if missing. */
async function readEntitlements(spaceId: string): Promise<Record<string, unknown> | null> {
  const db = createAdminClient()
  const { data: row } = (await db
    .from('spaces')
    .select('id, entitlements')
    .eq('id', spaceId)
    .maybeSingle()) as { data: { id?: string; entitlements?: unknown } | null }
  if (!row?.id) return null
  return asBlob(row.entitlements)
}

/** Write the `spaces.plan` + `spaces.entitlements` for a space (scoped to the one id, untyped per
 *  ADR-246). Returns the DB error (or null). */
async function writePlanAndEntitlements(
  spaceId: string,
  plan: SpacePlan,
  entitlements: Record<string, unknown>,
): Promise<unknown> {
  const db = createAdminClient()
  const { error } = await (db as unknown as {
    from: (t: string) => {
      update: (v: Record<string, unknown>) => { eq: (c: string, val: string) => Promise<{ error: unknown }> }
    }
  })
    .from('spaces')
    .update({ plan, entitlements })
    .eq('id', spaceId)
  return error
}

/** Set a Space's billing plan and SET-TO-TARGET its billing-managed entitlements to the plan's exact
 *  key set (the `entitlements.billing` object is replaced wholesale; top-level manual grants are left
 *  untouched). GATED on billingLive(): while billing is OFF this is a no-op returning
 *  { ok:false, reason:'billing_off' }, so a Space's entitlements never change while OFF. The webhook
 *  calls this once billing is live.
 *
 *  `opts.force` bypasses ONLY the billing gate (for an explicit operator action that wants to set a
 *  plan before billing goes live); the entitlement write is identical. FAIL-SAFE: returns
 *  { ok:false } on any error rather than throwing into the caller. */
export async function setSpacePlan(
  spaceId: string,
  plan: SpacePlan | string,
  opts: { force?: boolean } = {},
): Promise<SetSpacePlanResult> {
  const target = asSpacePlan(typeof plan === 'string' ? plan : null)
  try {
    if (!opts.force && !(await billingLive())) {
      return { ok: false, reason: 'billing_off', plan: target }
    }
    const current = await readEntitlements(spaceId)
    if (!current) return { ok: false, reason: 'not_found', plan: target }

    // Set-to-target: the plan's exact base key set replaces the billing namespace. Manual top-level
    // grants are preserved (withBillingNamespace copies them through).
    const next = withBillingNamespace(current, planEntitlementKeys(target))
    const error = await writePlanAndEntitlements(spaceId, target, next)
    if (error) return { ok: false, reason: 'error', plan: target }
    return { ok: true, plan: target, entitlements: next }
  } catch {
    return { ok: false, reason: 'error', plan: target }
  }
}

/** Set a Space's billing plan + active ADD-ONS in one set-to-target write. The billing namespace is
 *  replaced with the FULL key set = plan core unioned with each active add-on's keys. Toggling an
 *  add-on off (passing a smaller `addons` set) recomputes and the removed keys vanish from the billing
 *  namespace, while any manual top-level grant of the same key survives (the reader unions both).
 *  GATED on billingLive() with the same `opts.force` escape + fail-safe return shape as setSpacePlan.
 *
 *  Add-ons only meaningfully layer onto Pro; nonprofit / organization are already all-inclusive, so
 *  passing add-ons there is harmless (the union is a no-op). 'free' grants nothing regardless. */
export async function setSpaceAddons(
  spaceId: string,
  input: { plan: SpacePlan | string; addons: readonly (AddonKey | string)[] },
  opts: { force?: boolean } = {},
): Promise<SetSpacePlanResult> {
  const target = asSpacePlan(typeof input.plan === 'string' ? input.plan : null)
  // Narrow + dedup the active add-on keys (unknown keys are dropped, default-deny).
  const addons = [...new Set(input.addons.map((a) => asAddonKey(typeof a === 'string' ? a : null)).filter((a): a is AddonKey => a !== null))]
  try {
    if (!opts.force && !(await billingLive())) {
      return { ok: false, reason: 'billing_off', plan: target }
    }
    const current = await readEntitlements(spaceId)
    if (!current) return { ok: false, reason: 'not_found', plan: target }

    const billingKeys = planKeysWithAddons(target, addons)
    const next = withBillingNamespace(current, billingKeys)
    const error = await writePlanAndEntitlements(spaceId, target, next)
    if (error) return { ok: false, reason: 'error', plan: target }
    return { ok: true, plan: target, entitlements: next }
  } catch {
    return { ok: false, reason: 'error', plan: target }
  }
}
