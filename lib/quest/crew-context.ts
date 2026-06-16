import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isPaidViewer } from '@/lib/core/viewer-hats'
import { journeysFinishedThisSeason, rankForCompletion, type SeasonRank } from '@/lib/season-ranks'
import { getCurrentSeason, type Season } from '@/lib/seasons'

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
}

export const getCrewContext = cache(async (): Promise<CrewContext | null> => {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('id, display_name, is_crew_lead')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  if (!profile) return null

  const [isCrew, finishedCount, season, membershipRow] = await Promise.all([
    isPaidViewer(),
    journeysFinishedThisSeason(profile.id),
    getCurrentSeason(),
    admin
      .from('memberships')
      .select('circle_id, circle:circles!circle_id ( id, name, slug )')
      .eq('profile_id', profile.id)
      .eq('status', 'active')
      .limit(1)
      .maybeSingle(),
  ])

  const circleId = membershipRow.data?.circle_id as string | null | undefined
  const membership = circleId
    ? { circleId, circleName: (membershipRow.data?.circle as { name: string } | null)?.name ?? null }
    : null

  return {
    profileId: profile.id,
    displayName: profile.display_name,
    isCrew,
    isCrewLead: profile.is_crew_lead ?? false,
    season,
    finishedCount,
    rank: rankForCompletion(finishedCount),
    membership,
  }
})
