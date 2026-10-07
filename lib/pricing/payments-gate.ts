// THE PAYMENTS GATE (ADR-1709, LIVE-753). Selling is what Business is for: a Space takes money
// (paid tickets, paid memberships, donations, shop checkout, booking deposits) from the Business
// floor up, and no personal account takes money at all. Tips are the one exception and never come
// through here (lib/billing/tips.ts, 0% on every tier).
//
// 🔴 THIS GATE DOES NOT WAIT FOR THE BETA GRACE WINDOW, the same posture as the paid-Journey gate
// (lib/journeys/sell-gate.ts). featureAllowed grants everything while featureGatesLive() is false,
// which is right for ALLOWANCES and wrong for who may take money: routing this through it would let
// every free Space sell until the window closes, which is the ruling reversed rather than deferred.
// So the ladder check below reads the merged gate map directly and never asks featureGatesLive.
//
// An operator override on `space_payments` in pricing_feature_gates still binds (raise it, or
// disable it in an emergency); the code map is the fail-safe default.
//
// A REFUSAL IS NEVER A DEAD END. Every refusal carries a structured `PaymentsRefusal` the host's
// surface turns into the upgrade moment (components/pricing/upgrade-moment.tsx, LIVE-758): what
// Business adds, its 14-day trial in place, and "keep it free" as an equal choice.
//
// A BUYER refused on a checkout path is shown a neutral sentence and is never told the seller's plan.
//
// NO GRANDFATHER CLAUSE (owner ruling 2026-10-06): the one free Space with paid listings moves to
// Business, so every paid checkout on a free Space or by a personal seller is refused alike.
//
// The copy lives in ./payments-copy.ts, a zero-import leaf a client form can read. The plan check is
// pure; the two async resolvers reach the database through dynamic imports, as gates.ts does.

import { FEATURE_GATES, mergeGate, meetsGate, loadFeatureGateOverrides, type FeatureGateOverrides } from './gates'
import { PAYMENTS_REFUSAL_PERSONAL, PAYMENTS_REFUSAL_SPACE } from './payments-copy'

/** The gate key, declared in FEATURE_GATES at the Business floor. */
const PAYMENTS_FEATURE = 'space_payments'

/** Who was refused: a personal account (Member or Crew), or a Space below the Business floor. */
type PaymentsRefusalScope = 'personal' | 'free_space'

/** The structured refusal a host surface turns into the upgrade moment. */
export interface PaymentsRefusal {
  code: 'payments_plan'
  scope: PaymentsRefusalScope
  spaceId: string | null
  /** Host-facing copy. Never shown to a buyer. */
  message: string
}

type PaymentsVerdict = { ok: true } | { ok: false; refusal: PaymentsRefusal }

/** The refusal for a personal seller. Personal selling is off on every personal tier. */
export function personalPaymentsRefusal(): PaymentsVerdict {
  return { ok: false, refusal: { code: 'payments_plan', scope: 'personal', spaceId: null, message: PAYMENTS_REFUSAL_PERSONAL } }
}

/** The money surfaces that carry a second, channel-specific floor beside space_payments: a paid
 *  membership tier (space_memberships) and Space shop checkout (space_storefront). */
type PaymentsChannelGate = 'space_memberships' | 'space_storefront'

/** Does this Space plan clear the payments gate (and the channel's own floor, when named)? Reads the
 *  merged gate (code map plus any operator override), never the grace window. Unknown labels rank
 *  free (default-deny). PURE. */
export function planTakesPayments(
  plan: string | null | undefined,
  overrides: FeatureGateOverrides = {},
  also?: PaymentsChannelGate,
): boolean {
  const gate = mergeGate(PAYMENTS_FEATURE, overrides) ?? FEATURE_GATES[PAYMENTS_FEATURE]!
  if (!meetsGate(gate, { plan })) return false
  if (!also) return true
  const channel = mergeGate(also, overrides)
  return channel ? meetsGate(channel, { plan }) : true
}

/**
 * May this Space take money? The one server resolver every money path asks.
 *
 *  - The platform's own (root) Space always may: its sales are Frequency's.
 *  - Otherwise the Space's plan must clear `space_payments` (Business floor), read from the merged
 *    gate map and NOT from the grace window.
 *  - `plan`: pass it when the caller already read the row, to save a round trip.
 *  - `also`: the channel's own floor (space_memberships for a paid tier, space_storefront for shop
 *    checkout), checked beside space_payments.
 *
 * FAIL-CLOSED: an unreadable Space refuses. Letting an unentitled Space take somebody's money is the
 * worse error, and a refusal costs one retry.
 */
export async function spacePaymentsVerdict(
  spaceId: string,
  opts: { plan?: string | null; also?: PaymentsChannelGate } = {},
): Promise<PaymentsVerdict> {
  const refuse: PaymentsVerdict = {
    ok: false,
    refusal: { code: 'payments_plan', scope: 'free_space', spaceId, message: PAYMENTS_REFUSAL_SPACE },
  }
  if (!spaceId) return refuse
  try {
    const { loadRootSpaceId } = await import('@/lib/spaces/store')
    if (spaceId === (await loadRootSpaceId())) return { ok: true }

    let plan = opts.plan
    if (plan === undefined) {
      const { createAdminClient } = await import('@/lib/supabase/admin')
      const { data, error } = await createAdminClient().from('spaces').select('plan').eq('id', spaceId).maybeSingle()
      if (error || !data) return refuse
      plan = (data as { plan: string | null }).plan
    }
    if (planTakesPayments(plan, await loadFeatureGateOverrides(), opts.also)) return { ok: true }
    return refuse
  } catch {
    return refuse
  }
}

/** Boolean form of spacePaymentsVerdict, for render-time parity (a surface hides or upsells a price
 *  control rather than offering one that the write will refuse). */
export async function spaceCanTakePayments(spaceId: string, opts: { plan?: string | null } = {}): Promise<boolean> {
  return (await spacePaymentsVerdict(spaceId, opts)).ok
}
