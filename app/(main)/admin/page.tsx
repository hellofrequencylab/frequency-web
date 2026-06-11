import { Suspense } from 'react'
import Link from 'next/link'
import { Plus } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { getPracticeMetrics } from '@/lib/analytics/practice'
import { getDensitySignal } from '@/lib/analytics/density'
import { getEngagementRead } from '@/lib/analytics/engagement-read'
import { getEngagementDashboard } from '@/lib/analytics/dashboard'
import { requireAdminFloor } from '@/lib/admin/guard'
import { AdminPage, AdminSection } from '@/components/admin/admin-page'
import { RingGauge, TrendArea, WeekBars, weeklyBuckets, cumulative } from '@/components/admin/spark-charts'
import { DashSection, StatRow, StatItem, SeverityChip } from '@/components/admin/dash'
import { StatusBadge } from '@/components/groups/status-badge'
import { EmptyState } from '@/components/ui/empty-state'
import { MemberManager, type MemberItem } from './member-manager'
import { OPEN_STATUSES } from '@/lib/support/types'
import { isJanitor } from '@/lib/core/roles'
import type { CommunityRole } from '@/lib/core/roles'
import type { SeasonRank } from '@/lib/season-ranks'

// Admin home (ADR-228 redesign): the TOP is a real dashboard — site optics at a
// glance (growth trend, weekly practice + event volume, activation ring) on a
// WIDE multi-column grid that uses the full workspace, instead of the old narrow
// single-column stack. The janitor roster/circle dumps are condensed to compact
// side-by-side panels that LINK to their real management surfaces
// (/admin/members, /admin/circles) — the home is for orientation, not scrolling.

const WEEK = 7 * 24 * 60 * 60 * 1000
const GROWTH_WEEKS = 12
const VOLUME_WEEKS = 8

export default async function AdminPageView() {
  const { profileId, role, webRole } = await requireAdminFloor()
  const staffJanitor = isJanitor(webRole) // STAFF axis (ADR-208), not the community ladder
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
      {/* ── Pulse: ONE compact card — trend, weekly volume, activation. The
          practice read renders behind Suspense; the cheap series are passed in. ── */}
      <Suspense fallback={<DashSkeleton title="Pulse" />}>
        <PulseSection
          totalProfiles={totalProfiles}
          joinedThisMonth={joinedThisMonth}
          growthSeries={growthSeries}
          practiceSeries={practiceSeries}
          eventSeries={eventSeries}
          upcomingEvents={upcomingCount.count ?? 0}
        />
      </Suspense>

      {staffJanitor && (
        <>
          <Suspense fallback={<DashSkeleton title="Vera's read" />}>
            <VeraReadSection />
          </Suspense>
          <Suspense fallback={<DashSkeleton title="Site traffic" />}>
            <SiteTrafficSection />
          </Suspense>
          <Suspense fallback={<DashSkeleton title="Expansion signal" />}>
            <ExpansionSection />
          </Suspense>
          <JanitorPanel circlesCount={circlesCount.count ?? 0} broadcasts={dispatchesCount.count ?? 0} />
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

// The Pulse card — practice read resolved here so the page shell never waits on it.
// Cheap series (cumulative growth, weekly volume) are computed up top and passed in.
async function PulseSection({
  totalProfiles,
  joinedThisMonth,
  growthSeries,
  practiceSeries,
  eventSeries,
  upcomingEvents,
}: {
  totalProfiles: number
  joinedThisMonth: number
  growthSeries: number[]
  practiceSeries: number[]
  eventSeries: number[]
  upcomingEvents: number
}) {
  const practice = await getPracticeMetrics()
  return (
    <DashSection
      title="Pulse"
      description="Member growth and weekly activity at a glance."
      href="/admin/engagement"
      hrefLabel="Engagement"
    >
      <div className="grid gap-x-8 gap-y-5 sm:grid-cols-2 lg:grid-cols-4">
        <PulseBlock
          label="Member growth"
          value={totalProfiles.toLocaleString()}
          delta={joinedThisMonth > 0 ? `+${joinedThisMonth} this month` : undefined}
          caption={`${GROWTH_WEEKS} weeks`}
        >
          <TrendArea points={growthSeries} height={44} />
        </PulseBlock>
        <PulseBlock
          label="Verified practices / wk"
          value={practice.verifiedThisWeek}
          caption={`${VOLUME_WEEKS} weeks · current highlighted`}
        >
          <WeekBars values={practiceSeries} height={44} />
        </PulseBlock>
        <PulseBlock
          label="Events / wk"
          value={upcomingEvents}
          caption={`${VOLUME_WEEKS} weeks · includes week ahead`}
        >
          <WeekBars values={eventSeries} height={44} />
        </PulseBlock>
        <div className="flex items-center">
          <RingGauge
            pct={practice.activationRate}
            label="Activation"
            sub={`${practice.activated} of ${practice.newMembers} new members activated`}
          />
        </div>
      </div>
    </DashSection>
  )
}

const DAY = 24 * 60 * 60 * 1000

// One plot inside the Pulse card — label, headline value, compact plot, caption.
// No inner border: the SECTION is the card; blocks inside divide by whitespace.
function PulseBlock({
  label,
  value,
  delta,
  caption,
  children,
}: {
  label: string
  value: React.ReactNode
  delta?: string
  caption?: string
  children: React.ReactNode
}) {
  return (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-2xl font-extrabold leading-none tabular-nums text-text">{value}</p>
        {delta && <p className="text-2xs font-semibold text-success">{delta}</p>}
      </div>
      <p className="mt-1 text-xs font-medium text-muted">{label}</p>
      <div className="mt-2 h-11">{children}</div>
      {caption && <p className="mt-1 text-2xs text-subtle">{caption}</p>}
    </div>
  )
}

// Suspense fallback — a white section card with pulsing content.
function DashSkeleton({ title }: { title: string }) {
  return (
    <DashSection title={title}>
      <div className="space-y-2.5">
        <div className="h-4 w-2/3 animate-pulse rounded bg-surface-elevated" />
        <div className="h-4 w-1/2 animate-pulse rounded bg-surface-elevated" />
        <div className="h-10 animate-pulse rounded-xl bg-surface-elevated/70" />
      </div>
    </DashSection>
  )
}

// ── Vera's read — advice from the live site signal + the support queue. ───────
async function VeraReadSection() {
  const admin = createAdminClient()
  const weekAgo = new Date(new Date().getTime() - 7 * DAY).toISOString()

  const [read, queries7d, deflected7d, answered7d, openTickets, openReports, pendingActions] =
    await Promise.all([
      getEngagementRead(),
      admin.from('ai_help_queries').select('id', { count: 'exact', head: true }).gte('created_at', weekAgo),
      admin.from('ai_help_queries').select('id', { count: 'exact', head: true }).gte('created_at', weekAgo).eq('deflected', true),
      admin.from('ai_help_queries').select('id', { count: 'exact', head: true }).gte('created_at', weekAgo).eq('answered', true),
      admin.from('support_tickets').select('id', { count: 'exact', head: true }).in('status', OPEN_STATUSES),
      admin.from('reports').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      admin.from('agent_actions').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    ])

  const total = queries7d.count ?? 0
  const answeredRate = total > 0 ? Math.round(((answered7d.count ?? 0) / total) * 100) : null
  const top = read.insights.slice(0, 3)

  return (
    <DashSection
      title="Vera's read"
      description="Vera reads the live engagement signal and suggests the next move."
      href="/admin/insights"
      hrefLabel="Full read"
    >
      <p className="text-sm font-medium text-text">{read.summary}</p>

      {top.length > 0 && (
        <ul className="mt-3 space-y-2.5">
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

      <div className="mt-5 border-t border-border/60 pt-4">
        <StatRow>
          <StatItem value={total} label="Vera questions" href="/admin/vera" />
          <StatItem value={answeredRate === null ? '—' : `${answeredRate}%`} label="Answered" href="/admin/vera" />
          <StatItem
            value={deflected7d.count ?? 0}
            label="Help gaps"
            delta={(deflected7d.count ?? 0) > 0 ? 'articles to write' : undefined}
            deltaTone={(deflected7d.count ?? 0) > 0 ? 'bad' : 'neutral'}
            href="/admin/help-gaps"
          />
          <StatItem
            value={openTickets.count ?? 0}
            label="Open tickets"
            deltaTone={(openTickets.count ?? 0) > 0 ? 'bad' : 'neutral'}
            href="/admin/support"
          />
          <StatItem
            value={openReports.count ?? 0}
            label="Open reports"
            deltaTone={(openReports.count ?? 0) > 0 ? 'bad' : 'neutral'}
            href="/admin/moderation"
          />
          <StatItem value={pendingActions.count ?? 0} label="Studio prompts" href="/admin/studio" />
        </StatRow>
      </div>
    </DashSection>
  )
}

// ── Site traffic — FIRST-PARTY analytics off the event backbone (7 days). ─────
// (Live Google Analytics needs the GA4 Data API + a service account — not
// configured; the event backbone already records views/features first-party.)
async function SiteTrafficSection() {
  const dash = await getEngagementDashboard(7)
  const views = dash.byType.find((t) => t.eventType === 'nav.page_view')
  const features = dash.byType.find((t) => t.eventType === 'feature.used')

  return (
    <DashSection
      title="Site traffic"
      description="First-party analytics from the event backbone — views, visitors, and the features being used (last 7 days)."
      href="/admin/engagement"
      hrefLabel="Engagement"
    >
      <StatRow>
        <StatItem value={(views?.events ?? 0).toLocaleString()} label="Page views" />
        <StatItem value={views?.actors ?? 0} label="Active visitors" />
        <StatItem value={(features?.events ?? 0).toLocaleString()} label="Feature uses" />
      </StatRow>

      <div className="mt-5 grid gap-x-8 gap-y-4 border-t border-border/60 pt-4 sm:grid-cols-2">
        <TopList title="Top pages" items={dash.topPages.slice(0, 5)} />
        <TopList title="Top features" items={dash.topFeatures.slice(0, 5)} />
      </div>
    </DashSection>
  )
}

function TopList({ title, items }: { title: string; items: { value: string; n: number }[] }) {
  return (
    <div className="min-w-0">
      <p className="mb-1.5 text-xs font-semibold text-text">{title}</p>
      {items.length === 0 ? (
        <p className="text-xs text-subtle">No signal yet this week.</p>
      ) : (
        <ul className="space-y-1">
          {items.map((i) => (
            <li key={i.value} className="flex items-baseline justify-between gap-3 text-sm">
              <span className="truncate text-muted">{i.value}</span>
              <span className="shrink-0 font-semibold tabular-nums text-text">{i.n.toLocaleString()}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ── Expansion signal — density readiness for the next Lab (janitor). ──────────
async function ExpansionSection() {
  const density = await getDensitySignal()
  const top = density.ready[0] ?? density.places[0]

  return (
    <DashSection
      title="Expansion signal"
      description="Where member density is crossing the threshold that justifies opening the next Lab."
      href="/admin/expansion"
      hrefLabel="Expansion"
    >
      <StatRow>
        <StatItem value={density.totals.cities} label="Cities tracked" />
        <StatItem
          value={density.ready.length}
          label="Labs ready"
          deltaTone={density.ready.length > 0 ? 'good' : 'neutral'}
          delta={density.ready.length > 0 ? 'over threshold' : undefined}
        />
        <StatItem value={density.totals.listings.toLocaleString()} label="Listings" />
        <StatItem value={density.totals.residents.toLocaleString()} label="Residents" />
      </StatRow>
      {top && (
        <p className="mt-4 border-t border-border/60 pt-3 text-sm text-muted">
          Strongest signal: <span className="font-semibold text-text">{top.city}</span> · readiness{' '}
          {Math.round(top.score)}/100 ({top.stage})
        </p>
      )}
    </DashSection>
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

// ── Janitor: condensed platform panels — the home ORIENTS; the full lists live
//    on their management surfaces (/admin/circles, /admin/members). ─────────────

async function JanitorPanel({ circlesCount, broadcasts }: { circlesCount: number; broadcasts: number }) {
  const admin = createAdminClient()

  const [circlesRes, hubsRes, nexusesRes] = await Promise.all([
    // Fullest circles first — where capacity pressure is.
    admin
      .from('circles')
      .select('id, name, slug, status, member_count, member_cap, hub:hubs!hub_id(name)')
      .order('member_count', { ascending: false })
      .limit(6),
    admin.from('hubs').select('id', { count: 'exact', head: true }),
    admin.from('nexuses').select('id', { count: 'exact', head: true }),
  ])

  const circles = (circlesRes.data ?? []) as unknown as Array<{
    id: string; name: string; slug: string; status: string; member_count: number; member_cap: number; hub: { name: string } | null
  }>

  return (
    <>
      <DashSection
        title="Network"
        description="The structure of the community — regions, hubs, circles, and the broadcasts that reach them."
        href="/admin/operations"
        hrefLabel="Operations"
      >
        <StatRow>
          <StatItem value={nexusesRes.count ?? 0} label="Nexuses" href="/admin/nexuses" />
          <StatItem value={hubsRes.count ?? 0} label="Hubs" href="/admin/hubs" />
          <StatItem value={circlesCount} label="Circles" href="/admin/circles" />
          <StatItem value={broadcasts} label="Broadcasts" href="/admin/dispatches" />
        </StatRow>
      </DashSection>

      {/* Circles by fill — newest joins live in the right Info rail ("Just joined"),
          so the page does not repeat them. */}
      <DashSection
        title="Circles by fill"
        description="Fullest first — where capacity pressure is building."
        href="/admin/circles"
        hrefLabel="View all"
      >
        <div className="grid gap-2 lg:grid-cols-2">
          {circles.map((c) => (
            <CircleRow
              key={c.id}
              href={`/circles/${c.slug}`}
              name={c.name}
              status={c.status}
              meta={`${c.member_count} / ${c.member_cap}${c.hub?.name ? ` · ${c.hub.name}` : ''}`}
            />
          ))}
        </div>
      </DashSection>
    </>
  )
}

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
