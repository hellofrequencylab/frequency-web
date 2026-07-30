// THE SPACE METER SEAM (ADR-917, docs/VALUE-LADDER.md Phase 3b). The ONE server-side wrapper that
// turns a pure meter row (lib/pricing/feature-meters.ts) into a real answer about a real Space:
// resolve the Space's plan, resolve whether the gates bite yet, apply the grandfather rule, and hand
// back a verdict a write seam can refuse on.
//
// It is the metered sibling of lib/spaces/function-access.ts (which composes the pure function
// resolver with `featureAllowed`). Same shape, same contract, one dimension different: a GATE asks
// "is this feature on your plan", a METER asks "have you used up this plan's allowance of it".
//
// 🔴 THE THREE RULES THIS MODULE EXISTS TO KEEP.
//
//  1. FAIL-SAFE, ALWAYS. Every read here degrades to GRANTED. Under-enforcing a cap is recoverable;
//     wrongly locking an owner out of their own list is not (Gate 4, fail-direction review). There is
//     no error path in this file that returns `allowed: false`.
//
//  2. THE ROOT SPACE IS NEVER METERED. `spaces.type = 'root'` is Frequency's own hub, not a customer
//     tenant: its `contacts` rows are the platform's marketing list and its QR codes are the
//     platform's own codes. It carries `plan = null`, which `asSpacePlan` narrows to 'free'
//     (default-deny, correct for a tenant), so without this carve-out every platform-scoped write
//     would be measured against the FREE customer allowance. That is not a hypothetical: production
//     holds 567 root contacts and 36 root QR codes today, and the live QR cap already refuses a 37th.
//
//  3. THE CAP APPLIES TO GROWTH FROM TODAY. The grandfather floor lives in `allowanceVerdict`; every
//     caller here passes the LIVE count, so the effective cap is never below what the owner already
//     has. A full meter stops the next write and nothing else: it never hides, deletes, or blocks
//     read/export of what is already there.
//
// Copy follows docs/CONTENT-VOICE.md: plain, no em dashes, names what you HAVE rather than what you
// lack, and never invents urgency.

import { createAdminClient } from '@/lib/supabase/admin'
import { featureGatesLive } from '@/lib/pricing/settings'
import { asSpacePlan, type SpacePlan } from '@/lib/pricing/plans'
import {
  allowanceVerdict,
  featureMeter,
  type AllowanceVerdict,
} from '@/lib/pricing/feature-meters'

/** A Space's verdict on one metered dimension: the pure verdict plus who it was measured for. */
export interface SpaceAllowanceVerdict extends AllowanceVerdict {
  featureKey: string
  /** The plan the allowance was read from ('free' for an unset / unknown label). */
  plan: SpacePlan
  /** True when this Space is outside the metered model entirely (the platform root hub). */
  exempt: boolean
}

/** The Space columns a meter decision needs. `type` is not on every generated row shape (ADR-246), so
 *  this is a narrow, untyped read rather than a full `getSpaceById` (which would drag capabilities,
 *  entitlements, and a second round trip into a hot write path). */
interface SpacePlanRow {
  type?: string | null
  plan?: string | null
}

/** Read a Space's plan + type. FAIL-SAFE to `{}`, which resolves as plan 'free' and NOT exempt; the
 *  callers below then never enforce on a failed read, so a null row can only under-enforce. */
async function readSpacePlanRow(spaceId: string): Promise<SpacePlanRow | null> {
  try {
    const { data } = (await createAdminClient()
      .from('spaces')
      .select('type, plan')
      .eq('id', spaceId)
      .maybeSingle()) as { data: SpacePlanRow | null }
    return data ?? null
  } catch {
    return null
  }
}

/** The granted (never-blocking) verdict, used for every fail-safe and exempt path. */
function granted(featureKey: string, plan: SpacePlan, used: number, exempt: boolean): SpaceAllowanceVerdict {
  return {
    allowed: true,
    allowance: null,
    effective: null,
    used: Math.max(0, Math.trunc(Number.isFinite(used) ? used : 0)),
    remaining: null,
    grandfathered: false,
    enforced: false,
    featureKey,
    plan,
    exempt,
  }
}

/**
 * May this Space add ONE more of a metered thing? THE seam every counted write calls.
 *
 * @param spaceId    the Space the write belongs to
 * @param featureKey a PLAN-axis key in PLACEHOLDER_METER_LIMITS ('space_crm', 'space_email', …)
 * @param used       the Space's CURRENT usage on that dimension (the caller counts; counting is
 *                   cheap and specific, and a shared counter here would guess the wrong query)
 * @param opts.alwaysOn  set ONLY for a cap that already bites today (the QR code cap). Everything
 *                   else rides `featureGatesLive()` so nothing new bites during the beta grace
 *                   window. Never set this to make a NEW cap bite early.
 *
 * FAIL-SAFE: any error, an unknown Space, a non-metered key, or the root hub returns GRANTED.
 */
export async function spaceAllowanceVerdict(
  spaceId: string,
  featureKey: string,
  used: number,
  opts: { alwaysOn?: boolean } = {},
): Promise<SpaceAllowanceVerdict> {
  const id = (spaceId ?? '').trim()
  if (!id) return granted(featureKey, 'free', used, true)
  // A key with no meter row has no quantity to enforce. Answer before touching the database.
  if (!featureMeter(featureKey)) return granted(featureKey, 'free', used, true)

  let row: SpacePlanRow | null = null
  try {
    row = await readSpacePlanRow(id)
  } catch {
    row = null
  }
  // Unknown Space: we cannot prove which plan's allowance applies, so we do not enforce one.
  if (!row) return granted(featureKey, 'free', used, true)
  const plan = asSpacePlan(row.plan ?? null)
  // RULE 2: the platform root hub is never a metered tenant.
  if ((row.type ?? '') === 'root') return granted(featureKey, plan, used, true)

  let gatesLive = false
  if (opts.alwaysOn) {
    gatesLive = true
  } else {
    try {
      gatesLive = await featureGatesLive()
    } catch {
      gatesLive = false // RULE 1: a flag read that fails never turns a cap ON.
    }
  }

  // RULE 3: pass the live count as the grandfather floor, so the cap governs growth from today only.
  const verdict = allowanceVerdict(featureKey, plan, used, { gatesLive, floor: used })
  return { ...verdict, featureKey, plan, exempt: false }
}

/** How many more writes fit for this Space, or null when nothing is being enforced (unlimited plan,
 *  gates not live, exempt Space). The bulk form, for an importer that needs a headroom number rather
 *  than a yes/no per row. FAIL-SAFE to null (no limit applied). */
export async function spaceAllowanceHeadroom(
  spaceId: string,
  featureKey: string,
  used: number,
  opts: { alwaysOn?: boolean } = {},
): Promise<number | null> {
  const verdict = await spaceAllowanceVerdict(spaceId, featureKey, used, opts)
  return verdict.enforced ? verdict.remaining : null
}

// ⚠️ NO SHARED "you are at your allowance" SENTENCE LIVES HERE, deliberately. Each refusal already has
// a call site that knows what was being attempted (a code, a month of sends, a row in a CSV), and a
// generic sentence would read wrong in at least one of them ("you keep every one of them" is true of a
// contact list and meaningless of a send quota). Writing one anyway would be exactly the decorative
// export this phase spent its budget deleting. The in-context prompts are Phase 4's job.
