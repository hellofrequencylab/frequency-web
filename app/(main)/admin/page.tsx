import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Users, Layers, Building2 } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { StatusBadge } from '@/components/groups/status-badge'
import { MemberManager, type MemberItem } from './member-manager'

type CommunityRole = 'member' | 'crew' | 'host' | 'guide' | 'mentor'

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

  if (!['host', 'guide', 'mentor'].includes(role)) notFound()

  return (
    <div className="px-4 py-8 max-w-2xl mx-auto">
      <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-50 mb-2">Admin Panel</h1>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-8">
        Scoped to your{' '}
        <span className="font-medium capitalize">{role}</span> level.
      </p>

      {role === 'host'   && <HostPanel   profileId={profile.id} />}
      {role === 'guide'  && <GuidePanel  profileId={profile.id} />}
      {role === 'mentor' && <MentorPanel profileId={profile.id} />}
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
    <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
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
       profile:profiles!profile_id ( id, display_name, handle, avatar_url, community_role ),
       circle:circles!circle_id ( name )`
    )
    .in('circle_id', circleIds.length > 0 ? circleIds : ['__none__'])
    .eq('status', 'active')
    .order('joined_at', { ascending: true })

  const members: MemberItem[] = (rawMembers ?? []).map((m: any) => ({
    membershipId:  m.id,
    profileId:     m.profile.id,
    displayName:   m.profile.display_name,
    handle:        m.profile.handle,
    avatarUrl:     m.profile.avatar_url,
    role:          m.profile.community_role as CommunityRole,
    circleName:    m.circle?.name ?? undefined,
    joinedAt:      m.joined_at,
    isCrewLead:    m.is_crew_lead ?? false,
  }))

  return (
    <div className="space-y-8">
      {/* Stats */}
      <div className="grid grid-cols-2 gap-3">
        <StatCard label="Circles"  value={(circles ?? []).length}  Icon={Layers} />
        <StatCard label="Members"  value={members.length}          Icon={Users}  />
      </div>

      {/* Circles */}
      <section>
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Your Circles</h2>
        {(circles ?? []).length === 0 ? (
          <p className="text-sm text-gray-400">No circles assigned.</p>
        ) : (
          <div className="space-y-2">
            {(circles ?? []).map((circle: any) => (
              <Link
                key={circle.id}
                href={`/circles/${circle.slug}`}
                className="flex items-center justify-between rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-4 py-3 hover:border-indigo-200 dark:hover:border-indigo-800 transition-colors"
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
          <p className="text-sm text-gray-400">No members yet.</p>
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

  const allCircleIds = (hubs ?? []).flatMap((h: any) => h.circles.map((c: any) => c.id))
  const totalCircles = allCircleIds.length
  const totalMembers = (hubs ?? []).reduce(
    (sum: number, h: any) =>
      sum + h.circles.reduce((s: number, c: any) => s + (c.member_count ?? 0), 0),
    0
  )

  const { data: rawMembers } = await admin
    .from('memberships')
    .select(
      `id, volunteer_role, joined_at, is_crew_lead,
       profile:profiles!profile_id ( id, display_name, handle, avatar_url, community_role ),
       circle:circles!circle_id ( name )`
    )
    .in('circle_id', allCircleIds.length > 0 ? allCircleIds : ['__none__'])
    .eq('status', 'active')
    .order('joined_at', { ascending: true })

  const members: MemberItem[] = (rawMembers ?? []).map((m: any) => ({
    membershipId:  m.id,
    profileId:     m.profile.id,
    displayName:   m.profile.display_name,
    handle:        m.profile.handle,
    avatarUrl:     m.profile.avatar_url,
    role:          m.profile.community_role as CommunityRole,
    circleName:    m.circle?.name ?? undefined,
    joinedAt:      m.joined_at,
    isCrewLead:    m.is_crew_lead ?? false,
  }))

  return (
    <div className="space-y-8">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <StatCard label="Hubs"    value={(hubs ?? []).length} Icon={Building2} />
        <StatCard label="Circles" value={totalCircles}        Icon={Layers}    />
        <StatCard label="Members" value={totalMembers}        Icon={Users}     />
      </div>

      {/* Hubs + circles */}
      {(hubs ?? []).map((hub: any) => (
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
            <p className="text-sm text-gray-400">No circles yet.</p>
          ) : (
            <div className="space-y-2">
              {hub.circles.map((circle: any) => (
                <Link
                  key={circle.id}
                  href={`/circles/${circle.slug}`}
                  className="flex items-center justify-between rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-4 py-3 hover:border-indigo-200 dark:hover:border-indigo-800 transition-colors"
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

      {(hubs ?? []).length === 0 && (
        <p className="text-sm text-gray-400">No hubs assigned.</p>
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

  const allHubIds = (nexuses ?? []).flatMap((n: any) => n.hubs.map((h: any) => h.id))
  const allCircleIds: string[] = []

  for (const nexus of nexuses ?? []) {
    for (const hub of nexus.hubs ?? []) {
      for (const circle of hub.circles ?? []) {
        allCircleIds.push(circle.id)
      }
    }
  }

  const totalMembers = (nexuses ?? []).reduce(
    (sum: number, n: any) =>
      sum +
      n.hubs.reduce(
        (hs: number, h: any) =>
          hs + h.circles.reduce((cs: number, c: any) => cs + (c.member_count ?? 0), 0),
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
       profile:profiles!profile_id ( id, display_name, handle, avatar_url, community_role ),
       circle:circles!circle_id ( name )`
    )
    .in('circle_id', allCircleIds.length > 0 ? allCircleIds : ['__none__'])
    .eq('status', 'active')
    .order('joined_at', { ascending: true })

  const members: MemberItem[] = (rawMembers ?? []).map((m: any) => ({
    membershipId:  m.id,
    profileId:     m.profile.id,
    displayName:   m.profile.display_name,
    handle:        m.profile.handle,
    avatarUrl:     m.profile.avatar_url,
    role:          m.profile.community_role as CommunityRole,
    circleName:    m.circle?.name ?? undefined,
    joinedAt:      m.joined_at,
    isCrewLead:    m.is_crew_lead ?? false,
  }))

  return (
    <div className="space-y-8">
      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Nexuses" value={(nexuses ?? []).length} Icon={Building2} />
        <StatCard label="Hubs"    value={totalHubs}              Icon={Building2} />
        <StatCard label="Circles" value={totalCircles}           Icon={Layers}    />
        <StatCard label="Members" value={totalMembers}           Icon={Users}     />
      </div>

      {/* Nexus / hub overview */}
      {(nexuses ?? []).map((nexus: any) => {
        const nexusTotal = nexus.hubs.reduce(
          (sum: number, h: any) =>
            sum + h.circles.reduce((s: number, c: any) => s + (c.member_count ?? 0), 0),
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
              {nexus.hubs.map((hub: any) => {
                const hubTotal = hub.circles.reduce(
                  (s: number, c: any) => s + (c.member_count ?? 0),
                  0
                )
                return (
                  <Link
                    key={hub.id}
                    href={`/hubs/${hub.slug}`}
                    className="flex items-center justify-between rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-4 py-3 hover:border-indigo-200 dark:hover:border-indigo-800 transition-colors"
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

      {(nexuses ?? []).length === 0 && (
        <p className="text-sm text-gray-400">No nexuses assigned.</p>
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
