// THE PAYMENTS PLAN CHECK (ADR-1709, LIVE-753), the pure half of ./payments-gate.ts. It imports only
// ./gates, so the pricing grid (reached from client components) can ask which plans sell without
// pulling the gate's server resolvers into a client bundle.

import { FEATURE_GATES, mergeGate, meetsGate, type FeatureGateOverrides } from './gates'

/** The gate key, declared in FEATURE_GATES at the Business floor. */
const PAYMENTS_FEATURE = 'space_payments'

/** The money surfaces that carry a second, channel-specific floor beside space_payments: a paid
 *  membership tier (space_memberships) and Space shop checkout (space_storefront). */
export type PaymentsChannelGate = 'space_memberships' | 'space_storefront'

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
