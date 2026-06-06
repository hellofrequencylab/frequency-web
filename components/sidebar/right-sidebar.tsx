import { createAdminClient } from '@/lib/supabase/admin'
import { SEASON_RANKS, rankForZaps } from '@/lib/season-ranks'
import { GameStatsDockClient, GameStatsPanel, type DockData } from '@/components/sidebar/game-stats-dock'
import { getPracticesToLogToday, getRecentPracticeLogs, getMemberPractices } from '@/lib/practices'
import { getActiveJourneyProgress } from '@/lib/journey-plans'
import { DemoNotice } from '@/components/sidebar/demo-notice'

export type CommunityRole = 'member' | 'crew' | 'host' | 'guide' | 'mentor' | 'admin' | 'janitor'

interface RightSidebarProps {
  profileId: string
  role: CommunityRole
}

// ── Game stats dock ───────────────────────────────────────────────────────────
// The right rail is now a UNIFORM, widget-free strip site-wide (IA §10.6): just the
// player's progress cockpit. The list widgets (Dispatches/Events/Members/Leaderboard)
// were removed — that content lives in its own destination on the left menu (Around
// You · Events · People · Quest). Tapping the dock opens today's move, streak, rank
// progress, an arc, and the Vault. Best-effort — any source failing degrades to a
// teaser rather than breaking the rail.

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

// ── Right sidebar — the uniform, widget-free stats rail ───────────────────────

export default async function RightSidebar({ profileId }: RightSidebarProps) {
  return (
    <div className="flex flex-1 flex-col">
      <div className="flex-1 px-3 py-6">
        <DemoNotice />
      </div>
      <GameStatsDock profileId={profileId} />
    </div>
  )
}
