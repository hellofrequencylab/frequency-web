import Link from 'next/link'
import { Users } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { joinGroup } from './actions'

type GroupCard = {
  id: string
  name: string
  slug: string
  capacity: number
  member_count: number
  about: string | null
  host: { display_name: string; handle: string } | null
  region: { name: string } | null
}

export default async function GroupsPage() {
  const admin = createAdminClient()
  const supabase = await createClient()

  // Resolve current user's profile and existing memberships
  const {
    data: { user },
  } = await supabase.auth.getUser()

  let myGroupIds: string[] = []

  if (user) {
    const { data: profile } = await admin
      .from('profiles')
      .select('id')
      .eq('auth_user_id', user.id)
      .maybeSingle()

    if (profile) {
      const { data: memberships } = await admin
        .from('group_memberships')
        .select('group_id')
        .eq('profile_id', profile.id)
      myGroupIds = (memberships ?? []).map((m) => m.group_id as string)
    }
  }

  // Fetch all active groups with host + region
  const { data: raw } = await admin
    .from('groups')
    .select(
      `id, name, slug, capacity, member_count, about,
       host:profiles!host_id ( display_name, handle ),
       region:nexus_regions!region_id ( name )`
    )
    .eq('is_active', true)
    .order('name')

  const groups = (raw ?? []) as unknown as GroupCard[]

  // Split into "your groups" + "others"
  const myGroups = groups.filter((g) => myGroupIds.includes(g.id))
  const otherGroups = groups.filter((g) => !myGroupIds.includes(g.id))

  return (
    <div className="px-4 py-8 max-w-2xl mx-auto">
      <h1 className="text-xl font-semibold text-gray-900 mb-1">Groups</h1>
      <p className="text-sm text-gray-500 mb-6">
        Find your home group or browse all active groups.
      </p>

      {groups.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-200 p-12 text-center">
          <Users className="w-8 h-8 text-gray-300 mx-auto mb-3" />
          <p className="text-sm font-medium text-gray-500">No groups yet</p>
          <p className="text-xs text-gray-400 mt-1">
            Groups will appear here once they&apos;re created.
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {/* Your groups */}
          {myGroups.length > 0 && (
            <section>
              <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                Your Groups
              </h2>
              <div className="space-y-3">
                {myGroups.map((g) => (
                  <GroupCard key={g.id} group={g} isMember />
                ))}
              </div>
            </section>
          )}

          {/* All other groups */}
          {otherGroups.length > 0 && (
            <section>
              {myGroups.length > 0 && (
                <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                  Other Groups
                </h2>
              )}
              <div className="space-y-3">
                {otherGroups.map((g) => (
                  <GroupCard key={g.id} group={g} isMember={false} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Group card component ────────────────────────────────────────────────────

function GroupCard({
  group: g,
  isMember,
}: {
  group: GroupCard
  isMember: boolean
}) {
  const pct = Math.min(100, Math.round((g.member_count / g.capacity) * 100))
  const nearCapacity = g.member_count >= g.capacity * 0.9
  const full = g.member_count >= g.capacity

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {/* Name + badges */}
          <div className="flex items-center gap-2 flex-wrap">
            <Link
              href={`/groups/${g.slug}`}
              className="text-sm font-semibold text-gray-900 hover:text-indigo-600 transition-colors"
            >
              {g.name}
            </Link>
            {g.region?.name && (
              <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500 font-medium">
                {g.region.name}
              </span>
            )}
            {isMember && (
              <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-indigo-100 text-indigo-700 font-medium">
                Joined
              </span>
            )}
            {nearCapacity && !full && (
              <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-700 font-medium">
                Almost full
              </span>
            )}
            {full && !isMember && (
              <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 font-medium">
                Full
              </span>
            )}
          </div>

          {/* Host */}
          {g.host?.display_name && (
            <p className="text-xs text-gray-500 mt-0.5">
              Host:{' '}
              <Link
                href={`/people/${g.host.handle}`}
                className="text-indigo-600 hover:underline"
              >
                {g.host.display_name}
              </Link>
            </p>
          )}

          {/* About snippet */}
          {g.about && (
            <p className="text-xs text-gray-500 mt-1.5 line-clamp-2 leading-relaxed">
              {g.about}
            </p>
          )}
        </div>

        {/* Action */}
        {isMember ? (
          <Link
            href={`/groups/${g.slug}`}
            className="shrink-0 rounded-lg bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 transition-colors"
          >
            View →
          </Link>
        ) : !full ? (
          <form action={joinGroup.bind(null, g.id, g.slug)}>
            <button
              type="submit"
              className="shrink-0 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 transition-colors"
            >
              Join
            </button>
          </form>
        ) : null}
      </div>

      {/* Capacity bar */}
      <div className="mt-3">
        <div className="flex items-center justify-between text-[11px] text-gray-400 mb-1">
          <span>
            {g.member_count} of {g.capacity} members
          </span>
          <span>{pct}%</span>
        </div>
        <div className="h-1 rounded-full bg-gray-100 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${
              full
                ? 'bg-red-400'
                : nearCapacity
                  ? 'bg-orange-400'
                  : 'bg-indigo-400'
            }`}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    </div>
  )
}
