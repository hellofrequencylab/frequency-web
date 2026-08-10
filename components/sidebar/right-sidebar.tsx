import { Suspense, cache } from 'react'
import { headers } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'
import { SEASON_RANKS, rankForCompletion, journeysFinishedThisSeason } from '@/lib/season-ranks'
import { GameStatsPanel, GameStatsDockClient, type DockData } from '@/components/sidebar/game-stats-dock'
import { getPracticesToLogToday, getRecentPracticeLogs, getMemberPractices } from '@/lib/practices'
import { getMemberJourneyProgress } from '@/lib/journeys/progress'
import { getSpendableBalance } from '@/lib/store/balance'
import { resolveMemberDay } from '@/lib/member-day'
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
//     the player's progress cockpit (GameStatsDock — now the floating Vault dock,
//     fixed bottom right per the three-docks law).
//   • PAGE panels — stats specific to the page being viewed, resolved from the route
//     via lib/layout/rail-panels.ts. Each is its own async server component behind a
//     <Suspense> so a slow one never blocks the rest (PAGE-FRAMEWORK §5).
// The rail is page-aware via the `x-pathname` request header (set in proxy.ts —
// Next 16's middleware), which keeps the panels server-rendered while varying by route.

// Mobile counterpart — the same stats body (with a zaps/gems/streak summary header) for the
// mobile LEFT drawer's bottom cluster (AppShell's `mobileStats` slot): the < lg home of the
// game counts, since the Vault dock renders only beside the desktop rail. Streamed via Suspense.
export async function MobileGameStats({ profileId }: { profileId: string }) {
  return <GameStatsPanel data={await loadGameStats(profileId)} showSummary />
}

// Assemble the player's "progress cockpit" — best-effort; any one source failing
// degrades to an empty/teaser state. Shared by the desktop dock + the mobile menu.
//
// 🔴 `cache()` IS LOAD-BEARING, not an optimisation. Two callers await this on EVERY member page
// and neither is conditional: MobileGameStats (the drawer's Vault, mounted from the layout) and
// VaultDockSlot (the desktop dock, same layout). "The score renders once per viewport" is a CSS
// statement — `md:hidden` on one and `hidden md:flex` on the other — and CSS does not stop a
// server component from running. Both rendered, so both fetched, and each call is a six-way
// Promise.all: twelve queries for one score, on every page load, at every viewport.
//
// React's `cache()` dedupes per REQUEST, which is exactly the scope of the double-render. Do not
// replace it with a module-level map: that would leak one member's score to the next request.
export const loadGameStats = cache(async function loadGameStats(profileId: string): Promise<DockData> {
  const admin = createAdminClient()

  // All sources fetch in ONE parallel batch (no serial waterfall): the profile row, today's
  // logs, adopted practices, recent logs, the season completion count (drives rank), AND the
  // enrolled-Journey progress (the dock's "current track"). journeysFinishedThisSeason keeps its
  // prior behaviour (uncaught → propagates, same as before); getMemberJourneyProgress degrades to
  // an empty list so its arc line just hides (matching the old try/catch).
  const [
    { data: profile },
    practicesToLog,
    memberPractices,
    recentLogs,
    finishedCount,
    progress,
    spendable,
    memberToday,
  ] = await Promise.all([
    admin.from('profiles')
      .select('current_season_zaps, lifetime_gems, current_streak')
      .eq('id', profileId).maybeSingle(),
    getPracticesToLogToday(profileId).catch(() => []),
    getMemberPractices(profileId).catch(() => []),
    getRecentPracticeLogs(profileId, 30).catch(() => []),
    journeysFinishedThisSeason(profileId),
    getMemberJourneyProgress(profileId).catch(() => []),
    // The dock's "gems to spend" counter used `lifetime_gems`, which is DOCUMENTED monotonic
    // (lib/store/balance.ts) — it is the total ever earned and never falls after a redemption
    // or a gift. The rail was the only surface still reading it that way: /crew/store and the
    // Gift Gems dialog both go through getSpendableBalance, so the rail disagreed with the
    // page its own card links to. Degrades to null so the counter falls back rather than
    // blanking the whole dock if the balance read fails.
    getSpendableBalance(admin, profileId).catch(() => null),
    // The 7-day strip is keyed on `logged_for`, which logPractice writes in the MEMBER's day
    // (lib/member-day.ts), so building the window from the server's day put a Pacific member's
    // "today" dot out from ~16:00 local and shifted the whole window by one.
    resolveMemberDay(profileId).catch(() => null),
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

  // Last 7 days streak strip, in the MEMBER's day — the same key `logged_for` is written with.
  //
  // The previous version built the window with server-local `setDate`/`getDate` and read it back
  // with UTC `toISOString()`, so it was only self-consistent when the server ran UTC, and it was
  // never consistent with the logs: a Pacific member's log for "today" is keyed to a date the
  // server has already passed by ~16:00 local, so their own dot went dark and the whole window
  // sat one day off. Stepping back from the resolved YYYY-MM-DD with UTC arithmetic is safe
  // because the anchor is already a calendar date, not an instant.
  const loggedDays = new Set(recentLogs.map((r) => r.logged_for))
  const anchor = memberToday ?? new Date().toISOString().slice(0, 10)
  const anchorMs = Date.parse(`${anchor}T00:00:00Z`)
  const last7 = Array.from({ length: 7 }, (_, i) => {
    const day = new Date(anchorMs - (6 - i) * 86_400_000).toISOString().slice(0, 10)
    return loggedDays.has(day)
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

  // `gems` stays lifetime (the head counter is "total earned"); vaultGems is what is SPENDABLE.
  return { zaps, gems, streak, rank, todaysMove, last7, rankProgress, arc, vaultGems: spendable ?? gems }
})

// The viewer's practice activity — the Insight-Timer-style bar chart (Days / Weeks / Months),
// pinned right under the Season Standing block on every rail. Renders nothing until there's
// something to show.
// Your Quest — the member's score as a PERSISTENT rail panel, not a floating chip. The
// bottom-right pill was tried and rolled back (owner call, 2026-08-04): a score you have to
// click to see is a score you stop reading, and the pill competed with the chat launcher for
// the same corner. The rail is where standing belongs, so it sits inline with the other
// panels and scrolls with them. Suppressed on Quest surfaces, where the page already owns
// the same numbers. In admin mode the settings drawer slides over this whole column, so the
// rail becomes the operator's settings without this panel having to know about it.
// The bottom-right dock slot. The score lives in the TAB now (three-docks law, owner ruling
// 2026-08-04), not as a rail panel -- so this returns the dock rather than a <section>, and the
// rail no longer carries the numbers at all. Quest surfaces still suppress it: that page owns
// the same figures, and the rule is once per viewport, not once per column.
export async function VaultDockSlot({ profileId }: { profileId: string }) {
  const pathname = (await headers()).get('x-pathname') ?? ''
  if (isQuestSurface(pathname)) return null
  return <GameStatsDockClient data={await loadGameStats(profileId)} />
}

async function ActivityPanel({ profileId }: { profileId: string }) {
  const activity = await getMemberActivity(profileId)
  if (!activity.hasAny) return null
  return (
    <section>
      <div className="mb-2 px-1">
        <h3 className="text-body-sm font-bold tracking-tight text-text">Your activity</h3>
      </div>
      <ActivityChart activity={activity} framed={false} />
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
        <h3 className="text-body-sm font-bold tracking-tight text-text">Your Frequency Signature</h3>
      </div>
      <FrequencySignature signature={signature} variant="full" layout="stack" framed={false} />
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
  // function — and no duplicate NUMBERS: the game counts (zaps · gems · streak · rank) live in
  // the Vault dock alone, so the rail's Your Quest box is nudges-only and self-hides when
  // there is no next step. The rest of the panels are contextual.
  const showActivity = pathname !== '/practices'
  const showSignature = !pathname.startsWith('/people/')
  return (
    <div className="flex flex-1 flex-col">
      {/* space-y-6, not -4: the panels are borderless titled GROUPS now (group, don't box), so
          whitespace is doing the separating work the nine hairline boxes used to do. At the old
          gap they ran together into one column of rows. */}
      <div className="flex-1 space-y-6 pt-1 pb-6">
        {/* Report a bug / get help — pinned to the very TOP of the right rail. The shared
            support sheet (same `open-support` event as the account menu + footer). */}
        {/* CORRECTED 2026-08-05. This used to read "Invite is the rail's ONE deliberate tinted
            object", and that reasoning is now inverted: the tint was on the wrong object. DAWN
            gives Invite a NEUTRAL card and reserves the amber fill for the standing block, which
            this product moved into the Vault dock — so neither of these two rows is the tinted
            one, and both take the same bordered utility-row treatment (right-rail.jsx:38-44 and
            :154). Report keeps its ghost variant, which now carries that treatment itself. */}
        <ReportButton
          variant="ghost"
          className="w-full justify-start hover:bg-surface-elevated"
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
        {/* Quest control center: the next onboarding/setup step ONLY (when live). The game
            numbers moved to the Vault dock (three-docks law — nothing is offered twice), so
            this renders nothing when there is no step. Hidden on Quest surfaces, where the
            page already owns the member's standing. */}
        {/* fallback null, not a skeleton: the panel usually renders nothing now (Next Steps
            ship off), and a skeleton that resolves to nothing reads as a broken load. */}
        {!onQuest && (
          <Suspense fallback={null}>
            <ControlCenterPanel profileId={profileId} />
          </Suspense>
        )}
        {/* The score is NOT here. It is the bottom-right Vault tab (VaultDockSlot above,
            threaded by (main)/layout.tsx), so collapsing or scrolling the rail can never take
            the member's numbers away with it. */}
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
    </div>
  )
}
