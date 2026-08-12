import { Users } from 'lucide-react'
import { getCallerProfile } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { SectionHeader } from '@/components/ui/section-header'
import { PersonCard } from '@/components/cards/person-card'
import { type CommunityRole } from '@/lib/community-roles'
import { CircleRoleChip } from '@/components/circles/circle-role-chip'
import { circleRoleFromStoredValue } from '@/lib/core/circle-roles'
import { getLedCircles } from '@/app/(main)/lead/load-led-circles'

// Leadership dashboard layout module (ADR-270): "Your co-leaders" — the leaderful, not
// leader-dependent block. For each circle this leader runs, it surfaces the OTHER people who
// help lead it, so the leader can see who shares the load and where they can hand things off.
//
// DATA MODEL (verified, not assumed): a circle's leadership beyond circles.host_id lives on
// the `memberships` table, one row per member per circle, with a per-member `volunteer_role`
// (the `community_role` enum: member/crew/host/guide/mentor/admin/janitor). The hierarchy_v2
// migration is explicit that `volunteer_role` is "null = regular member"; a non-null leadership
// value (host/crew/guide/mentor) marks a member who helps lead THIS circle — the same field the
// circle page renders as its in-circle role badge (CircleMembersList). The host is stored both
// on circles.host_id AND as a membership with volunteer_role='host' (lib/circles/draft.ts,
// claim-actions.ts). So a "co-leader" is a membership for a led circle whose volunteer_role is a
// leadership role, excluding the viewer themself.
//
// Self-fetching RSC scoped to the caller via getCallerProfile; getLedCircles is request-cached so
// it shares the one read with the other lead blocks. The block self-hides (returns null) when none
// of the leader's circles have any co-leaders — there is nothing to manage, so there is no block.

// Who counts as helping LEAD a circle. This USED to be the set {host, crew, guide, mentor}, on
// the reasoning that any non-null volunteer_role marks a leader. That held while the column
// granted nothing. Since ADR-1014 it grants specific capabilities, and only two of its values
// do: 'guide' (the circle's Admin) and 'host' (its Moderator). 'crew' and 'mentor' resolve to a
// plain Member in `circleRoleFromStoredValue` and can moderate nothing, so keeping them here
// would list people as co-leaders who hold no authority in the circle at all.
function circleLeadershipRung(value: CommunityRole | null): 'admin' | 'moderator' | null {
  const rung = circleRoleFromStoredValue(value)
  return rung === 'member' ? null : rung
}

type CoLeaderRow = {
  volunteer_role: CommunityRole | null
  circle_id: string
  profile: {
    id: string
    display_name: string
    handle: string
    avatar_url: string | null
  } | null
}

export async function LeadCoLeaders(): Promise<React.ReactElement | null> {
  const me = await getCallerProfile()
  if (!me) return null

  const circles = await getLedCircles(me.id)
  if (circles.length === 0) return null

  const circleIds = circles.map((c) => c.id)
  const { data: rawRows } = await createAdminClient()
    .from('memberships')
    .select(
      `volunteer_role, circle_id,
       profile:profiles!profile_id ( id, display_name, handle, avatar_url )`,
    )
    .in('circle_id', circleIds)
    .eq('status', 'active')
    .not('volunteer_role', 'is', null)

  const rows = (rawRows ?? []) as unknown as CoLeaderRow[]

  // Group the co-leaders by circle: a leadership-role membership, for someone who is not the
  // viewer. Sort each circle's co-leaders by name for a stable, readable list.
  const byCircle = new Map<string, CoLeaderRow[]>()
  for (const row of rows) {
    if (!row.profile) continue
    if (row.profile.id === me.id) continue
    if (!circleLeadershipRung(row.volunteer_role)) continue
    const list = byCircle.get(row.circle_id) ?? []
    list.push(row)
    byCircle.set(row.circle_id, list)
  }

  // Circles that actually have a co-leader, in the same name order getLedCircles returns.
  const circlesWithCoLeaders = circles.filter((c) => (byCircle.get(c.id)?.length ?? 0) > 0)
  if (circlesWithCoLeaders.length === 0) return null

  const totalCoLeaders = circlesWithCoLeaders.reduce(
    (sum, c) => sum + (byCircle.get(c.id)?.length ?? 0),
    0,
  )

  return (
    <section>
      <SectionHeader title="Your co-leaders" count={totalCoLeaders} />
      <div className="space-y-6">
        {circlesWithCoLeaders.map((circle) => {
          const coLeaders = (byCircle.get(circle.id) ?? [])
            .slice()
            .sort((a, b) =>
              (a.profile?.display_name ?? '').localeCompare(b.profile?.display_name ?? ''),
            )
          return (
            <div key={circle.id}>
              <div className="mb-3 flex items-center gap-1.5 text-body-sm font-semibold text-text">
                <Users className="h-4 w-4 shrink-0 text-subtle" aria-hidden />
                {circle.name}
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {coLeaders.map((row) => {
                  const p = row.profile!
                  const rung = circleLeadershipRung(row.volunteer_role)
                  return (
                    <PersonCard
                      key={`${circle.id}:${p.id}`}
                      handle={p.handle}
                      displayName={p.display_name}
                      avatarUrl={p.avatar_url}
                      meta={rung && <CircleRoleChip role={rung} />}
                    />
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
      <p className="mt-3 text-body-sm text-muted">
        Roles live on each circle. Open one, go to Members, and set anyone to Admin or Moderator
        from their card.
      </p>
    </section>
  )
}
