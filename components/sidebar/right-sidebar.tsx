import { Suspense } from 'react'
import { headers } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'
import { SEASON_RANKS, rankForCompletion, journeysFinishedThisSeason } from '@/lib/season-ranks'
import { GameStatsDockClient, GameStatsPanel, type DockData } from '@/components/sidebar/game-stats-dock'
import { getPracticesToLogToday, getRecentPracticeLogs, getMemberPractices } from '@/lib/practices'
import { getMemberJourneyProgress } from '@/lib/journeys/progress'
import { DemoNotice } from '@/components/sidebar/demo-notice'
import { pageRailPanels, isQuestSurface } from '@/lib/layout/rail-panels'
import { ControlCenterPanel, PanelSkeleton } from '@/components/sidebar/rail-panels'
import { RAIL_PANELS } from '@/components/sidebar/rail-registry'
import { getMemberSignature } from '@/lib/frequency-signature-data'
import { FrequencySignature } from '@/components/profile/frequency-signature'
import { getMemberActivity } from '@/lib/practice-activity'
import { ActivityChart } from '@/components/widgets/practices/activity-chart'
import { ReportButton } from '@/components/support/report-button'
import { InviteFriendButton } from '@/components/sidebar/invite-friend-button'
import { ensureMemberCodes } from '@/lib/qr/member-codes'
import { renderStyledQrSvg } from '@/lib/qr/render-styled'
import { parseStyle } from '@/lib/qr/style'
import { shortLinkUrl } from '@/lib/qr/links'

export type CommunityRole = 'member' | 'crew' | 'host' | 'guide' | 'mentor' | 'admin' | 'janitor'

// Invite a friend — the member's PERSONAL connect code framed as an invite (a scan/open drops their referral
// cookie, and they earn Zaps when the friend joins + gets started). Its own async server component behind a
// <Suspense> so provisioning the code + rendering the branded QR never blocks the rest of the rail. Renders
// nothing if the member has no handle or the code can't be provisioned (fail-safe, never an error).
async function InvitePanel({ profileId }: { profileId: string }) {
  // Build the invite data defensively (code provisioning touches the DB); any failure degrades to no
  // panel, never an error in the rail. JSX render stays OUTSIDE the try/catch (a render error belongs to
  // an error boundary, not this catch — react-hooks/error-boundaries).
  let data: { svg: string; link: string; codeId: string } | null = null
  try {
    const { data: p } = await createAdminClient().from('profiles').select('handle').eq('id', profileId).maybeSingle()
    const handle = (p as { handle: string | null } | null)?.handle
    if (handle) {
      const connect = (await ensureMemberCodes(profileId, handle))[0]
      if (connect) {
        const link = shortLinkUrl(connect.slug)
        data = { svg: renderStyledQrSvg(link, parseStyle(connect.style), 320), link, codeId: connect.id }
      }
    }
  } catch {
    data = null
  }
  if (!data) return null
  return <InviteFriendButton svg={data.svg} link={data.link} codeId={data.codeId} />
}

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
// The rail is page-aware via the `x-pathname` request header (set in proxy.ts —
// Next 16's middleware), which keeps the panels server-rendered while varying by route.

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

  // All sources fetch in ONE parallel batch (no serial waterfall): the profile row, today's
  // logs, adopted practices, recent logs, the season completion count (drives rank), AND the
  // enrolled-Journey progress (the dock's "current track"). journeysFinishedThisSeason keeps its
  // prior behaviour (uncaught → propagates, same as before); getMemberJourneyProgress degrades to
  // an empty list so its arc line just hides (matching the old try/catch).
  const [{ data: profile }, practicesToLog, memberPractices, recentLogs, finishedCount, progress] = await Promise.all([
    admin.from('profiles')
      .select('current_season_zaps, lifetime_gems, current_streak')
      .eq('id', profileId).maybeSingle(),
    getPracticesToLogToday(profileId).catch(() => []),
    getMemberPractices(profileId).catch(() => []),
    getRecentPracticeLogs(profileId, 30).catch(() => []),
    journeysFinishedThisSeason(profileId),
    getMemberJourneyProgress(profileId).catch(() => []),
  ])

  const p = profile as { current_season_zaps?: number; lifetime_gems?: number; current_streak?: number } | null
  const zaps = p?.current_season_zaps ?? 0
  const gems = p?.lifetime_gems ?? 0
  const streak = p?.current_streak ?? 0
  // Derive rank from Journey completions (completion-based model).
  const rank = rankForCompletion(finishedCount)

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

  // Rank progress to next tier (completion-based)
  const idx = SEASON_RANKS.findIndex((r) => r.rank === rank)
  const curIdx = idx < 0 ? 0 : idx
  const next = SEASON_RANKS[curIdx + 1]
  const curMin = SEASON_RANKS[curIdx]?.minJourneys ?? 0
  const rankProgress = next
    ? {
        nextLabel: next.label,
        toGo: Math.max(0, next.minJourneys - finishedCount),
        pct: next.minJourneys > curMin ? Math.round(((finishedCount - curMin) / (next.minJourneys - curMin)) * 100) : 0,
      }
    : { nextLabel: null, toGo: 0, pct: 100 }

  // The member's enrolled Journey → the dock's "current track" line (v2; ADR-253). Shows the
  // active enrolled Journey, % complete, and the next lesson. Hidden when there's no enrollment
  // (no empty/broken widget). Best-effort.
  let arc: DockData['arc'] = null
  const top = progress[0]
  if (top) {
    arc = {
      chain: top.title,
      step: top.nextLesson?.title ?? 'On track',
      pct: top.percent,
    }
  }

  return { zaps, gems, streak, rank, todaysMove, last7, rankProgress, arc, vaultGems: gems }
}

// The viewer's practice activity — the Insight-Timer-style bar chart (Days / Weeks / Months),
// pinned right under the Season Standing block on every rail. Renders nothing until there's
// something to show.
async function ActivityPanel({ profileId }: { profileId: string }) {
  const activity = await getMemberActivity(profileId)
  if (!activity.hasAny) return null
  return (
    <section>
      <div className="mb-2 px-1">
        <h3 className="text-sm font-bold tracking-tight text-text">Your activity</h3>
      </div>
      <ActivityChart activity={activity} />
    </section>
  )
}

// The viewer's Frequency Signature — their practice spread across the four Pillars as the
// circular Mind/Body/Spirit/Expression dial. A site-wide standing panel: it rides under the
// page panels on every rail so a member always has their evolving identity in view.
async function SignaturePanel({ profileId }: { profileId: string }) {
  const signature = await getMemberSignature(profileId)
  return (
    <section>
      <div className="mb-2 px-1">
        <h3 className="text-sm font-bold tracking-tight text-text">Your Frequency Signature</h3>
      </div>
      <FrequencySignature signature={signature} variant="full" layout="stack" />
    </section>
  )
}

// Render the page panels for the current route (each its own Suspense boundary).
async function PagePanels({ profileId, role, pathname }: RightSidebarProps & { pathname: string }) {
  const keys = pageRailPanels(pathname)
  const isCrew = ['crew', 'host', 'guide', 'mentor', 'admin', 'janitor'].includes(role)

  // Prefetch the viewer's active circles once iff any selected panel declares it needs
  // them (the registry owns that fact, so the rail never re-lists panel keys here).
  const needsCircles = keys.some((key) => RAIL_PANELS[key]?.needsCircles)
  let circleIds: string[] = []
  if (needsCircles) {
    const { data } = await createAdminClient()
      .from('memberships')
      .select('circle_id')
      .eq('profile_id', profileId)
      .eq('status', 'active')
    circleIds = (data ?? []).map((m: { circle_id: string }) => m.circle_id as string)
  }

  const ctx = { profileId, circleIds, isCrew }
  return (
    <>
      {keys.map((key) => {
        const def = RAIL_PANELS[key]
        if (!def || (def.gate && !def.gate(ctx))) return null
        return (
          <Suspense key={key} fallback={<PanelSkeleton />}>
            {def.render(ctx)}
          </Suspense>
        )
      })}
    </>
  )
}

// ── Right sidebar — standing panels (site-wide) + page panels (contextual) ─────
export default async function RightSidebar({ profileId, role }: RightSidebarProps) {
  const pathname = (await headers()).get('x-pathname') ?? ''
  // On The Quest surfaces (the /crew tree) the PAGE already owns the member's standing —
  // the hub's StandingHero/SeasonMap + the Journey pages — so the rail SUPPRESSES its two
  // standing panels here (the "Your Quest" cockpit + the bottom GameStatsDock) to avoid
  // showing the same zaps/gems/streak/rank twice or thrice in one viewport (UI audit). The
  // route decision lives in the rail resolver (isQuestSurface); the rail just reads the flag.
  // Off-Quest (feed, channels, …) the page shows no standing, so the rail keeps it.
  const onQuest = isQuestSurface(pathname)
  // No duplicate functions: a rail panel never shows on the page that already features that
  // function. The Your Quest box is the only always-on panel; the rest are contextual.
  const showActivity = pathname !== '/practices'
  const showSignature = !pathname.startsWith('/people/')
  return (
    <div className="flex flex-1 flex-col">
      <div className="flex-1 space-y-4 pt-1 pb-6">
        {/* Report a bug / get help — pinned to the very TOP of the right rail. The shared
            support sheet (same `open-support` event as the account menu + footer). */}
        <ReportButton
          variant="ghost"
          className="w-full justify-start border border-border bg-surface hover:bg-surface-elevated"
        />
        {/* Invite a friend — right under Report a bug. A small warm CTA that opens the member's invite
            link + branded QR (earn Zaps when a friend joins). Its own Suspense so provisioning the code
            never blocks the rail. */}
        <Suspense fallback={null}>
          <InvitePanel profileId={profileId} />
        </Suspense>
        {/* Site-wide demo notice — pinned ABOVE the Quest box when demo content is
            present (it self-hides otherwise). */}
        <DemoNotice />
        {/* Quest control center: rank/standing + (when live) the next onboarding step. The ONE
            always-on rail box. Hidden on Quest surfaces, where the page already owns this standing. */}
        {!onQuest && (
          <Suspense fallback={<PanelSkeleton />}>
            <ControlCenterPanel profileId={profileId} />
          </Suspense>
        )}
        {/* Your activity — under Season Standing, except on /practices which already shows it. */}
        {showActivity && (
          <Suspense fallback={<PanelSkeleton />}>
            <ActivityPanel profileId={profileId} />
          </Suspense>
        )}
        {/* Page panels — stats specific to this route. */}
        <Suspense fallback={<PanelSkeleton />}>
          <PagePanels profileId={profileId} role={role} pathname={pathname} />
        </Suspense>
        {/* The viewer's Frequency Signature — except on profile pages, which already show it. */}
        {showSignature && (
          <Suspense fallback={<PanelSkeleton />}>
            <SignaturePanel profileId={profileId} />
          </Suspense>
        )}
      </div>
      {/* Standing panel — the player's progress cockpit, pinned to the bottom.
          Hidden on Quest surfaces (the page owns standing there). Its own Suspense
          so its multi-hop stats load never blocks the rest of the rail (PAGE-FRAMEWORK §5). */}
      {!onQuest && (
        <Suspense fallback={<PanelSkeleton />}>
          <GameStatsDock profileId={profileId} />
        </Suspense>
      )}
    </div>
  )
}
