import { notFound } from 'next/navigation'
import { getMyProfileId } from '@/lib/auth'
import { loadCircleShell } from '@/lib/circles/store'
import { circleCapabilities } from '@/lib/circles/detail-access'
import { getCurrentSeason } from '@/lib/seasons'
import { loadOptOutPreference, getCircleZapContributions, summariseContributions } from '@/lib/circles/effort-board'
import { type LeaderboardTrack } from '@/components/quest/leaderboard-list'
import { FqCircleStatsPane } from '@/components/frequency/members/circle/stats-pane'

// ── THE CIRCLE STATS TAB ────────────────────────────────────────────────────────────────────────
//
// A BODY, not a shell: the cover, the title and the tab strip belong to the route-segment layout
// one directory up, which owns the single page <h1> (composing a template here would emit a second
// one and trip `check:headers`).
//
// WHAT IT CARRIES, top to bottom (owner ruling, 2026-08-13): the Circle's vital signs, then how the
// practice is going for the Circle as a whole, then how it is going for you. Numbers first, people
// second. /circles/<slug>/leaderboard redirects here.
//
// 1. MOMENTUM. The four tiles — members, new this week, new connections, upcoming events — are the
//    same component the arrangeable `circle-momentum` block renders. It is rendered DIRECTLY here
//    rather than through <PageModules>, because this tab is not operator-arrangeable.
//
//    IT IS THE PRESENTATIONAL WIDGET, NOT THE BLOCK WRAPPER, and that is the whole reason no circle
//    context is stamped in this file. components/widgets/circles/circle-momentum.tsx reads
//    lib/circles/active-circle.ts for exactly one value — the circle id — and then hands it to
//    components/connections/circle-momentum.tsx, which self-fetches everything else. Stamping the
//    full CircleDetailContext here would mean paying for the Feed tab's per-viewer reads (health,
//    Insight access, the Crew hat, the page-text override) to learn a circle id this page already
//    has from the shell. So this file calls the widget with `circle.id` and skips the holder.
//
// 2. THE EFFORT BOARD, moved here whole from the Practice tab. Its rules, its formula and every
//    "why" live in lib/quest/effort.ts; this file is what a member sees. Four things it does
//    differently from /crew/leaderboard, each on purpose:
//
//     a. IT LEADS WITH THE SHARED TOTAL. CollectiveGoal is the headline; the list of people is
//        secondary and sits below it. That ordering is the research (Festinger 1954, JMIR 2021), and
//        it is the ordering the crew board already chose.
//     b. NO SCOPE SWITCHER. A Circle board IS the local scope. Offering Hub and Global here would
//        let a member zoom out to the exact comparison the literature says demotivates them.
//     c. IT REFUSES TO RENDER A LADDER OF THREE. Under MIN_BOARD_CONTRIBUTORS people showing up in
//        the same week, there is no list: the shared bar stands alone with a straight answer about
//        why. Production's largest circle holds two members and five posts, so this is the COMMON
//        path.
//     d. NO POSITIONS, AND THE ORDER IS ALPHABETICAL. Nobody is told where they placed, because
//        there is no placing: two rows' numbers have different denominators and are not comparable.
//
// WHO SEES THE ROWS. Members and the circle's managers, unchanged from where the board used to
// live. A visitor gets the circle-level bar (the same kind of aggregate a capacity line already
// shows) and nothing about individuals.

type Track = Extract<LeaderboardTrack, 'effort' | 'consistency'>


export const metadata = { title: 'Circle Stats' }

function parseTrack(v: string | undefined): Track {
  return v === 'consistency' ? 'consistency' : 'effort'
}


export default async function CircleStatsPage({
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

  const [{ track: trackParam }, myProfileId, caps, season] = await Promise.all([
    searchParams,
    getMyProfileId(),
    circleCapabilities(circle.id),
    getCurrentSeason(),
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
    <FqCircleStatsPane
      circleId={circle.id}
      slug={circle.slug}
      total={total}
      contributors={contributors}
      seasonName={season?.name ?? null}
      canSeeRows={canSeeRows}
      optedOut={optedOut}
      track={track}
      memberIds={memberIds}
      viewerId={myProfileId}
    />
  )
}


