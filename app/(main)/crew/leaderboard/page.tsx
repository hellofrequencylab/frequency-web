import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import { Users, QrCode, UserPlus, Filter } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { rankForCompletion, journeysFinishedThisSeason, type SeasonRank } from '@/lib/season-ranks'
import { getInitials } from '@/lib/utils'
import { listEntryPointLeaderboard, signupsToNextTier } from '@/lib/entry-points/leaderboard'
import { getCurrentSeason } from '@/lib/seasons'
import { IndexTemplate } from '@/components/templates'
import { EmptyState } from '@/components/ui/empty-state'
import { SectionHeader } from '@/components/ui/section-header'
import { Skeleton } from '@/components/ui/skeleton'
import { StandingHero } from '@/components/gamification/standing-hero'
import { CollectiveGoal } from '@/components/quest/collective-goal'
import { LeaderboardList, type LeaderboardListEntry, type LeaderboardTrack } from '@/components/quest/leaderboard-list'
import { BoardControls } from '@/components/quest/board-controls'
import { isOptedOut } from './opt-out'

// The Quest leaderboard — cooperative-first (ADR: cooperative leaderboard).
//
// Research on absolute/global boards (JMIR 2021; Festinger 1954; Apple Fitness's
// shared-goal model; Peloton's cautionary ranking churn) is consistent: ranking the
// non-top majority against everyone demotivates them. Our audience is tired,
// skeptical adults who reward honesty. So the page is built in this order:
//   1. LEAD with a collective goal — the Circle's combined Zaps filling a shared
//      milestone everyone contributes to. "We're doing this together." (CollectiveGoal)
//   2. The individual board is SECONDARY, LOCAL by default (your Circle), and
//      opt-in by feel — a one-tap "hide me from the board" toggle (BoardControls).
//   3. A CONSISTENCY track ranks by daily practice streak, so the steady person can
//      lead on showing up, not only on raw Zaps (the Strava "Local Legend" model).
// Zero dark patterns: no fake rivals, no podium theatrics, no shame for low ranks,
// no manufactured urgency.

type Scope = 'circle' | 'hub' | 'global'
type Track = LeaderboardTrack

function parseScope(v: string | undefined): Scope {
  return v === 'hub' || v === 'global' ? v : 'circle'
}
function parseTrack(v: string | undefined): Track {
  return v === 'consistency' ? 'consistency' : 'zaps'
}

const SCOPE_PHRASE: Record<Scope, string> = {
  circle: 'your Circle',
  hub: 'your Hub',
  global: 'the season',
}

// --- scope resolution ------------------------------------------------------
// Resolve the set of member ids in the active scope. Local (Circle) is the
// default; Hub widens to every Circle in your Hubs; Global is everyone active.

async function membersInScope(
  admin: ReturnType<typeof createAdminClient>,
  scope: Scope,
  profileId: string,
): Promise<string[] | 'all'> {
  if (scope === 'global') return 'all'

  const { data: myMemberships } = await admin
    .from('memberships')
    .select('circle_id')
    .eq('profile_id', profileId)
    .eq('status', 'active')
  const circleIds = (myMemberships ?? []).map((m) => m.circle_id as string)
  if (circleIds.length === 0) return []

  if (scope === 'circle') {
    const { data: members } = await admin
      .from('memberships')
      .select('profile_id')
      .in('circle_id', circleIds)
      .eq('status', 'active')
    return [...new Set((members ?? []).map((m) => m.profile_id as string))]
  }

  // hub
  const { data: circles } = await admin.from('circles').select('hub_id').in('id', circleIds)
  const hubIds = [...new Set((circles ?? []).map((c) => c.hub_id).filter((id): id is string => Boolean(id)))]
  if (hubIds.length === 0) return []
  const { data: hubCircles } = await admin.from('circles').select('id').in('hub_id', hubIds)
  const allCircleIds = (hubCircles ?? []).map((c) => c.id as string)
  const { data: members } = await admin
    .from('memberships')
    .select('profile_id')
    .in('circle_id', allCircleIds)
    .eq('status', 'active')
  return [...new Set((members ?? []).map((m) => m.profile_id as string))]
}

// --- the collective goal (the headline) ------------------------------------
// The combined season Zaps across everyone in scope + how many contributed. This
// is intentionally cheap (one read) so it paints with the shell.

async function getCollective(
  admin: ReturnType<typeof createAdminClient>,
  scope: Scope,
  profileId: string,
): Promise<{ total: number; contributors: number }> {
  const ids = await membersInScope(admin, scope, profileId)
  if (ids !== 'all' && ids.length === 0) return { total: 0, contributors: 0 }

  let query = admin
    .from('profiles')
    .select('current_season_zaps')
    .eq('is_active', true)
    .eq('is_system', false)
    .gt('current_season_zaps', 0)
  if (ids !== 'all') query = query.in('id', ids)

  const { data } = await query
  const rows = data ?? []
  const total = rows.reduce((sum, r) => sum + ((r.current_season_zaps as number | null) ?? 0), 0)
  return { total, contributors: rows.length }
}

// --- the secondary individual board ----------------------------------------

async function getBoard(
  admin: ReturnType<typeof createAdminClient>,
  scope: Scope,
  track: Track,
  profileId: string,
  limit: number,
): Promise<LeaderboardListEntry[]> {
  const ids = await membersInScope(admin, scope, profileId)
  if (ids !== 'all' && ids.length === 0) return []

  const orderCol = track === 'consistency' ? 'current_streak' : 'current_season_zaps'

  let query = admin
    .from('profiles')
    .select('id, display_name, handle, avatar_url, current_season_zaps, current_season_rank, current_streak, meta')
    .eq('is_active', true)
    .eq('is_system', false)
    .order(orderCol, { ascending: false })
    .limit(limit + 40) // headroom: opted-out rows are filtered in app code below
  if (ids !== 'all') query = query.in('id', ids)

  const { data: profiles } = await query

  return (profiles ?? [])
    // Respect each member's "hide me from the board" preference. They still count
    // toward the collective goal above; they simply don't appear as a row here.
    .filter((p) => !isOptedOut(p.meta as Record<string, unknown> | null))
    .slice(0, limit)
    .map((p) => ({
      id: p.id,
      displayName: p.display_name,
      handle: p.handle,
      avatarUrl: p.avatar_url,
      seasonZaps: p.current_season_zaps ?? 0,
      seasonRank: (p.current_season_rank ?? 'ghost') as SeasonRank,
      streak: p.current_streak ?? 0,
    }))
}

// The board section is awaited behind <Suspense> so the shell + collective goal
// paint immediately and the list streams in (PAGE-FRAMEWORK §5).
async function BoardSection({
  scope,
  track,
  profileId,
  optedOut,
}: {
  scope: Scope
  track: Track
  profileId: string
  optedOut: boolean
}) {
  const admin = createAdminClient()
  const limit = scope === 'global' ? 50 : scope === 'hub' ? 30 : 20
  const entries = await getBoard(admin, scope, track, profileId, limit)

  const trackNote =
    track === 'consistency'
      ? 'Ranked by your daily practice streak, so showing up steadily counts as much as anything.'
      : `Season Zaps within ${SCOPE_PHRASE[scope]}. This sits below the shared goal on purpose.`

  return (
    <section aria-labelledby="board-heading">
      <SectionHeader title="Where people stand" />
      <p className="-mt-2 mb-3 text-sm text-muted" id="board-heading">
        {trackNote}
      </p>

      {entries.length === 0 ? (
        <EmptyState
          variant="first-use"
          icon={Users}
          title="No one to show yet."
          description={
            scope === 'circle'
              ? 'Join a Circle and log a practice, and the board fills in here.'
              : 'Once people start logging practices, they show up here.'
          }
        />
      ) : (
        <LeaderboardList entries={entries} track={track} selfId={profileId} />
      )}

      {optedOut && (
        <p className="mt-3 text-xs text-muted">
          You are hidden from this board right now. You still count toward the shared goal above.
        </p>
      )}
    </section>
  )
}

function BoardSkeleton() {
  return (
    <div className="space-y-1.5">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="flex min-h-[3.25rem] items-center gap-3 rounded-2xl bg-surface-elevated/40 px-3 py-2">
          <Skeleton className="h-4 w-4 shrink-0" />
          <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3.5 w-32" />
            <Skeleton className="h-3 w-16" />
          </div>
          <Skeleton className="h-4 w-12 shrink-0" />
        </div>
      ))}
    </div>
  )
}

export default async function LeaderboardPage({
  searchParams,
}: {
  searchParams: Promise<{ scope?: string; track?: string }>
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) notFound()

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('id, current_season_zaps, current_streak, lifetime_gems, meta')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  if (!profile) notFound()

  const params = await searchParams

  // Entry-point recruiter board (ADR-134) — a distinct operator board with its own
  // metrics (scans + signups + tier). Reached by deep link; kept intact, rendered
  // with the responsive row pattern, separate from the cooperative model below.
  if (params.scope === 'entrypoints') {
    return <EntryPointsBoard profileId={profile.id} />
  }

  const scope = parseScope(params.scope)
  const track = parseTrack(params.track)
  const optedOut = isOptedOut(profile.meta as Record<string, unknown> | null)

  // Fast reads for the always-visible band: the viewer's standing + the season +
  // the collective total. None block the streamed board below.
  const myZaps = (profile as { current_season_zaps: number | null }).current_season_zaps ?? 0
  const myGems = (profile as { lifetime_gems: number | null }).lifetime_gems ?? 0
  const myStreak = (profile as { current_streak: number | null }).current_streak ?? 0
  const [myFinishedCount, season, collective] = await Promise.all([
    journeysFinishedThisSeason(profile.id),
    getCurrentSeason(),
    getCollective(admin, scope, profile.id),
  ])
  const myStandingRank = rankForCompletion(myFinishedCount)

  return (
    <IndexTemplate
      title="Leaderboard"
      description="One shared goal first. Where people stand sits below it, scoped to your Circle, and yours to opt out of."
    >
      <div className="space-y-6">
        {/* 1. The collective goal — the headline. We're doing this together. */}
        <CollectiveGoal
          scopeLabel={SCOPE_PHRASE[scope]}
          total={collective.total}
          contributors={collective.contributors}
          seasonName={season?.name}
        />

        {/* The viewer's own standing — "where am I in the game", de-emphasized
            beneath the shared goal. */}
        <StandingHero
          zaps={myZaps}
          gems={myGems}
          streak={myStreak}
          rank={myStandingRank}
          journeysFinished={myFinishedCount}
          seasonName={season?.name}
          links={{ zaps: '/crew/leaderboard', rank: '/crew/achievements', streak: '/crew/streaks', gems: '/crew/store' }}
        />

        {/* 2 + 3. The secondary individual board: local-by-default scope, a Zaps /
            Consistency track toggle, and a one-tap hide-me control. */}
        <div className="space-y-4">
          <BoardControls scope={scope} track={track} hidden={optedOut} />
          <Suspense key={`${scope}-${track}`} fallback={<BoardSkeleton />}>
            <BoardSection scope={scope} track={track} profileId={profile.id} optedOut={optedOut} />
          </Suspense>
        </div>
      </div>
    </IndexTemplate>
  )
}

// --- entry-point recruiter board (ADR-134) ---------------------------------
// Preserved as a separate operator board, modernized to the responsive row pattern.

async function EntryPointsBoard({ profileId }: { profileId: string }) {
  const rows = await listEntryPointLeaderboard(50)
  const myIdx = rows.findIndex((r) => r.id === profileId)
  const me = myIdx >= 0 ? rows[myIdx] : null
  const nextTier = me ? signupsToNextTier(me.signups) : null

  return (
    <IndexTemplate
      title="Entry points"
      description="Crew who build entry points and bring people in. A recognition board, separate from the season standing."
      back={{ href: '/crew/leaderboard', label: 'Back to the leaderboard' }}
    >
      {me && (
        <div className="mb-4 rounded-2xl bg-primary-bg/50 px-4 py-2.5 text-sm font-medium text-primary-strong">
          #{myIdx + 1} of {rows.length} · {me.tier.emoji} {me.tier.label} · {me.signups} signup{me.signups === 1 ? '' : 's'} from {me.scans} scan{me.scans === 1 ? '' : 's'}
          {nextTier && (
            <span className="font-normal text-muted"> · {nextTier.remaining} more to {nextTier.next.label}</span>
          )}
        </div>
      )}

      {rows.length === 0 ? (
        <EmptyState variant="first-use" icon={Filter} title="No entry points yet." description="Crew who build entry points and drive signups show up here." />
      ) : (
        <ol className="space-y-1.5">
          {rows.map((entry, i) => {
            const isSelf = entry.id === profileId
            return (
              <li key={entry.id}>
                <Link
                  href={`/people/${entry.handle}`}
                  className={`flex min-h-[3.25rem] items-center gap-3 rounded-2xl px-3 py-2 transition-colors motion-reduce:transition-none ${
                    isSelf ? 'bg-primary-bg/60 dark:bg-primary-bg' : 'bg-surface-elevated/40 hover:bg-surface-elevated'
                  }`}
                >
                  <span className="w-6 shrink-0 text-center text-sm font-semibold tabular-nums text-subtle">{i + 1}</span>
                  {entry.avatarUrl ? (
                    <Image src={entry.avatarUrl} alt="" width={36} height={36} className="h-9 w-9 shrink-0 rounded-full object-cover" />
                  ) : (
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-bg text-xs font-bold text-primary-strong" aria-hidden>
                      {getInitials(entry.displayName)}
                    </span>
                  )}
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className={`text-sm leading-tight ${isSelf ? 'font-bold text-primary-strong' : 'font-semibold text-text'}`}>
                      {entry.displayName}
                      {isSelf && <span className="ml-1.5 text-xs font-medium text-primary-strong">you</span>}
                    </span>
                    <span className="text-xs font-medium text-muted">{entry.tier.emoji} {entry.tier.label}</span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-0.5 text-right">
                    <span className="inline-flex items-center gap-1 text-sm font-bold tabular-nums text-text">
                      <UserPlus className="h-3.5 w-3.5 text-primary" aria-hidden />
                      {entry.signups.toLocaleString()}
                    </span>
                    <span className="inline-flex items-center gap-1 text-xs tabular-nums text-muted">
                      <QrCode className="h-3 w-3" aria-hidden />
                      {entry.scans.toLocaleString()}
                    </span>
                  </span>
                </Link>
              </li>
            )
          })}
        </ol>
      )}
    </IndexTemplate>
  )
}
