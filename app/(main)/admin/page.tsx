import Link from 'next/link'
import { Users, Layers, Building2, Plus, Zap, Activity } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { getPracticeMetrics } from '@/lib/analytics/practice'
import { requireAdminFloor } from '@/lib/admin/guard'
import { AdminPage, AdminSection } from '@/components/admin/admin-page'
import { StatCard } from '@/components/ui/stat-card'
import { ChartCard, RingGauge, TrendArea, WeekBars, weeklyBuckets, cumulative } from '@/components/admin/spark-charts'
import { AdminCreateMenu } from './create-menu'
import { StatusBadge } from '@/components/groups/status-badge'
import { MemberManager, type MemberItem } from './member-manager'
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

  // One parallel sweep for the dashboard: counts + the time series the charts need.
  const [
    membersCount,
    circlesCount,
    dispatchesCount,
    joinsRes,
    practiceRows,
    eventRows,
    upcomingCount,
    practice,
  ] = await Promise.all([
    admin.from('memberships').select('id', { count: 'exact', head: true }).eq('status', 'active'),
    admin.from('circles').select('id', { count: 'exact', head: true }),
    admin.from('dispatches').select('id', { count: 'exact', head: true }),
    // Member joins inside the growth window (the chart) + the all-time base before it.
    admin.from('profiles').select('created_at').gte('created_at', growthStart),
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
    getPracticeMetrics(),
  ])

  // Growth series: cumulative members across the window (base = total before it).
  const { count: totalProfiles } = await admin
    .from('profiles')
    .select('id', { count: 'exact', head: true })
  const joinDates = (joinsRes.data ?? []).map((r) => new Date(r.created_at as string))
  const weeklyJoins = weeklyBuckets(joinDates, GROWTH_WEEKS, now)
  const joinedInWindow = weeklyJoins.reduce((a, b) => a + b, 0)
  const growthSeries = cumulative((totalProfiles ?? 0) - joinedInWindow, weeklyJoins)
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
      title="Admin home"
      eyebrow="Overview"
      description={description}
      width="wide"
      actions={<AdminCreateMenu role={role} />}
    >
      {/* ── The dashboard: site optics, best-practice order — the four live
            numbers first (a compact row, never stretched by the charts), then the
            trend + conversion, then the weekly pulses. ───────────────────────── */}
      <AdminSection title="This week">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatCard label="Members" value={(membersCount.count ?? 0).toLocaleString()} icon={Users} />
          <StatCard label="Weekly active" value={practice.wam} icon={Zap} />
          <StatCard label="Practices · 7d" value={practice.verifiedThisWeek} icon={Activity} />
          <StatCard label="Events · next 7d" value={upcomingCount.count ?? 0} icon={Layers} />
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-12">
          {/* Member growth — the trend that frames everything else. */}
          <div className="lg:col-span-8">
            <ChartCard
              title="Member growth"
              value={(totalProfiles ?? 0).toLocaleString()}
              delta={joinedThisMonth > 0 ? `+${joinedThisMonth} this month` : undefined}
              caption={`${GROWTH_WEEKS} weeks ago → now`}
            >
              <TrendArea points={growthSeries} />
            </ChartCard>
          </div>

          {/* Activation — the North-Star conversion. */}
          <div className="lg:col-span-4">
            <div className="flex h-full flex-col justify-center rounded-2xl border border-border bg-surface p-5">
              <RingGauge
                pct={practice.activationRate}
                label="Activation · 7d"
                sub={`${practice.activated} of ${practice.newMembers} new members logged a verified practice within a week`}
              />
            </div>
          </div>

          {/* Weekly volume — the two pulses, side by side. */}
          <div className="lg:col-span-6">
            <ChartCard
              title="Verified practices / week"
              caption={`${VOLUME_WEEKS} weeks · current week highlighted`}
            >
              <WeekBars values={practiceSeries} />
            </ChartCard>
          </div>
          <div className="lg:col-span-6">
            <ChartCard
              title="Events / week"
              caption={`${VOLUME_WEEKS} weeks by start date · includes the week ahead`}
            >
              <WeekBars values={eventSeries} />
            </ChartCard>
          </div>
        </div>
      </AdminSection>

      {staffJanitor && (
        <JanitorPanel circlesCount={circlesCount.count ?? 0} broadcasts={dispatchesCount.count ?? 0} />
      )}
      {role === 'host' && <HostPanel profileId={profileId} />}
      {role === 'guide' && <GuidePanel profileId={profileId} />}
      {role === 'mentor' && <MentorPanel profileId={profileId} />}
    </AdminPage>
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

function EmptyState({ message, cta }: { message: string; cta?: { href: string; label: string } }) {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-surface/50 p-8 text-center">
      <p className="text-sm text-muted">{message}</p>
      {cta && (
        <Link
          href={cta.href}
          className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-on-primary transition-colors hover:bg-primary-hover"
        >
          <Plus className="h-3.5 w-3.5" />
          {cta.label}
        </Link>
      )}
    </div>
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

const MEMBERSHIP_SELECT = `id, volunteer_role, joined_at,
   profile:profiles!profile_id ( id, display_name, handle, avatar_url, community_role, current_season_rank, current_season_zaps, season_challenges_complete, is_crew_lead ),
   circle:circles!circle_id ( name )`

// ── Janitor: condensed platform panels — the home ORIENTS; the full lists live
//    on their management surfaces (/admin/circles, /admin/members). ─────────────

async function JanitorPanel({ circlesCount, broadcasts }: { circlesCount: number; broadcasts: number }) {
  const admin = createAdminClient()

  const [circlesRes, hubsRes, nexusesRes, recentRes] = await Promise.all([
    // Fullest circles first — where capacity pressure is.
    admin
      .from('circles')
      .select('id, name, slug, status, member_count, member_cap, hub:hubs!hub_id(name)')
      .order('member_count', { ascending: false })
      .limit(6),
    admin.from('hubs').select('id', { count: 'exact', head: true }),
    admin.from('nexuses').select('id', { count: 'exact', head: true }),
    // Newest joins — who just arrived.
    admin
      .from('memberships')
      .select(MEMBERSHIP_SELECT)
      .eq('status', 'active')
      .order('joined_at', { ascending: false })
      .limit(8),
  ])

  const circles = (circlesRes.data ?? []) as unknown as Array<{
    id: string; name: string; slug: string; status: string; member_count: number; member_cap: number; hub: { name: string } | null
  }>
  const recent = (recentRes.data ?? []) as unknown as MembershipRow[]

  return (
    <>
      <AdminSection title="Platform totals">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatCard label="Nexuses" value={nexusesRes.count ?? 0} icon={Building2} />
          <StatCard label="Hubs" value={hubsRes.count ?? 0} icon={Building2} />
          <StatCard label="Circles" value={circlesCount} icon={Layers} />
          <StatCard label="Broadcasts" value={broadcasts} icon={Users} />
        </div>
      </AdminSection>

      {/* Side-by-side panels — circles by fill | newest members. */}
      <div className="grid gap-8 lg:grid-cols-2">
        <AdminSection
          title="Circles by fill"
          actions={
            <Link href="/admin/circles" className="text-xs font-semibold text-primary-strong hover:underline">
              View all →
            </Link>
          }
        >
          <div className="space-y-2">
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
        </AdminSection>

        <AdminSection
          title="Newest members"
          actions={
            <Link href="/admin/members" className="text-xs font-semibold text-primary-strong hover:underline">
              Full roster →
            </Link>
          }
        >
          <div className="space-y-2">
            {recent.map((m) => (
              <Link
                key={m.id}
                href={`/people/${m.profile.handle}`}
                className="flex items-center justify-between rounded-2xl bg-surface-elevated/60 px-4 py-3 transition-colors hover:bg-surface-elevated"
              >
                <div className="min-w-0">
                  <span className="block truncate text-sm font-medium text-text">{m.profile.display_name}</span>
                  <p className="mt-0.5 text-xs text-subtle">
                    @{m.profile.handle}
                    {m.circle?.name ? ` · ${m.circle.name}` : ''}
                  </p>
                </div>
                <span className="shrink-0 text-xs text-subtle">
                  {new Date(m.joined_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                </span>
              </Link>
            ))}
            {recent.length === 0 && <EmptyState message="No members yet." />}
          </div>
        </AdminSection>
      </div>
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
          <EmptyState message="No circles yet." cta={{ href: '/admin/circles', label: 'Create a circle' }} />
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
          <EmptyState message="No members yet. Share your circle link to get started." />
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
              <EmptyState message="No circles in this hub yet." cta={{ href: '/admin/circles', label: 'Add a circle' }} />
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
        <EmptyState message="No hubs assigned yet." cta={{ href: '/admin/hubs', label: 'Set up a hub' }} />
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
        <EmptyState message="No nexuses assigned yet." cta={{ href: '/admin/nexuses', label: 'Create a nexus' }} />
      )}

      {members.length > 0 && (
        <AdminSection title={`All members · ${members.length}`}>
          <MemberManager members={members} />
        </AdminSection>
      )}
    </>
  )
}
