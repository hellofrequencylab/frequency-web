import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Users, MapPin } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { leaveGroup } from '../actions'
import { Composer } from '@/components/feed/composer'
import { FeedList } from '@/components/feed/feed-list'

type CommunityRole = 'member' | 'crew' | 'host' | 'guide' | 'mentor'

const ROLE_BADGE: Record<CommunityRole, { label: string; cls: string }> = {
  member: { label: 'Member', cls: 'bg-gray-100 text-gray-600' },
  crew:   { label: 'Crew',   cls: 'bg-blue-100 text-blue-700' },
  host:   { label: 'Host',   cls: 'bg-green-100 text-green-700' },
  guide:  { label: 'Guide',  cls: 'bg-purple-100 text-purple-700' },
  mentor: { label: 'Mentor', cls: 'bg-amber-100 text-amber-700' },
}

function getInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('')
}

type GroupDetail = {
  id: string
  name: string
  slug: string
  about: string | null
  capacity: number
  member_count: number
  host: {
    id: string
    display_name: string
    handle: string
    avatar_url: string | null
  } | null
  region: { name: string } | null
}

type MemberRow = {
  id: string
  is_crew_lead: boolean
  joined_at: string
  profile: {
    id: string
    display_name: string
    handle: string
    avatar_url: string | null
    community_role: CommunityRole
  }
}

export default async function GroupPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const admin = createAdminClient()
  const supabase = await createClient()

  // Fetch group with host + region
  const { data: rawGroup } = await admin
    .from('groups')
    .select(
      `id, name, slug, about, capacity, member_count,
       host:profiles!host_id ( id, display_name, handle, avatar_url ),
       region:nexus_regions!region_id ( name )`
    )
    .eq('slug', slug)
    .eq('is_active', true)
    .maybeSingle()

  if (!rawGroup) notFound()

  const group = rawGroup as unknown as GroupDetail

  // Fetch members
  const { data: rawMembers } = await admin
    .from('group_memberships')
    .select(
      `id, is_crew_lead, joined_at,
       profile:profiles!profile_id ( id, display_name, handle, avatar_url, community_role )`
    )
    .eq('group_id', group.id)
    .order('joined_at', { ascending: true })

  const members = (rawMembers ?? []) as unknown as MemberRow[]

  // Current user check
  const {
    data: { user },
  } = await supabase.auth.getUser()

  let myProfileId: string | null = null
  let isMember = false
  let isHost = false

  if (user) {
    const { data: myProfile } = await admin
      .from('profiles')
      .select('id')
      .eq('auth_user_id', user.id)
      .maybeSingle()

    if (myProfile) {
      myProfileId = myProfile.id
      isMember = members.some((m) => m.profile.id === myProfileId)
      isHost = group.host?.id === myProfileId
    }
  }

  // Sort: host first → crew leads → join date
  const sorted = [...members].sort((a, b) => {
    const aHost = group.host?.id === a.profile.id ? 0 : 1
    const bHost = group.host?.id === b.profile.id ? 0 : 1
    if (aHost !== bHost) return aHost - bHost
    if (a.is_crew_lead !== b.is_crew_lead) return a.is_crew_lead ? -1 : 1
    return 0
  })

  const pct = Math.min(100, Math.round((group.member_count / group.capacity) * 100))
  const nearCapacity = group.member_count >= group.capacity * 0.9
  const full = group.member_count >= group.capacity

  return (
    <div className="px-4 py-8 max-w-2xl mx-auto">

      {/* Back link */}
      <Link
        href="/groups"
        className="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 mb-5 transition-colors"
      >
        ← All groups
      </Link>

      {/* ── Header ───────────────────────────────────── */}
      <div className="mb-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-xl font-semibold text-gray-900">{group.name}</h1>

            <div className="flex items-center gap-3 mt-1.5 flex-wrap text-xs text-gray-500">
              {group.region?.name && (
                <span className="flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5 shrink-0" />
                  {group.region.name}
                </span>
              )}
              {group.host && (
                <span>
                  Host:{' '}
                  <Link
                    href={`/people/${group.host.handle}`}
                    className="text-indigo-600 hover:underline"
                  >
                    {group.host.display_name}
                  </Link>
                </span>
              )}
            </div>
          </div>

          {/* Leave — only non-host members */}
          {isMember && !isHost && (
            <form action={leaveGroup.bind(null, group.id)}>
              <button
                type="submit"
                className="shrink-0 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-500 hover:text-red-600 hover:border-red-200 hover:bg-red-50 transition-colors"
              >
                Leave group
              </button>
            </form>
          )}
        </div>

        {/* Capacity */}
        <div className="mt-4">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="flex items-center gap-1.5 text-sm text-gray-500">
              <Users className="w-4 h-4" />
              {group.member_count} of {group.capacity} members
            </span>
            {nearCapacity && !full && (
              <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-700 font-medium">
                Almost full — prepare for split
              </span>
            )}
            {full && (
              <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 font-medium">
                Full
              </span>
            )}
          </div>
          <div className="mt-2 h-1.5 max-w-xs rounded-full bg-gray-100 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                full ? 'bg-red-400' : nearCapacity ? 'bg-orange-400' : 'bg-indigo-400'
              }`}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      </div>

      {/* ── About ────────────────────────────────────── */}
      {group.about ? (
        <div className="mb-6 rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
          <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
            {group.about}
          </p>
          {isHost && (
            <button className="mt-2 text-xs text-indigo-500 hover:text-indigo-700 transition-colors">
              Edit about section
            </button>
          )}
        </div>
      ) : isHost ? (
        <div className="mb-6 rounded-xl border border-dashed border-gray-200 px-4 py-3">
          <button className="text-xs text-gray-400 hover:text-gray-600 transition-colors">
            + Add a description for your group
          </button>
        </div>
      ) : null}

      {/* ── Members ──────────────────────────────────── */}
      <section>
        <h2 className="text-sm font-semibold text-gray-700 mb-3">
          Members
          <span className="ml-2 text-xs font-normal text-gray-400">
            {sorted.length}
          </span>
        </h2>

        {sorted.length === 0 ? (
          <p className="text-sm text-gray-400">No members yet.</p>
        ) : (
          <div className="space-y-0.5">
            {sorted.map(({ profile, is_crew_lead }) => {
              const memberIsHost = group.host?.id === profile.id
              const role = (profile.community_role ?? 'member') as CommunityRole
              const badge = ROLE_BADGE[role] ?? ROLE_BADGE.member

              return (
                <Link
                  key={profile.id}
                  href={`/people/${profile.handle}`}
                  className="flex items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-gray-50 transition-colors -mx-3"
                >
                  {/* Avatar */}
                  {profile.avatar_url ? (
                    <img
                      src={profile.avatar_url}
                      alt={profile.display_name}
                      className="w-8 h-8 rounded-full object-cover shrink-0"
                    />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-600 text-xs font-semibold flex items-center justify-center shrink-0 select-none">
                      {getInitials(profile.display_name)}
                    </div>
                  )}

                  {/* Name + badges */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-sm font-medium text-gray-900 truncate">
                        {profile.display_name}
                      </span>

                      {memberIsHost && (
                        <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">
                          Host
                        </span>
                      )}
                      {is_crew_lead && !memberIsHost && (
                        <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-indigo-100 text-indigo-700 font-medium">
                          Crew Lead
                        </span>
                      )}
                      <span className={`text-[11px] px-1.5 py-0.5 rounded-full font-medium ${badge.cls}`}>
                        {badge.label}
                      </span>
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">@{profile.handle}</p>
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </section>

      {/* ── Upcoming events (placeholder) ────────────── */}
      <section className="mt-8 border-t border-gray-100 pt-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">Upcoming Events</h2>
        <p className="text-sm text-gray-400">
          Events will appear here once the events feature is built.
        </p>
      </section>

      {/* ── Group feed ───────────────────────────────── */}
      <section className="mt-8 border-t border-gray-100 pt-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">Group Feed</h2>
        {isMember && (
          <Composer
            scopeId={group.id}
            visibility="group"
            placeholder={`Share something with ${group.name}…`}
          />
        )}
        <FeedList
          scopeIds={[group.id]}
          myProfileId={myProfileId}
          emptyMessage="No posts yet. Be the first to share something with the group."
        />
      </section>

    </div>
  )
}
