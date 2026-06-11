import { Suspense } from 'react'
import Link from 'next/link'
import { Plus, Sparkles } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { getPracticeMetrics } from '@/lib/analytics/practice'
import { getDensitySignal } from '@/lib/analytics/density'
import { getEngagementRead } from '@/lib/analytics/engagement-read'
import { getEngagementDashboard } from '@/lib/analytics/dashboard'
import { requireAdminFloor } from '@/lib/admin/guard'
import { aiEnabled } from '@/lib/ai'
import { AdminPage, AdminSection } from '@/components/admin/admin-page'
import { RingGauge, TrendArea, WeekBars, weeklyBuckets, cumulative } from '@/components/admin/spark-charts'
import { DashArea, GraphTile, StatRow, StatItem, SeverityChip } from '@/components/admin/dash'
import { StatusBadge } from '@/components/groups/status-badge'
import { EmptyState } from '@/components/ui/empty-state'
import { MemberManager, type MemberItem } from './member-manager'
import { ADMIN_GROUPS, groupLinks, type DomainKey } from './sections'
import { OPEN_STATUSES } from '@/lib/support/types'
import { isJanitor } from '@/lib/core/roles'
import type { CommunityRole, WebRole } from '@/lib/core/roles'
import type { StaffRole } from '@/lib/core/staff-roles'
import type { SeasonRank } from '@/lib/season-ranks'

// Admin home (owner brief — comprehensive exec dashboard): the page is a BIRDS-EYE
// view of the whole platform, organized by the four primary areas (Programs,
// Community, Growth, Operations — the same IA as the nav). Vera's read leads as the
// exec summary; then ONE rich section per area, each a mix of an instructional blurb,
// Quick Links into that area's surfaces, its key stats, and its graphs. The sections
// are printed ON THE CANVAS (no cards); only the graph tiles carry a white background.
// Every metric lives under the area it belongs to, so nothing is orphaned and the
// whole platform reads at a glance. Drill-downs go to each area's own dashboard.

const WEEK = 7 * 24 * 60 * 60 * 1000
const GROWTH_WEEKS = 12
const VOLUME_WEEKS = 8

// The viewer's effective roles — threaded to each area so its Quick Links show only
// the surfaces the viewer may actually open (the admin IA gates each link).
type Nav = { role: CommunityRole; webRole: WebRole; staffRole: StaffRole | null }

/** An area's role-visible Quick Links, shaped for <DashArea>. */
function quickLinks(key: DomainKey, nav: Nav) {
  return groupLinks(key, nav.role, nav.webRole, nav.staffRole).map((l) => ({
    href: l.href,
    label: l.label,
    Icon: l.Icon,
  }))
}

/** The catalog entry for a primary area (label, blurb, glyph, dashboard href). */
function area(key: DomainKey) {
  return ADMIN_GROUPS.find((g) => g.key === key)!
}

export default async function AdminPageView() {
  const { profileId, role, webRole, staffRole } = await requireAdminFloor()
  const staffJanitor = isJanitor(webRole) // STAFF axis (ADR-208), not the community ladder
  const nav: Nav = { role, webRole, staffRole }
  const admin = createAdminClient()

  const now = new Date()
  const growthStart = new Date(now.getTime() - GROWTH_WEEKS * WEEK).toISOString()
  const volumeStart = new Date(now.getTime() - VOLUME_WEEKS * WEEK).toISOString()
  const weekAhead = new Date(now.getTime() + WEEK).toISOString()

  // One CHEAP parallel sweep: counts + the time series the charts need. The
  // heavier practice read renders behind Suspense so the shell never blocks
  // (PAGE-FRAMEWORK §5.3, mirroring the Growth dashboard). The all-time member
  // base is folded in here instead of a sequential second round-trip.
  const [
    membersCount,
    circlesCount,
    dispatchesCount,
    joinsRes,
    practiceRows,
    eventRows,
    upcomingCount,
    totalProfilesRes,
  ] = await Promise.all([
    // "Members" = real (non-system) person profiles — the canonical community size
    // (see lib/analytics/members.ts), consistent with Pulse + the rail + activation.
    admin.from('profiles').select('id', { count: 'exact', head: true }).eq('is_system', false),
    admin.from('circles').select('id', { count: 'exact', head: true }),
    admin.from('dispatches').select('id', { count: 'exact', head: true }),
    // Member joins inside the growth window (the chart) + the all-time base before it.
    admin.from('profiles').select('created_at').gte('created_at', growthStart).eq('is_system', false),
    admin
      .from('engagement_events')
      .select('created_at')
      .eq('event_type', 'practice.verified')
      .gte('created_at', volumeStart),
    admin.from('events').select('starts_at').gte('starts_at', volumeStart).lte('starts_at', weekAhead),
    admin
      .from('events')
      .select('id', { count: 'exact', head: true })
      .gte('starts_at', now.toISOString())
      .lte('starts_at', weekAhead),
    admin.from('profiles').select('id', { count: 'exact', head: true }).eq('is_system', false),
  ])

  // Growth series: cumulative members across the window (base = total before it).
  const totalProfiles = totalProfilesRes.count ?? 0
  const joinDates = (joinsRes.data ?? []).map((r) => new Date(r.created_at as string))
  const weeklyJoins = weeklyBuckets(joinDates, GROWTH_WEEKS, now)
  const joinedInWindow = weeklyJoins.reduce((a, b) => a + b, 0)
  const growthSeries = cumulative(totalProfiles - joinedInWindow, weeklyJoins)
  const joinedThisMonth = weeklyJoins.slice(-4).reduce((a, b) => a + b, 0)

  // Weekly volume series.
  const practiceSeries = weeklyBuckets(
    (practiceRows.data ?? []).map((r) => new Date(r.created_at as string)),
    VOLUME_WEEKS,
    now,
  )
  const eventSeries = weeklyBuckets(
    (eventRows.data ?? []).map((r) => new Date(r.starts_at as string)),
    VOLUME_WEEKS,
    now,
  )

  const description = staffJanitor
    ? 'Full platform access. Every surface below.'
    : `Scoped to your ${role} level.`

  return (
    <AdminPage
      title="Admin Dashboard"
      eyebrow="Overview"
      description={description}
      width="wide"
      // The header owns the four live numbers (F-pattern: most important, top
      // right of the title). No box — the stats sit ON the canvas, big and faded,
      // with a light lower highlight so they read engraved (debossed) into the
      // background. Bottom-aligned with the subtitle's last line (actionsAlign),
      // with a breathing margin off the right edge.
      actionsAlign="end"
      // Active + Practices need the heavier practice read, so the whole strip sits
      // behind its own Suspense; Members + Events come from the cheap sweep above
      // and show immediately (the two practice numbers fade in).
      actions={
        <Suspense
          fallback={<HeaderKpis members={membersCount.count ?? 0} events={upcomingCount.count ?? 0} />}
        >
          <HeaderKpisLive members={membersCount.count ?? 0} events={upcomingCount.count ?? 0} />
        </Suspense>
      }
    >
      {staffJanitor && (
        <>
          {/* Exec summary — Vera's narrative read of the live signal, on the canvas. */}
          <Suspense fallback={<DashSkeleton title="Vera's read" />}>
            <VeraReadSection />
          </Suspense>

          {/* One comprehensive section per primary area. Each folds in its own
              instructional blurb + Quick Links + stats + graphs. */}
          <Suspense fallback={<DashSkeleton title="Programs" />}>
            <ProgramsArea nav={nav} practiceSeries={practiceSeries} />
          </Suspense>
          <Suspense fallback={<DashSkeleton title="Community" />}>
            <CommunityArea
              nav={nav}
              membersCount={membersCount.count ?? 0}
              circlesCount={circlesCount.count ?? 0}
              broadcasts={dispatchesCount.count ?? 0}
              upcomingEvents={upcomingCount.count ?? 0}
              growthSeries={growthSeries}
              eventSeries={eventSeries}
              joinedThisMonth={joinedThisMonth}
            />
          </Suspense>
          <Suspense fallback={<DashSkeleton title="Growth" />}>
            <GrowthArea nav={nav} />
          </Suspense>
          <Suspense fallback={<DashSkeleton title="Operations" />}>
            <OperationsArea nav={nav} />
          </Suspense>
        </>
      )}
      {role === 'host' && <HostPanel profileId={profileId} />}
      {role === 'guide' && <GuidePanel profileId={profileId} />}
      {role === 'mentor' && <MentorPanel profileId={profileId} />}
    </AdminPage>
  )
}

// The four engraved header numbers. Members + Events come from the cheap sweep;
// Active + Practices need the practice read, so they default to a placeholder and
// the live variant fills them in once it resolves.
function HeaderKpis({
  members,
  events,
  active = '…',
  practices = '…',
}: {
  members: number
  events: number
  active?: React.ReactNode
  practices?: React.ReactNode
}) {
  const items = [
    { label: 'Members', value: members.toLocaleString() },
    { label: 'Active', value: active },
    { label: 'Practices', value: practices },
    { label: 'Events', value: events },
  ]
  return (
    <div className="flex gap-7 pr-2 sm:gap-9 sm:pr-8">
      {items.map((k) => (
        <div key={k.label}>
          <p className="whitespace-nowrap text-2xs font-semibold uppercase tracking-wider text-subtle">
            {k.label}
          </p>
          <p className="mt-1 text-3xl font-extrabold leading-none tabular-nums text-muted/80 [text-shadow:0_1px_0_var(--color-surface)]">
            {k.value}
          </p>
        </div>
      ))}
    </div>
  )
}

async function HeaderKpisLive({ members, events }: { members: number; events: number }) {
  const practice = await getPracticeMetrics()
  return (
    <HeaderKpis members={members} events={events} active={practice.wam} practices={practice.verifiedThisWeek} />
  )
}

// A white tile holding a centered metric ring (activation, answered-rate). The ring
// is the graph; the tile is the only white surface in the area grammar.
function RingTile({ pct, label, sub }: { pct: number; label: string; sub?: string }) {
  return (
    <div className="flex items-center rounded-2xl border border-border bg-surface p-4">
      <RingGauge pct={pct} label={label} sub={sub} />
    </div>
  )
}

// A ranked value→count list (top pages / features) for a white graph tile.
function RankList({ items }: { items: { value: string; n: number }[] }) {
  if (items.length === 0) return <p className="text-xs text-subtle">No signal yet this week.</p>
  return (
    <ul className="space-y-1">
      {items.map((i) => (
        <li key={i.value} className="flex items-baseline justify-between gap-3 text-sm">
          <span className="truncate text-muted">{i.value}</span>
          <span className="shrink-0 font-semibold tabular-nums text-text">{i.n.toLocaleString()}</span>
        </li>
      ))}
    </ul>
  )
}

// ── Programs — the game: content, seasons, rewards, the crews that run them. ───
async function ProgramsArea({ nav, practiceSeries }: { nav: Nav; practiceSeries: number[] }) {
  const admin = createAdminClient()
  const [practicesC, journeysC, challengesC, storeC, practice] = await Promise.all([
    admin.from('practices').select('id', { count: 'exact', head: true }),
    admin.from('journey_plans').select('id', { count: 'exact', head: true }).eq('visibility', 'public'),
    admin.from('season_challenges').select('id', { count: 'exact', head: true }),
    admin.from('store_items').select('id', { count: 'exact', head: true }),
    getPracticeMetrics(),
  ])
  const g = area('programs')
  const windowTotal = practiceSeries.reduce((a, b) => a + b, 0)
  return (
    <DashArea
      icon={g.Icon}
      label={g.label}
      blurb={g.blurb}
      href={g.href}
      hrefLabel={`Open ${g.label}`}
      links={quickLinks('programs', nav)}
    >
      <StatRow>
        <StatItem value={(practicesC.count ?? 0).toLocaleString()} label="Practices" href="/admin/content/practices" />
        <StatItem value={(journeysC.count ?? 0).toLocaleString()} label="Journeys" href="/admin/content/journeys" />
        <StatItem value={(challengesC.count ?? 0).toLocaleString()} label="Challenges" href="/admin/content/challenges" />
        <StatItem value={practice.verifiedThisWeek} label="Verified / wk" href="/admin/content/practices" />
        <StatItem value={(storeC.count ?? 0).toLocaleString()} label="Store items" href="/admin/store" />
      </StatRow>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <GraphTile
          label="Verified practices / wk"
          value={windowTotal}
          caption={`${VOLUME_WEEKS} weeks · current highlighted`}
        >
          <WeekBars values={practiceSeries} height={56} />
        </GraphTile>
      </div>
    </DashArea>
  )
}

// ── Community — the people and their spaces: circles, members, events, T&S. ────
async function CommunityArea({
  nav,
  membersCount,
  circlesCount,
  broadcasts,
  upcomingEvents,
  growthSeries,
  eventSeries,
  joinedThisMonth,
}: {
  nav: Nav
  membersCount: number
  circlesCount: number
  broadcasts: number
  upcomingEvents: number
  growthSeries: number[]
  eventSeries: number[]
  joinedThisMonth: number
}) {
  const admin = createAdminClient()
  const [hubsC, nexusesC, openReports, openTickets] = await Promise.all([
    admin.from('hubs').select('id', { count: 'exact', head: true }),
    admin.from('nexuses').select('id', { count: 'exact', head: true }),
    admin.from('reports').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    admin.from('support_tickets').select('id', { count: 'exact', head: true }).in('status', OPEN_STATUSES),
  ])
  const g = area('community')
  const reports = openReports.count ?? 0
  const tickets = openTickets.count ?? 0
  return (
    <DashArea
      icon={g.Icon}
      label={g.label}
      blurb={g.blurb}
      href={g.href}
      hrefLabel={`Open ${g.label}`}
      links={quickLinks('community', nav)}
    >
      <StatRow>
        <StatItem value={membersCount.toLocaleString()} label="Members" href="/admin/members" />
        <StatItem value={circlesCount.toLocaleString()} label="Circles" href="/admin/circles" />
        <StatItem value={(hubsC.count ?? 0).toLocaleString()} label="Hubs" href="/admin/hubs" />
        <StatItem value={(nexusesC.count ?? 0).toLocaleString()} label="Nexuses" href="/admin/nexuses" />
        <StatItem value={upcomingEvents.toLocaleString()} label="Events ahead" href="/admin/events" />
        <StatItem value={broadcasts.toLocaleString()} label="Broadcasts" href="/admin/dispatches" />
        <StatItem
          value={reports.toLocaleString()}
          label="Open reports"
          deltaTone={reports > 0 ? 'bad' : 'neutral'}
          href="/admin/moderation"
        />
        <StatItem
          value={tickets.toLocaleString()}
          label="Open tickets"
          deltaTone={tickets > 0 ? 'bad' : 'neutral'}
          href="/admin/support"
        />
      </StatRow>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <GraphTile
          label="Member growth"
          value={membersCount.toLocaleString()}
          caption={`${GROWTH_WEEKS} weeks${joinedThisMonth > 0 ? ` · +${joinedThisMonth} this month` : ''}`}
        >
          <TrendArea points={growthSeries} height={56} />
        </GraphTile>
        <GraphTile
          label="Events / wk"
          value={upcomingEvents}
          caption={`${VOLUME_WEEKS} weeks · includes week ahead`}
        >
          <WeekBars values={eventSeries} height={56} />
        </GraphTile>
      </div>
    </DashArea>
  )
}

// ── Growth — funnels, onboarding, pipeline, traffic, and the expansion signal. ─
async function GrowthArea({ nav }: { nav: Nav }) {
  const admin = createAdminClient()
  const [practice, density, dash, crmC] = await Promise.all([
    getPracticeMetrics(),
    getDensitySignal(),
    getEngagementDashboard(7),
    admin.from('crm_deals').select('id', { count: 'exact', head: true }),
  ])
  const views = dash.byType.find((t) => t.eventType === 'nav.page_view')
  const features = dash.byType.find((t) => t.eventType === 'feature.used')
  const topSignal = density.ready[0] ?? density.places[0]
  const g = area('growth')
  return (
    <DashArea
      icon={g.Icon}
      label={g.label}
      blurb={g.blurb}
      href={g.href}
      hrefLabel={`Open ${g.label}`}
      links={quickLinks('growth', nav)}
    >
      <StatRow>
        <StatItem value={`${Math.round(practice.activationRate * 100)}%`} label="Activation" href="/admin/engagement" />
        <StatItem value={(views?.events ?? 0).toLocaleString()} label="Page views · 7d" href="/admin/engagement" />
        <StatItem value={(views?.actors ?? 0).toLocaleString()} label="Active visitors" href="/admin/engagement" />
        <StatItem value={(features?.events ?? 0).toLocaleString()} label="Feature uses" href="/admin/engagement" />
        <StatItem
          value={density.ready.length}
          label="Labs ready"
          deltaTone={density.ready.length > 0 ? 'good' : 'neutral'}
          delta={density.ready.length > 0 ? 'over threshold' : undefined}
          href="/admin/expansion"
        />
        <StatItem value={(crmC.count ?? 0).toLocaleString()} label="CRM deals" href="/admin/crm" />
      </StatRow>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <RingTile
          pct={practice.activationRate}
          label="Activation"
          sub={`${practice.activated} of ${practice.newMembers} new activated`}
        />
        <GraphTile label="Top pages" caption="last 7 days">
          <RankList items={dash.topPages.slice(0, 5)} />
        </GraphTile>
        <GraphTile label="Top features" caption="last 7 days">
          <RankList items={dash.topFeatures.slice(0, 5)} />
        </GraphTile>
      </div>
      {topSignal && (
        <p className="text-sm text-muted">
          Strongest expansion signal: <span className="font-semibold text-text">{topSignal.city}</span> · readiness{' '}
          {Math.round(topSignal.score)}/100 ({topSignal.stage})
        </p>
      )}
    </DashArea>
  )
}

// ── Operations — the platform machine: AI, Vera, support, the system trail. ────
async function OperationsArea({ nav }: { nav: Nav }) {
  const admin = createAdminClient()
  const weekAgo = new Date(new Date().getTime() - 7 * DAY).toISOString()
  const [queries7d, answered7d, deflected7d, pendingActions, auditC] = await Promise.all([
    admin.from('ai_help_queries').select('id', { count: 'exact', head: true }).gte('created_at', weekAgo),
    admin.from('ai_help_queries').select('id', { count: 'exact', head: true }).gte('created_at', weekAgo).eq('answered', true),
    admin.from('ai_help_queries').select('id', { count: 'exact', head: true }).gte('created_at', weekAgo).eq('deflected', true),
    admin.from('agent_actions').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    admin.from('admin_audit_log').select('id', { count: 'exact', head: true }).gte('created_at', weekAgo),
  ])
  const ai = aiEnabled()
  const total = queries7d.count ?? 0
  const answered = answered7d.count ?? 0
  const deflected = deflected7d.count ?? 0
  const answeredRate = total > 0 ? Math.round((answered / total) * 100) : null
  const g = area('operations')
  return (
    <DashArea
      icon={g.Icon}
      label={g.label}
      blurb={g.blurb}
      href={g.href}
      hrefLabel={`Open ${g.label}`}
      links={quickLinks('operations', nav)}
    >
      <StatRow>
        <StatItem
          value={ai ? 'On' : 'Off'}
          label="AI"
          deltaTone={ai ? 'good' : 'bad'}
          href="/admin/ai"
        />
        <StatItem value={total.toLocaleString()} label="Vera questions · 7d" href="/admin/vera" />
        <StatItem value={answeredRate === null ? '—' : `${answeredRate}%`} label="Answered" href="/admin/vera" />
        <StatItem
          value={deflected.toLocaleString()}
          label="Help gaps"
          delta={deflected > 0 ? 'articles to write' : undefined}
          deltaTone={deflected > 0 ? 'bad' : 'neutral'}
          href="/admin/help-gaps"
        />
        <StatItem value={(pendingActions.count ?? 0).toLocaleString()} label="Studio prompts" href="/admin/studio" />
        <StatItem value={(auditC.count ?? 0).toLocaleString()} label="Audit events · 7d" href="/admin/audit" />
      </StatRow>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <RingTile
          pct={answeredRate === null ? 0 : answeredRate / 100}
          label="Vera answered"
          sub={`${answered} of ${total} questions this week`}
        />
      </div>
    </DashArea>
  )
}

const DAY = 24 * 60 * 60 * 1000

// Suspense fallback — an on-canvas area skeleton matching the DashArea grammar:
// a title, an instructional line, a quick-link row, then a graph placeholder.
function DashSkeleton({ title }: { title: string }) {
  return (
    <section className="border-t border-border/70 pt-7 first:border-t-0 first:pt-0 sm:pt-8">
      <h2 className="text-lg font-bold text-text">{title}</h2>
      <div className="mt-2 h-4 w-2/3 animate-pulse rounded bg-surface-elevated" />
      <div className="mt-3.5 flex gap-2">
        <div className="h-7 w-24 animate-pulse rounded-full bg-surface-elevated" />
        <div className="h-7 w-20 animate-pulse rounded-full bg-surface-elevated" />
        <div className="h-7 w-24 animate-pulse rounded-full bg-surface-elevated" />
      </div>
      <div className="mt-5 h-24 animate-pulse rounded-2xl bg-surface-elevated/70" />
    </section>
  )
}

// ── Vera's read — the exec summary: Vera's narrative read of the live signal. ──
// Printed on the canvas (DashArea), leading the dashboard. The supporting counts it
// used to carry now live under the areas they belong to (Operations, Community).
async function VeraReadSection() {
  const read = await getEngagementRead()
  const top = read.insights.slice(0, 3)
  return (
    <DashArea
      icon={Sparkles}
      label="Vera's read"
      blurb="Vera reads the live engagement signal and suggests the next move."
      href="/admin/insights"
      hrefLabel="Full read"
    >
      <p className="text-sm font-medium text-text">{read.summary}</p>
      {top.length > 0 && (
        <ul className="space-y-2.5">
          {top.map((i) => (
            <li key={i.id} className="flex items-start gap-2.5">
              <SeverityChip severity={i.severity} />
              <div className="min-w-0 text-sm leading-snug">
                <span className="font-semibold text-text">{i.title}.</span>{' '}
                <span className="text-muted">{i.finding}</span>{' '}
                <span className="text-text">→ {i.recommendation}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </DashArea>
  )
}

// A circle row used in the operational panels below.
function CircleRow({
  href,
  name,
  status,
  meta,
}: {
  href: string
  name: string
  status: string
  meta: string
}) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between rounded-2xl bg-surface-elevated/60 px-4 py-3 transition-colors hover:bg-surface-elevated"
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium text-text">{name}</span>
          <StatusBadge status={status} />
        </div>
        <p className="mt-0.5 text-xs text-subtle">{meta}</p>
      </div>
      <span className="text-xs text-subtle">→</span>
    </Link>
  )
}

// The shared EmptyState's call-to-action: a primary link button. Kept local so
// the kit primitive stays presentation-only (it takes any ReactNode `action`).
function EmptyCta({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-on-primary transition-colors hover:bg-primary-hover"
    >
      <Plus className="h-3.5 w-3.5" />
      {label}
    </Link>
  )
}

// Shared membership → MemberItem mapping (identical across the role panels).
type MembershipRow = {
  id: string
  joined_at: string
  profile: {
    id: string
    display_name: string
    handle: string
    avatar_url: string | null
    community_role: string
    current_season_rank: string | null
    current_season_zaps: number
    season_challenges_complete: boolean
    is_crew_lead: boolean | null
  }
  circle: { name: string } | null
}

function toMemberItems(rows: MembershipRow[]): MemberItem[] {
  return rows.map((m) => ({
    membershipId: m.id,
    profileId: m.profile.id,
    displayName: m.profile.display_name,
    handle: m.profile.handle,
    avatarUrl: m.profile.avatar_url,
    role: m.profile.community_role as CommunityRole,
    circleName: m.circle?.name ?? undefined,
    joinedAt: m.joined_at,
    isCrewLead: m.profile.is_crew_lead ?? false,
    currentSeasonRank: (m.profile.current_season_rank ?? undefined) as SeasonRank | undefined,
    currentSeasonZaps: m.profile.current_season_zaps ?? 0,
    seasonChallengesComplete: m.profile.season_challenges_complete ?? false,
  }))
}

const MEMBERSHIP_SELECT = `id, joined_at,
   profile:profiles!profile_id ( id, display_name, handle, avatar_url, community_role, current_season_rank, current_season_zaps, season_challenges_complete, is_crew_lead ),
   circle:circles!circle_id ( name )`

// ── Host: circle + member overview ───────────────────────────────────────────

async function HostPanel({ profileId }: { profileId: string }) {
  const admin = createAdminClient()

  const { data: circles } = await admin
    .from('circles')
    .select(`id, name, slug, status, type, member_count, member_cap, hub:hubs!hub_id ( name, slug )`)
    .eq('host_id', profileId)
    .order('name')

  const circleIds = (circles ?? []).map((c) => c.id)
  const { data: rawMembers } = await admin
    .from('memberships')
    .select(MEMBERSHIP_SELECT)
    .in('circle_id', circleIds.length > 0 ? circleIds : ['__none__'])
    .eq('status', 'active')
    .order('joined_at', { ascending: true })

  const members = toMemberItems((rawMembers ?? []) as unknown as MembershipRow[])
  const hostCircles = (circles ?? []) as unknown as Array<{
    id: string; name: string; slug: string; status: string; member_count: number; member_cap: number; hub: { name: string; slug: string } | null
  }>

  return (
    <div className="grid gap-8 lg:grid-cols-2">
      <AdminSection title={`Your circles · ${hostCircles.length}`}>
        {hostCircles.length === 0 ? (
          <EmptyState title="No circles yet." action={<EmptyCta href="/admin/circles" label="Create a circle" />} />
        ) : (
          <div className="space-y-2">
            {hostCircles.map((c) => (
              <CircleRow
                key={c.id}
                href={`/circles/${c.slug}`}
                name={c.name}
                status={c.status}
                meta={`${c.member_count} / ${c.member_cap}${c.hub?.name ? ` · ${c.hub.name}` : ''}`}
              />
            ))}
          </div>
        )}
      </AdminSection>

      <AdminSection title={`Members · ${members.length}`}>
        {members.length === 0 ? (
          <EmptyState title="No members yet. Share your circle link to get started." />
        ) : (
          <MemberManager members={members} />
        )}
      </AdminSection>
    </div>
  )
}

// ── Guide: hub + member overview ─────────────────────────────────────────────

async function GuidePanel({ profileId }: { profileId: string }) {
  const admin = createAdminClient()

  const { data: hubs } = await admin
    .from('hubs')
    .select(
      `id, name, slug, status,
       nexus:nexuses!nexus_id ( name, slug ),
       circles ( id, name, slug, status, member_count, member_cap, type,
                 host:profiles!host_id ( display_name, handle ) )`
    )
    .eq('guide_id', profileId)
    .order('name')

  type GuideCircle = { id: string; name: string; slug: string; status: string; member_count: number; member_cap: number; type: string; host: { display_name: string; handle: string } | null }
  type GuideHub = { id: string; name: string; slug: string; status: string; nexus: { name: string; slug: string } | null; circles: GuideCircle[] }
  const typedHubs = (hubs ?? []) as unknown as GuideHub[]

  const allCircleIds = typedHubs.flatMap((h) => h.circles.map((c) => c.id))

  const { data: rawMembers } = await admin
    .from('memberships')
    .select(MEMBERSHIP_SELECT)
    .in('circle_id', allCircleIds.length > 0 ? allCircleIds : ['__none__'])
    .eq('status', 'active')
    .order('joined_at', { ascending: true })

  const members = toMemberItems((rawMembers ?? []) as unknown as MembershipRow[])

  return (
    <>
      <div className="grid gap-8 lg:grid-cols-2">
        {typedHubs.map((hub) => (
          <AdminSection
            key={hub.id}
            title={hub.name}
            actions={
              hub.nexus && (
                <Link href={`/nexuses/${hub.nexus.slug}`} className="text-xs text-primary-strong hover:underline">
                  {hub.nexus.name} →
                </Link>
              )
            }
          >
            {hub.circles.length === 0 ? (
              <EmptyState title="No circles in this hub yet." action={<EmptyCta href="/admin/circles" label="Add a circle" />} />
            ) : (
              <div className="space-y-2">
                {hub.circles.map((c) => (
                  <CircleRow
                    key={c.id}
                    href={`/circles/${c.slug}`}
                    name={c.name}
                    status={c.status}
                    meta={`${c.member_count} / ${c.member_cap}${c.host ? ` · Host: ${c.host.display_name}` : ''}`}
                  />
                ))}
              </div>
            )}
          </AdminSection>
        ))}
      </div>

      {typedHubs.length === 0 && (
        <EmptyState title="No hubs assigned yet." action={<EmptyCta href="/admin/hubs" label="Set up a hub" />} />
      )}

      {members.length > 0 && (
        <AdminSection title={`All members · ${members.length}`}>
          <MemberManager members={members} />
        </AdminSection>
      )}
    </>
  )
}

// ── Mentor: nexus overview + full member management ──────────────────────────

async function MentorPanel({ profileId }: { profileId: string }) {
  const admin = createAdminClient()

  const { data: nexuses } = await admin
    .from('nexuses')
    .select(
      `id, name, slug, status, member_cap,
       outpost:outposts!outpost_id ( name ),
       hubs (
         id, name, slug, status,
         guide:profiles!guide_id ( display_name, handle ),
         circles ( id, member_count )
       )`
    )
    .eq('mentor_id', profileId)
    .order('name')

  type MentorCircle = { id: string; member_count: number }
  type MentorHub = { id: string; name: string; slug: string; status: string; guide: { display_name: string; handle: string } | null; circles: MentorCircle[] }
  type MentorNexus = { id: string; name: string; slug: string; status: string; member_cap: number; outpost: { name: string } | null; hubs: MentorHub[] }
  const typedNexuses = (nexuses ?? []) as unknown as MentorNexus[]

  const allCircleIds: string[] = []
  for (const nexus of typedNexuses) {
    for (const hub of nexus.hubs ?? []) {
      for (const circle of hub.circles ?? []) allCircleIds.push(circle.id)
    }
  }

  const { data: rawMembers } = await admin
    .from('memberships')
    .select(MEMBERSHIP_SELECT)
    .in('circle_id', allCircleIds.length > 0 ? allCircleIds : ['__none__'])
    .eq('status', 'active')
    .order('joined_at', { ascending: true })

  const members = toMemberItems((rawMembers ?? []) as unknown as MembershipRow[])

  return (
    <>
      <div className="grid gap-8 lg:grid-cols-2">
        {typedNexuses.map((nexus) => {
          const nexusTotal = nexus.hubs.reduce((sum, h) => sum + h.circles.reduce((s, c) => s + (c.member_count ?? 0), 0), 0)
          return (
            <AdminSection
              key={nexus.id}
              title={nexus.name}
              description={`${nexus.outpost?.name ?? ''} · ${nexusTotal} / ${nexus.member_cap} members`}
            >
              <div className="space-y-2">
                {nexus.hubs.map((hub) => {
                  const hubTotal = hub.circles.reduce((s, c) => s + (c.member_count ?? 0), 0)
                  return (
                    <CircleRow
                      key={hub.id}
                      href={`/hubs/${hub.slug}`}
                      name={hub.name}
                      status={hub.status}
                      meta={`${hub.circles.length} circles · ${hubTotal} members${hub.guide ? ` · Guide: ${hub.guide.display_name}` : ''}`}
                    />
                  )
                })}
              </div>
            </AdminSection>
          )
        })}
      </div>

      {typedNexuses.length === 0 && (
        <EmptyState title="No nexuses assigned yet." action={<EmptyCta href="/admin/nexuses" label="Create a nexus" />} />
      )}

      {members.length > 0 && (
        <AdminSection title={`All members · ${members.length}`}>
          <MemberManager members={members} />
        </AdminSection>
      )}
    </>
  )
}
