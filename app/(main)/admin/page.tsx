import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { StatusBadge } from '@/components/groups/status-badge'

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
      <h1 className="text-xl font-semibold text-gray-900 mb-2">Admin Panel</h1>
      <p className="text-sm text-gray-500 mb-8">
        Scoped to your{' '}
        <span className="font-medium capitalize">{role}</span> level.
      </p>

      {role === 'host' && <HostPanel profileId={profile.id} />}
      {role === 'guide' && <GuidePanel profileId={profile.id} />}
      {role === 'mentor' && <MentorPanel profileId={profile.id} />}
    </div>
  )
}

// ── Host: Circle overview ───────────────────────────────────────────────────

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

  const { data: members } = await admin
    .from('memberships')
    .select(
      `id, volunteer_role, joined_at, status,
       profile:profiles!profile_id ( id, display_name, handle, community_role ),
       circle:circles!circle_id ( name, slug )`
    )
    .in('circle_id', (circles ?? []).map((c) => c.id))
    .eq('status', 'active')
    .order('joined_at', { ascending: true })

  return (
    <div className="space-y-8">
      {/* Circles */}
      <section>
        <h2 className="text-sm font-semibold text-gray-700 mb-3">Your Circles</h2>
        {(circles ?? []).length === 0 ? (
          <p className="text-sm text-gray-400">No circles assigned.</p>
        ) : (
          <div className="space-y-2">
            {(circles ?? []).map((circle: any) => (
              <Link
                key={circle.id}
                href={`/circles/${circle.slug}`}
                className="flex items-center justify-between rounded-xl border border-gray-200 bg-white px-4 py-3 hover:border-indigo-200 transition-colors"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-900">{circle.name}</span>
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
        <h2 className="text-sm font-semibold text-gray-700 mb-3">
          Members
          <span className="ml-2 text-xs font-normal text-gray-400">
            {(members ?? []).length}
          </span>
        </h2>
        {(members ?? []).length === 0 ? (
          <p className="text-sm text-gray-400">No members yet.</p>
        ) : (
          <div className="space-y-0.5">
            {(members ?? []).map((m: any) => (
              <div key={m.id} className="flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-gray-50">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <Link
                      href={`/people/${m.profile.handle}`}
                      className="text-sm font-medium text-gray-900 hover:underline"
                    >
                      {m.profile.display_name}
                    </Link>
                    <span className="text-xs text-gray-400">·</span>
                    <span className="text-xs text-gray-400">{m.circle?.name}</span>
                  </div>
                  <p className="text-xs text-gray-400">@{m.profile.handle}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

// ── Guide: Hub overview ─────────────────────────────────────────────────────

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

  return (
    <div className="space-y-8">
      {(hubs ?? []).map((hub: any) => (
        <section key={hub.id}>
          <div className="flex items-center gap-2 mb-3">
            <h2 className="text-sm font-semibold text-gray-700">{hub.name}</h2>
            <StatusBadge status={hub.status} />
            {hub.nexus && (
              <Link href={`/nexuses/${hub.nexus.slug}`} className="text-xs text-indigo-500 hover:underline ml-auto">
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
                  className="flex items-center justify-between rounded-xl border border-gray-200 bg-white px-4 py-3 hover:border-indigo-200 transition-colors"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-900">{circle.name}</span>
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
    </div>
  )
}

// ── Mentor: Nexus overview ──────────────────────────────────────────────────

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
         circles ( member_count )
       )`
    )
    .eq('mentor_id', profileId)
    .order('name')

  return (
    <div className="space-y-8">
      {(nexuses ?? []).map((nexus: any) => {
        const totalMembers = nexus.hubs.reduce(
          (sum: number, h: any) => sum + h.circles.reduce((s: number, c: any) => s + (c.member_count ?? 0), 0),
          0
        )

        return (
          <section key={nexus.id}>
            <div className="flex items-center gap-2 mb-1">
              <h2 className="text-sm font-semibold text-gray-700">{nexus.name}</h2>
              <StatusBadge status={nexus.status} />
            </div>
            <p className="text-xs text-gray-400 mb-3">
              {nexus.outpost?.name} · {totalMembers} / {nexus.member_cap} members
            </p>

            <div className="space-y-2">
              {nexus.hubs.map((hub: any) => {
                const hubTotal = hub.circles.reduce((s: number, c: any) => s + (c.member_count ?? 0), 0)
                return (
                  <Link
                    key={hub.id}
                    href={`/hubs/${hub.slug}`}
                    className="flex items-center justify-between rounded-xl border border-gray-200 bg-white px-4 py-3 hover:border-indigo-200 transition-colors"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-900">{hub.name}</span>
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
    </div>
  )
}
