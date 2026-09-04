// THE PURE RESOLVER BEHIND THE OPERATOR "Features and access" SWITCH (ADR-1196).
//
// This file exists because the branch it replaces was unreachable from a test, and shipped wrong for
// four of the twenty-two Space functions. `app/(main)/admin/spaces/[id]/actions.ts` is a `'use server'`
// module that reads Supabase through the service-role client, so the ONE interesting line in it — which
// key does an off-switch write? — could only be exercised by standing up a database. It was not, and
// the defect survived: a janitor turning CRM off saw the switch move and nothing happen.
//
// ── THE DEFECT, precisely ─────────────────────────────────────────────────────────────────────────
// The action branched on `def.entitlement`, and for a function that carries one it ran
// `delete next[def.entitlement]` to disable. But the READER — `spaceFunctionEnabled`
// (lib/spaces/functions.ts) — keys on `def.key`, and treats an ABSENT key as ON by design (universal
// default-on, ADR-517 Phase F). So disabling deleted a key nothing consulted and left the function on:
//   · crm     key 'crm'     entitlement 'crm'         -> deleted 'crm',        read back ON
//   · email   key 'email'   entitlement 'email'       -> deleted 'email',      read back ON
//   · program key 'program' entitlement 'program'     -> deleted 'program',    read back ON
//   · shop    key 'shop'    entitlement 'storefront'  -> touched 'storefront', a key the reader never
//                                                        consults at all
// The other eighteen functions carry no entitlement, took the else branch, and always worked.
//
// ── THE RULE THIS FILE IMPLEMENTS ─────────────────────────────────────────────────────────────────
// The OFF SWITCH is always `def.key`, because that is the only key the reader consults. The
// ENTITLEMENT key is a separate, ADDITIVE concern: granting a plan-gated function by hand still writes
// `def.entitlement` so the janitor override stays absolute (an operator may grant CRM to a Space with
// no paid plan). The two were conflated; they are now two independent writes on one blob.
//
// Pairs with the three-state top-level read in lib/spaces/entitlements.ts: an explicit `false` revokes
// and a plan grant cannot put it back. Without that fix this one would be inert on any paid Space,
// which is why the two shipped together.
//
// PURE: a blob in, a blob out. No React / Next / Supabase.

import { BILLING_NAMESPACE } from './entitlements'
import type { SpaceFunctionDef } from './functions'

/**
 * The next `spaces.entitlements` blob after an operator flips one function's switch, or `null` when the
 * flip is REFUSED. PURE + total.
 *
 * 🔴 REFUSED means one thing only, and it is a data-safety stop, not a permission check. The Space
 * function `billing` ("Plan and billing") has a key that is byte-identical to `BILLING_NAMESPACE`, the
 * reserved container every plan grant lives inside. Writing its off-switch the ordinary way sets
 * `entitlements.billing = false`, and `spaceBillingEntitlements` normalizes a non-object to `{}` — so
 * one toggle on a paid Space SILENTLY DESTROYS every plan grant it has: crm, email, reporting,
 * automation, team, multi_pipeline, program, space_full_website. Reproduced against the real reader
 * (ADR-1196, SCAN-536); the shipped action has always had this hole. The resolver refuses rather than
 * returning the blob unchanged, because a fail-safe nobody can observe is an invisible regression:
 * the caller must surface it.
 *
 * SPARSE, in both directions, so the blob only ever holds genuine operator intent:
 *   · enabling  -> DELETE the off-switch (back to the registry default, which is ON), and for a
 *                  plan-gated function also write the entitlement key `true` (the absolute override).
 *   · disabling -> write `def.key: false` (the explicit revoke the reader honours) and DELETE any
 *                  hand-granted entitlement key, so a re-enable does not silently restore a plan
 *                  capability the operator never re-granted.
 */
export function nextEntitlementsForFunctionToggle(
  current: Record<string, unknown>,
  def: SpaceFunctionDef,
  enabled: boolean,
): Record<string, unknown> | null {
  // The namespace collision above. Refused in BOTH directions: enabling would write `billing: true`,
  // which destroys the grants just as thoroughly as `false` does.
  if (def.key === BILLING_NAMESPACE) return null

  const next = { ...current }

  if (enabled) {
    // Back to the default-ON state: no explicit off-switch stored.
    delete next[def.key]
    // A plan-gated function additionally carries the janitor's absolute grant.
    if (def.entitlement) next[def.entitlement] = true
    return next
  }

  // OFF is always keyed on the FUNCTION key — the only key spaceFunctionEnabled reads.
  next[def.key] = false
  // Drop any hand-granted entitlement so the grant does not outlive the switch that justified it.
  //
  // 🔴 THE `!== def.key` GUARD IS LOAD-BEARING, and its absence reproduced this file's own defect
  // during development. For `crm`, `email` and `program` the function key and the entitlement key are
  // the SAME STRING, so an unguarded `delete next[def.entitlement]` deletes the `false` written one
  // line above — and an absent key reads as ON. The switch would have gone back to being a no-op for
  // exactly the three functions it was written to fix. Only a SEPARATE entitlement key is dropped;
  // where the two names collide the `false` IS the revoke of both.
  if (def.entitlement && def.entitlement !== def.key) delete next[def.entitlement]
  return next
}
