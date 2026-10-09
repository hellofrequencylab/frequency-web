// VERA FREE DAILY CAP — the vera_unlimited gate (ADR-370, REMAINING-WORK #3). The operator-set
// vera_free_daily_cap.messages value (lib/pricing/settings.ts, /admin/pricing) was config only: it
// was never enforced against a member's daily message count. This module is the enforcement seam,
// routed through featureAllowed('vera_unlimited', …) so it is INERT until the feature gates go live.
//
// THE CONTRACT (so live Vera is byte-for-byte unchanged today, the ABSOLUTE INVARIANT):
//   * featureAllowed('vera_unlimited', { tier }, { gatesLive }) short-circuits to TRUE while the
//     feature gates are not live (billing off, or the beta grace window still open, ADR-874), so
//     veraDailyCapReached ALWAYS returns false today — the cap never bites, no extra DB read changes
//     the answer, Vera behaves exactly as before.
//   * Once the gates are live, a Crew member passes the gate (unlimited); a FREE member is
//     held to vera_free_daily_cap.messages live Vera turns per UTC day. Over the cap, the live loop
//     degrades to the deterministic concierge (the EXISTING fallback path — never an error or a wall).
// FAIL-SAFE: any error (gate read, count read) degrades to NOT capped (today's behavior), never to a
// lockout of a member who should have access.

import { accountingRpc } from '../accounting-rpc'
import type { EntitlementTier } from '@/lib/core/entitlement'
import { featureAllowed } from '@/lib/pricing/gates'
import { featureGatesLive, getPricingValues } from '@/lib/pricing/settings'


/** Count member turns, grouping paid tool rounds by operation identity. Legacy ledger rows
 * count individually. Member-quota read failures retain the existing permissive policy;
 * the independent paid-provider admission transaction still fails closed. */
export async function veraMessagesToday(profileId: string): Promise<number> {
  try {
    const { createAdminClient } = await import('@/lib/supabase/admin')
    const admin = createAdminClient()
    const { data, error } = await accountingRpc(admin, 'ai_member_turns_today', { p_profile: profileId })
    if (error || data === null || !Number.isSafeInteger(Number(data)) || Number(data) < 0) throw new Error('Vera turn count unavailable')
    return Number(data)
  } catch {
    return 0
  }
}

/** Has this member reached the free Vera daily cap for a LIVE turn? Routed through the vera_unlimited
 *  gate, so:
 *   - gates NOT live → featureAllowed grants → returns FALSE (never capped; today's behavior, no count read).
 *   - gates live + Crew → gate passes (unlimited) → FALSE.
 *   - gates live + free → counts the member's turns today; TRUE once at/over vera_free_daily_cap.messages.
 *  FAIL-SAFE FALSE on any error. */
export async function veraDailyCapReached(
  profileId: string | null | undefined,
  tier: EntitlementTier | null | undefined,
): Promise<boolean> {
  if (!profileId) return false
  try {
    const gatesLive = await featureGatesLive()
    // The unlimited gate: while the gates are not live this is true (short-circuit), so we never even
    // read the count.
    const unlimited = await featureAllowed('vera_unlimited', { tier: tier ?? 'free' }, { gatesLive })
    if (unlimited) return false

    // Gated (the gates are live + a free member): enforce the operator daily cap against today's count.
    const [{ vera_free_daily_cap }, used] = await Promise.all([
      getPricingValues(),
      veraMessagesToday(profileId),
    ])
    const cap = vera_free_daily_cap?.messages ?? 0
    if (cap <= 0) return false // a non-positive cap means "no cap" (fail-open, never lock out)
    return used >= cap
  } catch {
    return false
  }
}
