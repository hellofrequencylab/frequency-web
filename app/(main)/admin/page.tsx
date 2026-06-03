import Link from 'next/link'
import { Users, Layers, Building2, Plus, CalendarDays, Megaphone, Zap, Activity, TrendingUp } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { getPracticeMetrics } from '@/lib/analytics/practice'
import { requireAdmin } from '@/lib/admin/guard'
import { AdminPage, AdminSection } from '@/components/admin/admin-page'
import { AdminLaunchpad } from '@/components/admin/admin-launchpad'
import { StatCard } from '@/components/ui/stat-card'
import { AdminCreateMenu } from './create-menu'
import { StatusBadge } from '@/components/groups/status-badge'
import { MemberManager, type MemberItem } from './member-manager'
import type { CommunityRole } from '@/lib/core/roles'
import type { SeasonRank } from '@/lib/season-ranks'

export default async function AdminPageView() {
  const { profileId, role } = await requireAdmin('host')
  const admin = createAdminClient()

  // Overview stat counts — a quick aggregate for all admin roles.
  const [membersCount, circlesCount, eventsCount, dispatchesCount] = await Promise.all([
    admin.from('memberships').select('id', { count: 'exact', head: true }).eq('status', 'active'),
    admin.from('circles').select('id', { count: 'exact', head: true }),
    admin.from('events').select('id', { count: 'exact', head: true }),
    admin.from('dispatches').select('id', { count: 'exact', head: true }),
  ])

  // North Star: verified-practice metrics off the event backbone.
  const practice = await getPracticeMetrics()

  const description =
    role === 'janitor'
      ? 'Full platform access — every surface below.'
      : `Scoped to your ${role} level.`

  return (
    <AdminPage
      title="Overview"
      eyebrow="Community"
      description={description}
      actions={<AdminCreateMenu role={role} />}
    >
      <AdminSection title="At a glance">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="Members" value={(membersCount.count ?? 0).toLocaleString()} icon={Users} />
          <StatCard label="Circles" value={(circlesCount.count ?? 0).toLocaleString()} icon={Layers} />
          <StatCard label="Events" value={(eventsCount.count ?? 0).toLocaleString()} icon={CalendarDays} />
          <StatCard label="Broadcasts" value={(dispatchesCount.count ?? 0).toLocaleString()} icon={Megaphone} />
        </div>
      </AdminSection>

      <AdminSection title="North Star · Verified practice">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <StatCard label="Weekly active members" value={practice.wam} icon={Zap} />
          <StatCard label="Practices this week" value={practice.verifiedThisWeek} icon={Activity} />
          <StatCard
            label={`Activation 7d (${practice.activated}/${practice.newMembers})`}
            value={`${Math.round(practice.activationRate * 100)}%`}
            icon={TrendingUp}
          />
        </div>
      </AdminSection>

      <AdminSection title="Jump to" description="Everything you can manage, grouped by area.">
        <AdminLaunchpad role={role} />
      </AdminSection>

      {role === 'janitor' && <JanitorPanel />}
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

// ── Janitor: full platform overview ──────────────────────────────────────────

async function JanitorPanel() {
  const admin = createAdminClient()

  const [circlesRes, hubsRes, nexusesRes, membersRes] = await Promise.all([
    admin.from('circles').select('id, name, slug, status, type, member_count, member_cap, hub:hubs!hub_id(name)').order('name'),
    admin.from('hubs').select('id, name, slug, status').order('name'),
    admin.from('nexuses').select('id, name, slug, status').order('name'),
    admin.from('memberships').select(MEMBERSHIP_SELECT).eq('status', 'active').order('joined_at', { ascending: true }).limit(200),
  ])

  const hubs = hubsRes.data ?? []
  const nexuses = nexusesRes.data ?? []
  const members = toMemberItems((membersRes.data ?? []) as unknown as MembershipRow[])
  const circles = (circlesRes.data ?? []) as unknown as Array<{
    id: string; name: string; slug: string; status: string; member_count: number; member_cap: number; hub: { name: string } | null
  }>

  return (
    <>
      <AdminSection title="Platform totals">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="Nexuses" value={nexuses.length} icon={Building2} />
          <StatCard label="Hubs" value={hubs.length} icon={Building2} />
          <StatCard label="Circles" value={circles.length} icon={Layers} />
          <StatCard label="Members" value={members.length} icon={Users} />
        </div>
      </AdminSection>

      <AdminSection title="All circles">
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

      <AdminSection title={`All members · ${members.length}`}>
        {members.length === 0 ? <EmptyState message="No members yet." /> : <MemberManager members={members} />}
      </AdminSection>
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
    <>
      <AdminSection title="Your community">
        <div className="grid grid-cols-2 gap-3">
          <StatCard label="Circles" value={hostCircles.length} icon={Layers} />
          <StatCard label="Members" value={members.length} icon={Users} />
        </div>
      </AdminSection>

      <AdminSection title="Your circles">
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
    </>
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
  const totalMembers = typedHubs.reduce((sum, h) => sum + h.circles.reduce((s, c) => s + (c.member_count ?? 0), 0), 0)

  const { data: rawMembers } = await admin
    .from('memberships')
    .select(MEMBERSHIP_SELECT)
    .in('circle_id', allCircleIds.length > 0 ? allCircleIds : ['__none__'])
    .eq('status', 'active')
    .order('joined_at', { ascending: true })

  const members = toMemberItems((rawMembers ?? []) as unknown as MembershipRow[])

  return (
    <>
      <AdminSection title="Your area">
        <div className="grid grid-cols-3 gap-3">
          <StatCard label="Hubs" value={typedHubs.length} icon={Building2} />
          <StatCard label="Circles" value={allCircleIds.length} icon={Layers} />
          <StatCard label="Members" value={totalMembers} icon={Users} />
        </div>
      </AdminSection>

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
  const totalHubs = typedNexuses.flatMap((n) => n.hubs.map((h) => h.id)).length
  const totalMembers = typedNexuses.reduce(
    (sum, n) => sum + n.hubs.reduce((hs, h) => hs + h.circles.reduce((cs, c) => cs + (c.member_count ?? 0), 0), 0),
    0
  )

  const { data: rawMembers } = await admin
    .from('memberships')
    .select(MEMBERSHIP_SELECT)
    .in('circle_id', allCircleIds.length > 0 ? allCircleIds : ['__none__'])
    .eq('status', 'active')
    .order('joined_at', { ascending: true })

  const members = toMemberItems((rawMembers ?? []) as unknown as MembershipRow[])

  return (
    <>
      <AdminSection title="Your region">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="Nexuses" value={typedNexuses.length} icon={Building2} />
          <StatCard label="Hubs" value={totalHubs} icon={Building2} />
          <StatCard label="Circles" value={allCircleIds.length} icon={Layers} />
          <StatCard label="Members" value={totalMembers} icon={Users} />
        </div>
      </AdminSection>

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
