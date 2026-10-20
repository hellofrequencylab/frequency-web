import { authorizeCaller } from '@/lib/contract/caller'
import { failFrom, fail, ok, rateLimited } from '@/lib/contract/respond'
import { toLoyaltyCardView } from '@/lib/contract/views'
import { listMyLoyaltyCards, loyaltyEnabled } from '@/lib/loyalty/store'

// GET /api/v1/rewards (LIVE-1122): what the web's /rewards page shows, for the app. Every Regulars
// stamp card the caller holds, with the reward codes waiting at the counter, plus the caller's season
// Zaps and streak (their own profile row, already read by authorizeCaller under RLS).
//
// Same reads as app/(main)/rewards/page.tsx: listMyLoyaltyCards scoped to the caller's own profile id,
// behind the same LOYALTY_ENABLED switch. PRIVACY: own cards only; there is no id parameter.

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const limited = await rateLimited(request, 'rewards')
  if (limited) return limited
  const auth = await authorizeCaller(request)
  if (!auth.ok) return fail(auth.code, auth.message)
  try {
    const enabled = loyaltyEnabled()
    const cards = enabled ? await listMyLoyaltyCards(auth.caller.id) : []
    return ok({
      enabled,
      seasonZaps: auth.profile.current_season_zaps ?? null,
      streak: auth.profile.current_streak ?? null,
      cards: cards.map(toLoyaltyCardView),
    })
  } catch (e) {
    return failFrom(e)
  }
}
