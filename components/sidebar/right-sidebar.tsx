import { Suspense } from 'react'
import { headers } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'
import { SEASON_RANKS, rankForZaps } from '@/lib/season-ranks'
import { GameStatsDockClient, GameStatsPanel, type DockData } from '@/components/sidebar/game-stats-dock'
import { getPracticesToLogToday, getRecentPracticeLogs, getMemberPractices } from '@/lib/practices'
import { getActiveJourneyProgress } from '@/lib/journey-plans'
import { DemoNotice } from '@/components/sidebar/demo-notice'
import { pageRailPanels } from '@/lib/layout/rail-panels'
import {
  DispatchesPanel, EventsPanel, MembersPanel, LeaderboardPanel, PanelSkeleton,
} from '@/components/sidebar/rail-panels'

export type CommunityRole = 'member' | 'crew' | 'host' | 'guide' | 'mentor' | 'admin' | 'janitor'

interface RightSidebarProps {
  profileId: string
  role: CommunityRole
}

// ── The right rail (ADR-161) ──────────────────────────────────────────────────
// Two tiers of PANELS (no longer "widgets"):
//   • STANDING panels — site-wide standards shown on every page: the demo notice +
//     the player's progress cockpit (GameStatsDock, pinned to the bottom).
//   • PAGE panels — stats specific to the page being viewed, resolved from the route
//     via lib/layout/rail-panels.ts. Each is its own async server component behind a
//     <Suspense> so a slow one never blocks the rest (PAGE-FRAMEWORK §5).
// The rail is page-aware via the `x-pathname` request header (set in middleware.ts),
// which keeps the panels server-rendered while still varying by route.

async function GameStatsDock({ profileId }: { profileId: string }) {
  return <GameStatsDockClient data={await loadGameStats(profileId)} />
}

// Mobile counterpart — the same stats body (with a zaps/gems/streak summary header)
// for the right-side stats menu in the app shell, streamed via Suspense.
export async function MobileGameStats({ profileId }: { profileId: string }) {
  return <GameStatsPanel data={await loadGameStats(profileId)} showSummary />
}

// Assemble the player's "progress cockpit" — best-effort; any one source failing
// degrades to an empty/teaser state. Shared by the desktop dock + the mobile menu.
export async function loadGameStats(profileId: string): Promise<DockData> {
  const admin = createAdminClient()

  const [{ data: profile }, practicesToLog, memberPractices, recentLogs] = await Promise.all([
    admin.from('profiles')
      .select('current_season_zaps, lifetime_gems, current_streak')
      .eq('id', profileId).maybeSingle(),
    getPracticesToLogToday(profileId).catch(() => []),
    getMemberPractices(profileId).catch(() => []),
    getRecentPracticeLogs(profileId, 30).catch(() => []),
  ])

  const p = profile as { current_season_zaps?: number; lifetime_gems?: number; current_streak?: number } | null
  const zaps = p?.current_season_zaps ?? 0
  const gems = p?.lifetime_gems ?? 0
  const streak = p?.current_streak ?? 0
  // Derive rank from zaps (the stored current_season_rank can be stale).
  const rank = rankForZaps(zaps)

  // Today's move (North-Star daily action)
  const todaysMove: DockData['todaysMove'] =
    practicesToLog.length > 0
      ? { kind: 'log' }
      : memberPractices.length > 0
        ? { kind: 'done' }
        : { kind: 'adopt' }

  // Last 7 days streak strip
  const loggedDays = new Set(recentLogs.map((r) => r.logged_for))
  const today = new Date()
  const last7 = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today)
    d.setDate(d.getDate() - (6 - i))
    return loggedDays.has(d.toISOString().slice(0, 10))
  })

  // Rank progress to next tier
  const idx = SEASON_RANKS.findIndex((r) => r.rank === rank)
  const curIdx = idx < 0 ? 0 : idx
  const next = SEASON_RANKS[curIdx + 1]
  const curMin = SEASON_RANKS[curIdx]?.minZaps ?? 0
  const rankProgress = next
    ? {
        nextLabel: next.label,
        toGo: Math.max(0, next.minZaps - zaps),
        pct: next.minZaps > curMin ? Math.round(((zaps - curMin) / (next.minZaps - curMin)) * 100) : 0,
      }
    : { nextLabel: null, toGo: 0, pct: 100 }

  // The member's active Journey → the dock's "current track" line (ADR-152). Best-effort.
  let arc: DockData['arc'] = null
  try {
    const progress = await getActiveJourneyProgress(profileId)
    const top = progress[0]
    if (top) {
      arc = {
        chain: top.plan.title,
        step: top.nextItem?.practice?.title ?? 'On track this week',
        pct: top.percent,
      }
    }
  } catch {
    arc = null
  }

  return { zaps, gems, streak, rank, todaysMove, last7, rankProgress, arc, vaultGems: gems }
}

// Render the page panels for the current route (each its own Suspense boundary).
async function PagePanels({ profileId, role }: RightSidebarProps) {
  const pathname = (await headers()).get('x-pathname') ?? ''
  const keys = pageRailPanels(pathname)
  const isCrew = ['crew', 'host', 'guide', 'mentor', 'admin', 'janitor'].includes(role)

  // The members/events/broadcasts panels need the viewer's circles; fetch once, share.
  const needsCircles = keys.includes('events') || keys.includes('members') || keys.includes('dispatches')
  let circleIds: string[] = []
  if (needsCircles) {
    const { data } = await createAdminClient()
      .from('memberships')
      .select('circle_id')
      .eq('profile_id', profileId)
      .eq('status', 'active')
    circleIds = (data ?? []).map((m: { circle_id: string }) => m.circle_id as string)
  }

  return (
    <>
      {keys.map((key) => {
        const node =
          key === 'dispatches' ? <DispatchesPanel profileId={profileId} circleIds={circleIds} />
          : key === 'events' ? <EventsPanel circleIds={circleIds} />
          : key === 'members' ? <MembersPanel profileId={profileId} circleIds={circleIds} />
          : key === 'leaderboard' ? (isCrew ? <LeaderboardPanel /> : null)
          : null
        return node ? <Suspense key={key} fallback={<PanelSkeleton />}>{node}</Suspense> : null
      })}
    </>
  )
}

// ── Right sidebar — standing panels (site-wide) + page panels (contextual) ─────
export default async function RightSidebar({ profileId, role }: RightSidebarProps) {
  return (
    <div className="flex flex-1 flex-col">
      <div className="flex-1 space-y-8 px-3 py-6">
        {/* Standing panel — site-wide. */}
        <DemoNotice />
        {/* Page panels — stats specific to this route. */}
        <Suspense fallback={<PanelSkeleton />}>
          <PagePanels profileId={profileId} role={role} />
        </Suspense>
      </div>
      {/* Standing panel — the player's progress cockpit, pinned to the bottom. */}
      <GameStatsDock profileId={profileId} />
    </div>
  )
}
