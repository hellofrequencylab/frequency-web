import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Users, Layers, Building2, Plus, CalendarDays, Megaphone, ShieldAlert } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { AdminCreateMenu } from './create-menu'
import { StatusBadge } from '@/components/groups/status-badge'
import { MemberManager, type MemberItem } from './member-manager'
import type { SeasonRank } from '@/lib/season-ranks'

type CommunityRole = 'member' | 'crew' | 'host' | 'guide' | 'mentor' | 'janitor'

function SidebarCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-gray-200/60 dark:border-gray-800/60 bg-white dark:bg-gray-900 shadow-sm overflow-hidden">
      <div className="px-4 py-2.5 border-b border-gray-100/80 dark:border-gray-800/50">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">{title}</h3>
      </div>
      {children}
    </div>
  )
}

export default async function AdminPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) notFound()

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('id, community_role')
    .eq('auth_user_id', user.id)
    .maybeSingle()

  if (!profile) notFound()

  const role = profile.community_role as CommunityRole

  if (!['host', 'guide', 'mentor', 'janitor'].includes(role)) notFound()

  // Overview stat counts — quick aggregate for all admin roles
  const [membersCount, circlesCount, eventsCount, dispatchesCount] = await Promise.all([
    admin.from('memberships').select('id', { count: 'exact', head: true }).eq('status', 'active'),
    admin.from('circles').select('id', { count: 'exact', head: true }),
    admin.from('events').select('id', { count: 'exact', head: true }),
    admin.from('dispatches').select('id', { count: 'exact', head: true }),
  ])

  return (
    <div>
      <div className="flex items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-50 mb-1">Overview</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {role === 'janitor' ? (
              <span className="font-medium text-violet-600 dark:text-violet-400">Janitor, full platform access</span>
            ) : (
              <>Scoped to your <span className="font-medium capitalize">{role}</span> level.</>
            )}
          </p>
        </div>
        <AdminCreateMenu role={role} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main content */}
        <div className="lg:col-span-2 space-y-8">
          {/* Quick stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard label="Members"     value={membersCount.count ?? 0}    Icon={Users} />
            <StatCard label="Circles"     value={circlesCount.count ?? 0}    Icon={Layers} />
            <StatCard label="Events"      value={eventsCount.count ?? 0}     Icon={CalendarDays} />
            <StatCard label="Dispatches"  value={dispatchesCount.count ?? 0} Icon={Megaphone} />
          </div>

          {role === 'janitor' && <JanitorPanel profileId={profile.id} />}
          {role === 'host'    && <HostPanel    profileId={profile.id} />}
          {role === 'guide'   && <GuidePanel   profileId={profile.id} />}
          {role === 'mentor'  && <MentorPanel  profileId={profile.id} />}
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          <SidebarCard title="Quick Actions">
            <div className="p-2 space-y-0.5">
              <Link href="/events/new" className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                <CalendarDays className="w-4 h-4 text-gray-400" /> New Event
              </Link>
              <Link href="/broadcast" className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                <Megaphone className="w-4 h-4 text-gray-400" /> New Dispatch
              </Link>
              <Link href="/admin/moderation" className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                <ShieldAlert className="w-4 h-4 text-gray-400" /> Moderation Queue
              </Link>
            </div>
          </SidebarCard>
        </div>
      </div>
    </div>
  )
}

// ── Shared stat card ─────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  Icon,
}: {
  label: string
  value: number | string
  Icon: React.ElementType
}) {
  return (
    <div className="rounded-2xl border border-gray-200/60 dark:border-gray-800/60 bg-white dark:bg-gray-900 shadow-sm p-4">
      <div className="flex items-center gap-2 mb-1">
        <Icon className="w-4 h-4 text-gray-400 dark:text-gray-500" />
        <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">{label}</span>
      </div>
      <p className="text-2xl font-bold text-gray-900 dark:text-gray-50 leading-none">
        {typeof value === 'number' ? value.toLocaleString() : value}
      </p>
    </div>
  )
}

// ── Janitor: Full platform overview ──────────────────────────────────────────

async function JanitorPanel({ profileId }: { profileId: string }) {
  const admin = createAdminClient()

  const [circlesRes, hubsRes, nexusesRes, membersRes] = await Promise.all([
    admin.from('circles').select('id, name, slug, status, type, member_count, member_cap, hub:hubs!hub_id(name)').order('name'),
    admin.from('hubs').select('id, name, slug, status').order('name'),
    admin.from('nexuses').select('id, name, slug, status').order('name'),
    admin.from('memberships').select(
      `id, volunteer_role, joined_at, is_crew_lead,
       profile:profiles!profile_id ( id, display_name, handle, avatar_url, community_role, current_season_rank, current_season_zaps, season_challenges_complete ),
       circle:circles!circle_id ( name )`
    ).eq('status', 'active').order('joined_at', { ascending: true }).limit(200),
  ])

  const circles  = circlesRes.data  ?? []
  const hubs     = hubsRes.data     ?? []
  const nexuses  = nexusesRes.data  ?? []
  const rawMembers = membersRes.data ?? []

  const typedMembers = rawMembers as unknown as Array<{
    id: string; volunteer_role: string | null; joined_at: string; is_crew_lead: boolean;
    profile: { id: string; display_name: string; handle: string; avatar_url: string | null; community_role: string; current_season_rank: string | null; current_season_zaps: number; season_challenges_complete: boolean };
    circle: { name: string } | null;
  }>

  const members: MemberItem[] = typedMembers.map((m) => ({
    membershipId: m.id,
    profileId:                m.profile.id,
    displayName:              m.profile.display_name,
    handle:                   m.profile.handle,
    avatarUrl:                m.profile.avatar_url,
    role:                     m.profile.community_role as CommunityRole,
    circleName:               m.circle?.name ?? undefined,
    joinedAt:                 m.joined_at,
    isCrewLead:               m.is_crew_lead ?? false,
    currentSeasonRank:        (m.profile.current_season_rank ?? undefined) as SeasonRank | undefined,
    currentSeasonZaps:        m.profile.current_season_zaps ?? 0,
    seasonChallengesComplete: m.profile.season_challenges_complete ?? false,
  }))

  const typedCircles = circles as unknown as Array<{
    id: string; name: string; slug: string; status: string; type: string;
    member_count: number; member_cap: number; hub: { name: string } | null;
  }>

  return (
    <div className="space-y-8">
      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Nexuses" value={nexuses.length} Icon={Building2} />
        <StatCard label="Hubs"    value={hubs.length}    Icon={Building2} />
        <StatCard label="Circles" value={typedCircles.length} Icon={Layers}    />
        <StatCard label="Members" value={members.length} Icon={Users}     />
      </div>

      {/* All circles */}
      <section>
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">All Circles</h2>
        <div className="space-y-2">
          {typedCircles.map((circle) => (
            <Link
              key={circle.id}
              href={`/circles/${circle.slug}`}
              className="flex items-center justify-between rounded-2xl border border-gray-200/60 dark:border-gray-800/60 bg-white dark:bg-gray-900 shadow-sm px-4 py-3 hover:border-indigo-200 dark:hover:border-indigo-800 transition-colors"
            >
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-900 dark:text-gray-50">{circle.name}</span>
                  <StatusBadge status={circle.status} />
                </div>
                <p className="text-xs text-gray-400 mt-0.5">
                  {circle.member_count} / {circle.member_cap} · {circle.hub?.name}
                </p>
              </div>
              <span className="text-xs text-gray-400">→</span>
            </Link>
          ))}
        </div>
      </section>

      {/* Member management */}
      <section>
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
          All Members
          <span className="ml-2 text-xs font-normal text-gray-400">{members.length}</span>
        </h2>
        {members.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-200/60 dark:border-gray-800/60 bg-gray-50/50 dark:bg-gray-900/50 p-8 text-center">
            <p className="text-sm text-gray-500 dark:text-gray-400">No members yet.</p>
          </div>
        ) : (
          <MemberManager members={members} />
        )}
      </section>
    </div>
  )
}

// ── Host: Circle + member overview ──────────────────────────────────────────

async function HostPanel({ profileId }: { profileId: string }) {
  const admin = createAdminClient()

  const { data: circles } = await admin
    .from('circles')
    .select(
      `id, name, slug, status, type, member_count, member_cap,
       hub:hubs!hub_id ( name, slug )`
    )
    .eq('host_id', profileId)
    .order('name')

  const circleIds = (circles ?? []).map((c) => c.id)

  const { data: rawMembers } = await admin
    .from('memberships')
    .select(
      `id, volunteer_role, joined_at, is_crew_lead,
       profile:profiles!profile_id ( id, display_name, handle, avatar_url, community_role, current_season_rank, current_season_zaps, season_challenges_complete ),
       circle:circles!circle_id ( name )`
    )
    .in('circle_id', circleIds.length > 0 ? circleIds : ['__none__'])
    .eq('status', 'active')
    .order('joined_at', { ascending: true })

  type MembershipRow = {
    id: string; volunteer_role: string | null; joined_at: string; is_crew_lead: boolean;
    profile: { id: string; display_name: string; handle: string; avatar_url: string | null; community_role: string; current_season_rank: string | null; current_season_zaps: number; season_challenges_complete: boolean };
    circle: { name: string } | null;
  }
  const hostMembers = (rawMembers ?? []) as unknown as MembershipRow[]
  const members: MemberItem[] = hostMembers.map((m) => ({
    membershipId:             m.id,
    profileId:                m.profile.id,
    displayName:              m.profile.display_name,
    handle:                   m.profile.handle,
    avatarUrl:                m.profile.avatar_url,
    role:                     m.profile.community_role as CommunityRole,
    circleName:               m.circle?.name ?? undefined,
    joinedAt:                 m.joined_at,
    isCrewLead:               m.is_crew_lead ?? false,
    currentSeasonRank:        (m.profile.current_season_rank ?? undefined) as SeasonRank | undefined,
    currentSeasonZaps:        m.profile.current_season_zaps ?? 0,
    seasonChallengesComplete: m.profile.season_challenges_complete ?? false,
  }))

  type HostCircleRow = {
    id: string; name: string; slug: string; status: string; type: string;
    member_count: number; member_cap: number; hub: { name: string; slug: string } | null;
  }
  const hostCircles = (circles ?? []) as unknown as HostCircleRow[]

  return (
    <div className="space-y-8">
      {/* Stats */}
      <div className="grid grid-cols-2 gap-3">
        <StatCard label="Circles"  value={hostCircles.length}  Icon={Layers} />
        <StatCard label="Members"  value={members.length}          Icon={Users}  />
      </div>

      {/* Circles */}
      <section>
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Your Circles</h2>
        {hostCircles.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-200/60 dark:border-gray-800/60 bg-gray-50/50 dark:bg-gray-900/50 p-8 text-center">
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">No circles yet.</p>
            <Link
              href="/admin/circles"
              className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              Create a circle
            </Link>
          </div>
        ) : (
          <div className="space-y-2">
            {hostCircles.map((circle) => (
              <Link
                key={circle.id}
                href={`/circles/${circle.slug}`}
                className="flex items-center justify-between rounded-2xl border border-gray-200/60 dark:border-gray-800/60 bg-white dark:bg-gray-900 shadow-sm px-4 py-3 hover:border-indigo-200 dark:hover:border-indigo-800 transition-colors"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-900 dark:text-gray-50">{circle.name}</span>
                    <StatusBadge status={circle.status} />
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {circle.member_count} / {circle.member_cap} · {circle.hub?.name}
                  </p>
                </div>
                <span className="text-xs text-gray-400">→</span>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* Members */}
      <section>
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
          Members
          <span className="ml-2 text-xs font-normal text-gray-400">{members.length}</span>
        </h2>
        {members.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-200/60 dark:border-gray-800/60 bg-gray-50/50 dark:bg-gray-900/50 p-8 text-center">
            <p className="text-sm text-gray-500 dark:text-gray-400">No members yet. Share your circle link to get started.</p>
          </div>
        ) : (
          <MemberManager members={members} />
        )}
      </section>
    </div>
  )
}

// ── Guide: Hub + member overview ─────────────────────────────────────────────

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
  const totalCircles = allCircleIds.length
  const totalMembers = typedHubs.reduce(
    (sum: number, h) =>
      sum + h.circles.reduce((s: number, c) => s + (c.member_count ?? 0), 0),
    0
  )

  const { data: rawMembers } = await admin
    .from('memberships')
    .select(
      `id, volunteer_role, joined_at, is_crew_lead,
       profile:profiles!profile_id ( id, display_name, handle, avatar_url, community_role, current_season_rank, current_season_zaps, season_challenges_complete ),
       circle:circles!circle_id ( name )`
    )
    .in('circle_id', allCircleIds.length > 0 ? allCircleIds : ['__none__'])
    .eq('status', 'active')
    .order('joined_at', { ascending: true })

  type GuideMemberRow = {
    id: string; volunteer_role: string | null; joined_at: string; is_crew_lead: boolean;
    profile: { id: string; display_name: string; handle: string; avatar_url: string | null; community_role: string; current_season_rank: string | null; current_season_zaps: number; season_challenges_complete: boolean };
    circle: { name: string } | null;
  }
  const guideMembers = (rawMembers ?? []) as unknown as GuideMemberRow[]
  const members: MemberItem[] = guideMembers.map((m) => ({
    membershipId:             m.id,
    profileId:                m.profile.id,
    displayName:              m.profile.display_name,
    handle:                   m.profile.handle,
    avatarUrl:                m.profile.avatar_url,
    role:                     m.profile.community_role as CommunityRole,
    circleName:               m.circle?.name ?? undefined,
    joinedAt:                 m.joined_at,
    isCrewLead:               m.is_crew_lead ?? false,
    currentSeasonRank:        (m.profile.current_season_rank ?? undefined) as SeasonRank | undefined,
    currentSeasonZaps:        m.profile.current_season_zaps ?? 0,
    seasonChallengesComplete: m.profile.season_challenges_complete ?? false,
  }))

  return (
    <div className="space-y-8">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <StatCard label="Hubs"    value={typedHubs.length} Icon={Building2} />
        <StatCard label="Circles" value={totalCircles}        Icon={Layers}    />
        <StatCard label="Members" value={totalMembers}        Icon={Users}     />
      </div>

      {/* Hubs + circles */}
      {typedHubs.map((hub) => (
        <section key={hub.id}>
          <div className="flex items-center gap-2 mb-3">
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">{hub.name}</h2>
            <StatusBadge status={hub.status} />
            {hub.nexus && (
              <Link
                href={`/nexuses/${hub.nexus.slug}`}
                className="text-xs text-indigo-500 hover:underline ml-auto"
              >
                {hub.nexus.name} →
              </Link>
            )}
          </div>

          {hub.circles.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-gray-200/60 dark:border-gray-800/60 bg-gray-50/50 dark:bg-gray-900/50 p-6 text-center">
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">No circles in this hub yet.</p>
              <Link
                href="/admin/circles"
                className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                Add a circle
              </Link>
            </div>
          ) : (
            <div className="space-y-2">
              {hub.circles.map((circle) => (
                <Link
                  key={circle.id}
                  href={`/circles/${circle.slug}`}
                  className="flex items-center justify-between rounded-2xl border border-gray-200/60 dark:border-gray-800/60 bg-white dark:bg-gray-900 shadow-sm px-4 py-3 hover:border-indigo-200 dark:hover:border-indigo-800 transition-colors"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-900 dark:text-gray-50">{circle.name}</span>
                      <StatusBadge status={circle.status} />
                      <span className="text-[11px] text-gray-400">{circle.type}</span>
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {circle.member_count} / {circle.member_cap}
                      {circle.host && ` · Host: ${circle.host.display_name}`}
                    </p>
                  </div>
                  <span className="text-xs text-gray-400">→</span>
                </Link>
              ))}
            </div>
          )}
        </section>
      ))}

      {typedHubs.length === 0 && (
        <div className="rounded-2xl border border-dashed border-gray-200/60 dark:border-gray-800/60 bg-gray-50/50 dark:bg-gray-900/50 p-8 text-center">
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">No hubs assigned yet.</p>
          <Link
            href="/admin/hubs"
            className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Set up a hub
          </Link>
        </div>
      )}

      {/* Members */}
      {members.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
            All Members
            <span className="ml-2 text-xs font-normal text-gray-400">{members.length}</span>
          </h2>
          <MemberManager members={members} />
        </section>
      )}
    </div>
  )
}

// ── Mentor: Nexus overview + full member management ──────────────────────────

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

  const allHubIds = typedNexuses.flatMap((n) => n.hubs.map((h) => h.id))
  const allCircleIds: string[] = []

  for (const nexus of typedNexuses) {
    for (const hub of nexus.hubs ?? []) {
      for (const circle of hub.circles ?? []) {
        allCircleIds.push(circle.id)
      }
    }
  }

  const totalMembers = typedNexuses.reduce(
    (sum: number, n) =>
      sum +
      n.hubs.reduce(
        (hs: number, h) =>
          hs + h.circles.reduce((cs: number, c) => cs + (c.member_count ?? 0), 0),
        0
      ),
    0
  )
  const totalCircles = allCircleIds.length
  const totalHubs = allHubIds.length

  const { data: rawMembers } = await admin
    .from('memberships')
    .select(
      `id, volunteer_role, joined_at, is_crew_lead,
       profile:profiles!profile_id ( id, display_name, handle, avatar_url, community_role, current_season_rank, current_season_zaps, season_challenges_complete ),
       circle:circles!circle_id ( name )`
    )
    .in('circle_id', allCircleIds.length > 0 ? allCircleIds : ['__none__'])
    .eq('status', 'active')
    .order('joined_at', { ascending: true })

  type MentorMemberRow = {
    id: string; volunteer_role: string | null; joined_at: string; is_crew_lead: boolean;
    profile: { id: string; display_name: string; handle: string; avatar_url: string | null; community_role: string; current_season_rank: string | null; current_season_zaps: number; season_challenges_complete: boolean };
    circle: { name: string } | null;
  }
  const mentorMembers = (rawMembers ?? []) as unknown as MentorMemberRow[]
  const members: MemberItem[] = mentorMembers.map((m) => ({
    membershipId:             m.id,
    profileId:                m.profile.id,
    displayName:              m.profile.display_name,
    handle:                   m.profile.handle,
    avatarUrl:                m.profile.avatar_url,
    role:                     m.profile.community_role as CommunityRole,
    circleName:               m.circle?.name ?? undefined,
    joinedAt:                 m.joined_at,
    isCrewLead:               m.is_crew_lead ?? false,
    currentSeasonRank:        (m.profile.current_season_rank ?? undefined) as SeasonRank | undefined,
    currentSeasonZaps:        m.profile.current_season_zaps ?? 0,
    seasonChallengesComplete: m.profile.season_challenges_complete ?? false,
  }))

  return (
    <div className="space-y-8">
      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Nexuses" value={typedNexuses.length} Icon={Building2} />
        <StatCard label="Hubs"    value={totalHubs}              Icon={Building2} />
        <StatCard label="Circles" value={totalCircles}           Icon={Layers}    />
        <StatCard label="Members" value={totalMembers}           Icon={Users}     />
      </div>

      {/* Nexus / hub overview */}
      {typedNexuses.map((nexus) => {
        const nexusTotal = nexus.hubs.reduce(
          (sum: number, h) =>
            sum + h.circles.reduce((s: number, c) => s + (c.member_count ?? 0), 0),
          0
        )
        return (
          <section key={nexus.id}>
            <div className="flex items-center gap-2 mb-1">
              <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">{nexus.name}</h2>
              <StatusBadge status={nexus.status} />
            </div>
            <p className="text-xs text-gray-400 dark:text-gray-500 mb-3">
              {nexus.outpost?.name} · {nexusTotal} / {nexus.member_cap} members
            </p>

            <div className="space-y-2">
              {nexus.hubs.map((hub) => {
                const hubTotal = hub.circles.reduce(
                  (s: number, c) => s + (c.member_count ?? 0),
                  0
                )
                return (
                  <Link
                    key={hub.id}
                    href={`/hubs/${hub.slug}`}
                    className="flex items-center justify-between rounded-2xl border border-gray-200/60 dark:border-gray-800/60 bg-white dark:bg-gray-900 shadow-sm px-4 py-3 hover:border-indigo-200 dark:hover:border-indigo-800 transition-colors"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-900 dark:text-gray-50">{hub.name}</span>
                        <StatusBadge status={hub.status} />
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {hub.circles.length} circles · {hubTotal} members
                        {hub.guide && ` · Guide: ${hub.guide.display_name}`}
                      </p>
                    </div>
                    <span className="text-xs text-gray-400">→</span>
                  </Link>
                )
              })}
            </div>
          </section>
        )
      })}

      {typedNexuses.length === 0 && (
        <div className="rounded-2xl border border-dashed border-gray-200/60 dark:border-gray-800/60 bg-gray-50/50 dark:bg-gray-900/50 p-8 text-center">
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">No nexuses assigned yet.</p>
          <Link
            href="/admin/nexuses"
            className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Create a nexus
          </Link>
        </div>
      )}

      {/* Full member management */}
      {members.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
            All Members
            <span className="ml-2 text-xs font-normal text-gray-400">{members.length}</span>
          </h2>
          <MemberManager members={members} />
        </section>
      )}
    </div>
  )
}
