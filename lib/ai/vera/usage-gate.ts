// VERA FREE DAILY CAP — the vera_unlimited gate (ADR-370, REMAINING-WORK #3). The operator-set
// vera_free_daily_cap.messages value (lib/pricing/settings.ts, /admin/pricing) was config only: it
// was never enforced against a member's daily message count. This module is the enforcement seam,
// routed through featureAllowed('vera_unlimited', …) so it is INERT while billing is OFF.
//
// THE CONTRACT (so live Vera is byte-for-byte unchanged today, the ABSOLUTE INVARIANT):
//   * featureAllowed('vera_unlimited', { tier }, { billingLive }) short-circuits to TRUE while
//     billing_live is OFF, so veraDailyCapReached ALWAYS returns false today — the cap never bites,
//     no extra DB read changes the answer, Vera behaves exactly as before.
//   * Once billing is live, a crew/supporter member passes the gate (unlimited); a FREE member is
//     held to vera_free_daily_cap.messages live Vera turns per UTC day. Over the cap, the live loop
//     degrades to the deterministic concierge (the EXISTING fallback path — never an error or a wall).
// FAIL-SAFE: any error (gate read, count read) degrades to NOT capped (today's behavior), never to a
// lockout of a member who should have access.

import type { EntitlementTier } from '@/lib/core/entitlement'
import { featureAllowed } from '@/lib/pricing/gates'
import { billingLive, getPricingValues } from '@/lib/pricing/settings'

const VERA_FEATURE = 'vera-chat'

/** Count a member's live Vera turns logged today (UTC day), from the ai_usage ledger. FAIL-SAFE:
 *  returns 0 on any error (so the cap never wrongly blocks). The ai_usage table isn't in the
 *  generated types (ADR-246) — reach untyped, the same pattern lib/ai/usage.ts uses. A head+exact
 *  count avoids pulling the rows. */
export async function veraMessagesToday(profileId: string): Promise<number> {
  try {
    const { createAdminClient } = await import('@/lib/supabase/admin')
    const admin = createAdminClient()
    const since = new Date()
    since.setUTCHours(0, 0, 0, 0)
    const res = await (admin as unknown as {
      from: (t: string) => {
        select: (c: string, opts: { count: 'exact'; head: true }) => {
          eq: (col: string, v: string) => {
            eq: (col2: string, v2: string) => {
              gte: (col3: string, v3: string) => Promise<{ count: number | null }>
            }
          }
        }
      }
    })
      .from('ai_usage')
      .select('id', { count: 'exact', head: true })
      .eq('feature', VERA_FEATURE)
      .eq('profile_id', profileId)
      .gte('created_at', since.toISOString())
    return res.count ?? 0
  } catch {
    return 0
  }
}

/** Has this member reached the free Vera daily cap for a LIVE turn? Routed through the vera_unlimited
 *  gate, so:
 *   - billing OFF  → featureAllowed grants → returns FALSE (never capped; today's behavior, no count read).
 *   - billing ON + crew/supporter → gate passes (unlimited) → FALSE.
 *   - billing ON + free → counts the member's turns today; TRUE once at/over vera_free_daily_cap.messages.
 *  FAIL-SAFE FALSE on any error. */
export async function veraDailyCapReached(
  profileId: string | null | undefined,
  tier: EntitlementTier | null | undefined,
): Promise<boolean> {
  if (!profileId) return false
  try {
    const live = await billingLive()
    // The unlimited gate: while OFF this is true (short-circuit), so we never even read the count.
    const unlimited = await featureAllowed('vera_unlimited', { tier: tier ?? 'free' }, { billingLive: live })
    if (unlimited) return false

    // Gated (billing live + a free member): enforce the operator daily cap against today's count.
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
