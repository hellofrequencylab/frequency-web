import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isPaidViewer } from '@/lib/core/viewer-hats'
import { journeysFinishedThisSeason, rankForCompletion, type SeasonRank } from '@/lib/season-ranks'
import { getCurrentSeason, type Season } from '@/lib/seasons'
import type { EntitlementTier } from '@/lib/core/entitlement'
import {
  resolveGamificationAccessWithFlags,
  gamificationFullAllowed,
} from '@/lib/pricing/gamification-access'
import { loadPricingFlags } from '@/lib/pricing/settings'
import type { GamificationAccess } from '@/lib/pricing/gamification'

// The shared My Quest (/crew) viewer context. The page header AND every /crew layout module
// (components/widgets/quest/*) read from this ONE request-cached resolver, so the cross-cutting
// reads — who the viewer is, their season standing, their circle — run once per request no
// matter how many blocks the operator has placed. Each block then does only its own specific
// read. Returns null when there is no signed-in member (the page calls notFound() on null).

export interface CrewContext {
  profileId: string
  displayName: string
  /** A paid/crew viewer (drives task + preview gating). */
  isCrew: boolean
  isCrewLead: boolean
  season: Season | null
  /** Journeys finished this season (0-3) — drives the rank. */
  finishedCount: number
  rank: SeasonRank
  /** The viewer's first active circle membership, or null. */
  membership: { circleId: string; circleName: string | null } | null
  /** The viewer's resolved gamification access (the third flag, ADR-362/370): 'full' = the complete
   *  loop (compete/claim/spend), 'earn_only' = accrue but cannot cash in. Folds the per-profile
   *  override, the operator per-role flags, then derive-from-tier. While billing is OFF this is the
   *  same line as today (crew/supporter = full, member = earn_only). */
  gamificationAccess: GamificationAccess
  /** The standalone full-gamification gate (gamification_full via featureAllowed). INERT (true) while
   *  billing is OFF, so surfaces that consult it behave exactly as today until an operator turns
   *  billing on. */
  gamificationFull: boolean
}

export const getCrewContext = cache(async (): Promise<CrewContext | null> => {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const admin = createAdminClient()
  // membership_tier + gamification_access_override feed the third-flag resolver; the override column
  // isn't in the generated types yet (ADR-246), so select past the typed row with the untyped cast.
  const { data: profile } = await (admin as unknown as {
    from: (t: string) => {
      select: (c: string) => {
        eq: (col: string, v: string) => { maybeSingle: () => Promise<{ data: Record<string, unknown> | null }> }
      }
    }
  })
    .from('profiles')
    .select('id, display_name, is_crew_lead, membership_tier, gamification_access_override')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  if (!profile?.id) return null
  const profileId = profile.id as string
  const tier = ((profile.membership_tier as EntitlementTier | null) ?? 'free') as EntitlementTier

  const [isCrew, finishedCount, season, membershipRow, flags, gamificationFull] = await Promise.all([
    isPaidViewer(),
    journeysFinishedThisSeason(profileId),
    getCurrentSeason(),
    admin
      .from('memberships')
      .select('circle_id, circle:circles!circle_id ( id, name, slug )')
      .eq('profile_id', profileId)
      .eq('status', 'active')
      .limit(1)
      .maybeSingle(),
    loadPricingFlags(),
    gamificationFullAllowed(tier),
  ])

  const circleId = membershipRow.data?.circle_id as string | null | undefined
  const membership = circleId
    ? { circleId, circleName: (membershipRow.data?.circle as { name: string } | null)?.name ?? null }
    : null

  return {
    profileId,
    displayName: profile.display_name as string,
    isCrew,
    isCrewLead: (profile.is_crew_lead as boolean | null) ?? false,
    season,
    finishedCount,
    rank: rankForCompletion(finishedCount),
    membership,
    gamificationAccess: resolveGamificationAccessWithFlags(
      { membership_tier: tier, gamification_access_override: profile.gamification_access_override },
      flags,
    ),
    gamificationFull,
  }
})
