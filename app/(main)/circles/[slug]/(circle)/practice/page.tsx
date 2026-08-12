import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import { Users, Lock, Sprout } from 'lucide-react'
import { getMyProfileId } from '@/lib/auth'
import { loadCircleShell } from '@/lib/circles/store'
import { circleCapabilities } from '@/lib/circles/detail-access'
import { getCurrentSeason } from '@/lib/seasons'
import {
  loadCircleBoard,
  loadOptOutPreference,
  getCircleZapContributions,
  summariseContributions,
  type CircleBoardMember,
} from '@/lib/circles/effort-board'
import { MIN_BOARD_CONTRIBUTORS } from '@/lib/quest/effort'
import { CollectiveGoal } from '@/components/quest/collective-goal'
import { BoardControls } from '@/components/quest/board-controls'
import { LeaderboardList, type LeaderboardListEntry, type LeaderboardTrack } from '@/components/quest/leaderboard-list'
import { LogPracticeButton } from '@/components/practice/log-practice-button'
import { SectionHeader } from '@/components/ui/section-header'
import { EmptyState } from '@/components/ui/empty-state'
import { Skeleton } from '@/components/ui/skeleton'
import { loadCirclePractice } from '../tab-facts'

// ── THE PRACTICE TAB ────────────────────────────────────────────────────────────────────────────
//
// A BODY, not a shell: the cover, the title and the tab strip belong to the route-segment layout
// two directories up, which owns the single page <h1> (composing a template here would emit a
// second one and trip `check:headers`).
//
// THE LEADERBOARD FOLDED IN HERE, AND THE REASON IS THE BOARD'S OWN DESIGN (owner ruling,
// 2026-08-12). It measures effort relative to YOURSELF: a member is scored against their own recent
// baseline, so a beginner and a veteran can both be doing well in the same week. That is not a peer
// entity of "this week's practice", it is a READING of it, so it was never a sibling tab. It was a
// second front door onto the same subject, and a member who found one never learned the other
// existed. /circles/<slug>/leaderboard now redirects here.
//
// SO THE TAB READS TOP TO BOTTOM AS ONE THING: what we are practising, then how the practice is
// going for the Circle as a whole, then how it is going for you.
//
// THE RULES, THE FORMULA AND EVERY "WHY" LIVE IN lib/quest/effort.ts; this file is what a member
// sees. Four things it does differently from /crew/leaderboard, each on purpose:
//
//  1. IT LEADS WITH THE SHARED TOTAL. CollectiveGoal is the headline; the list of people is
//     secondary and sits below it. That ordering is the research (Festinger 1954, JMIR 2021), and
//     it is the ordering the crew board already chose.
//  2. NO SCOPE SWITCHER. A Circle board IS the local scope. Offering Hub and Global here would let
//     a member zoom out to the exact comparison the literature says demotivates them.
//  3. IT REFUSES TO RENDER A LADDER OF THREE. Under MIN_BOARD_CONTRIBUTORS people showing up in the
//     same week, there is no list: the shared bar stands alone with a straight answer about why.
//     Production's largest circle holds two members and five posts, so this is the COMMON path.
//  4. NO POSITIONS, AND THE ORDER IS ALPHABETICAL. Nobody is told where they placed, because there
//     is no placing: two rows' numbers have different denominators and are not comparable.
//
// WHO SEES THE ROWS. Members and the circle's managers. A visitor gets the circle-level bar (the
// same kind of aggregate a capacity line already shows) and nothing about individuals.

type Track = Extract<LeaderboardTrack, 'effort' | 'consistency'>

const TRACKS: Track[] = ['effort', 'consistency']

export const metadata = { title: 'Practice' }

function parseTrack(v: string | undefined): Track {
  return v === 'consistency' ? 'consistency' : 'effort'
}

function toEntry(m: CircleBoardMember): LeaderboardListEntry {
  return {
    id: m.id,
    displayName: m.displayName,
    handle: m.handle,
    avatarUrl: m.avatarUrl,
    seasonRank: m.seasonRank,
    seasonZaps: m.seasonZaps,
    streak: m.streak,
    effort: { band: m.effort.band, index: m.effort.index, daysThisWeek: m.effort.daysThisWeek },
  }
}

export default async function CirclePracticePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ track?: string }>
}) {
  const { slug } = await params

  // The same request-memoized load the shell made: a hit, not a second pair of queries.
  const shell = await loadCircleShell(slug)
  if (!shell) notFound()
  const { circle, members } = shell

  const [{ track: trackParam }, myProfileId, caps, season, practice] = await Promise.all([
    searchParams,
    getMyProfileId(),
    circleCapabilities(circle.id),
    getCurrentSeason(),
    // Memoized by the shell, which already asked this to decide whether this tab exists.
    loadCirclePractice(circle.id),
  ])
  const track = parseTrack(trackParam)

  const memberIds = members.map((m) => m.profile?.id).filter((id): id is string => Boolean(id))
  const isMember = !!myProfileId && memberIds.includes(myProfileId)
  const canManage = caps.has('circle.editSettings')
  const canSeeRows = isMember || canManage

  // The shared total paints with the shell: two cheap circle-scoped reads, memoized so the streamed
  // board section below asks the same question for free. The viewer's board preference rides along
  // beside it, because the control that toggles it sits above the streamed section.
  const [contributions, optedOut] = await Promise.all([
    getCircleZapContributions(circle.id),
    canSeeRows ? loadOptOutPreference(myProfileId) : Promise.resolve(false),
  ])
  const { total, contributors } = summariseContributions(contributions)

  return (
    <div className="space-y-8">
      {/* 1. WHAT WE ARE PRACTISING. The host-assigned practice, and for a member the one button
             that turns it into a logged day. */}
      <section aria-labelledby="circle-practice-heading">
        <SectionHeader id="circle-practice-heading" title="This week's practice" />
        {practice ? (
          <div className="rounded-card border border-border bg-surface px-5 py-4">
            <p className="font-medium text-text">{practice.title}</p>
            {practice.description && (
              <p className="mt-0.5 text-body-sm text-muted">{practice.description}</p>
            )}
            {isMember && (
              <div className="mt-3">
                <LogPracticeButton practiceId={practice.id} circleId={circle.id} />
              </div>
            )}
          </div>
        ) : (
          <EmptyState
            variant="first-use"
            icon={Sprout}
            title="No practice set yet"
            description={
              canManage
                ? 'Set one from the circle tools and it shows up here for everyone, with a log button beside it.'
                : 'The host has not picked one yet. It shows up here when they do.'
            }
          />
        )}
      </section>

      {/* 2. HOW IT IS GOING FOR THE CIRCLE. This one belongs to the group, and it leads the board. */}
      <section aria-labelledby="circle-effort-heading" className="space-y-4">
        <SectionHeader id="circle-effort-heading" title="How the circle is doing" />
        <CollectiveGoal
          scopeLabel="this Circle"
          total={total}
          contributors={contributors}
          seasonName={season?.name}
        />

        {!canSeeRows ? (
          <EmptyState
            variant="permission"
            icon={Lock}
            title="The board is for people in this Circle"
            description="The total above is the whole Circle's. Join, log a practice, and your own week shows up here."
          />
        ) : (
          <div className="space-y-4">
            <BoardControls
              track={track}
              hidden={optedOut}
              basePath={`/circles/${circle.slug}/practice`}
              tracks={TRACKS}
              showScope={false}
            />
            <Suspense key={track} fallback={<BoardSkeleton />}>
              <BoardSection
                circleId={circle.id}
                memberIds={memberIds}
                viewerId={myProfileId}
                track={track}
              />
            </Suspense>
          </div>
        )}
      </section>
    </div>
  )
}

// The board is awaited behind <Suspense> so the practice + the shared bar above paint immediately
// and the list streams in (PAGE-FRAMEWORK §5).
async function BoardSection({
  circleId,
  memberIds,
  viewerId,
  track,
}: {
  circleId: string
  memberIds: string[]
  viewerId: string | null
  track: Track
}) {
  const board = await loadCircleBoard(circleId, memberIds, viewerId)
  const me = board.me
  // "Your week" is the reading that works at every Circle size and needs nobody else to exist, so
  // it fills in exactly when the list does not already carry the viewer's row: below the gate, when
  // they are hidden, and on the week they have not logged anything.
  const showMyWeek = !!me && !board.rows.some((r) => r.id === me.id)

  return (
    <div className="space-y-6">
      <section aria-labelledby="circle-board-heading">
        <SectionHeader
          id="circle-board-heading"
          title="This week"
          count={board.showsBoard ? board.rows.length : undefined}
        />
        {board.showsBoard ? (
          <>
            <p className="-mt-2 mb-3 text-body-sm text-muted">
              {track === 'effort'
                ? "Everyone here is measured against their own last few weeks, not against each other. The list is alphabetical, so there's no first place."
                : "Everyone's current daily practice streak. Same alphabetical list: this is what each person has going, not a race."}
            </p>
            <LeaderboardList entries={board.rows.map(toEntry)} track={track} selfId={viewerId ?? ''} showPosition={false} />
          </>
        ) : (
          <EmptyState
            variant="first-use"
            icon={Users}
            title="No board yet"
            description={
              board.showing === 0
                ? `Nobody has logged anything in the last 7 days. A board needs about ${MIN_BOARD_CONTRIBUTORS} people showing up in the same week before it says anything worth reading. The total above counts everyone either way.`
                : `${board.showing === 1 ? 'One person has' : `${board.showing} people have`} shown up this week. A board needs about ${MIN_BOARD_CONTRIBUTORS} in the same week before it says anything worth reading, so there's no list yet. The total above counts everyone either way.`
            }
          />
        )}
      </section>

      {/* The whole answer for a circle of two, and what a member in their first week gets while
          their usual week is still being built. */}
      {me && showMyWeek && (
        <section aria-labelledby="my-week-heading">
          <SectionHeader id="my-week-heading" title="Your week" />
          {me.effort.recent === 0 ? (
            <p className="text-body-sm text-muted">
              You haven&apos;t logged anything in the last 7 days. Nothing is lost. Log one practice and your
              week starts counting again.
            </p>
          ) : (
            <LeaderboardList entries={[toEntry(me)]} track={track} selfId={me.id} showPosition={false} />
          )}
          {me.optedOut && (
            <p className="mt-3 text-meta text-muted">
              You&apos;re hidden from this Circle&apos;s list right now. You still count toward the shared total.
            </p>
          )}
        </section>
      )}

      {/* The formula, in plain words. A score nobody can explain is a score nobody trusts, and this
          one is explainable in three sentences, so it gets three sentences. */}
      {track === 'effort' && (
        <section aria-labelledby="how-it-works-heading" className="rounded-card border border-border bg-surface/50 px-5 py-4">
          <h2 id="how-it-works-heading" className="text-body-sm font-bold text-text">
            How the number works
          </h2>
          <ul className="mt-2 space-y-1.5 text-body-sm text-muted">
            <li>
              It&apos;s the Zaps you earned in the last 7 days, as a percent of your own usual week. Your usual
              week is the middle of your last four weeks that had any activity.
            </li>
            <li>
              You need two of those four weeks before there&apos;s a usual week to compare with. Until then your
              row shows the days you showed up, and the chip on it says so.
            </li>
            <li>
              A gap never costs you anything. Come back after a quiet month and your row reads &ldquo;Back this
              week&rdquo; instead of a number. Take a week off and you&apos;re simply not on the list.
            </li>
          </ul>
        </section>
      )}
    </div>
  )
}

function BoardSkeleton() {
  return (
    <div className="space-y-1.5">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex min-h-[3.25rem] items-center gap-3 rounded-card bg-surface-elevated/40 px-3 py-2">
          <Skeleton className="h-9 w-9 shrink-0 rounded-pill" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3.5 w-32" />
            <Skeleton className="h-3 w-24" />
          </div>
          <Skeleton className="h-4 w-16 shrink-0" />
        </div>
      ))}
    </div>
  )
}
