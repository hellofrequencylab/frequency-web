import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Users, MessageSquare } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { leaveCircle } from '../actions'
import { startConversation } from '@/app/(main)/messages/actions'
import { Composer } from '@/components/feed/composer'
import { FeedList } from '@/components/feed/feed-list'
import { UpcomingEventsWidget } from '@/components/events/upcoming-widget'
import { HierarchyBreadcrumb } from '@/components/hierarchy/breadcrumb'
import { StatusBadge } from '@/components/groups/status-badge'

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

type CircleDetail = {
  id: string
  name: string
  slug: string
  about: string | null
  type: 'in-person' | 'online'
  member_count: number
  member_cap: number
  status: string
  host: { id: string; display_name: string; handle: string; avatar_url: string | null } | null
  hub: {
    id: string
    name: string
    slug: string
    nexus: {
      id: string
      name: string
      slug: string
      outpost: {
        id: string
        name: string
        region: { name: string } | null
      } | null
    } | null
  } | null
}

type MemberRow = {
  id: string
  volunteer_role: CommunityRole | null
  joined_at: string
  is_crew_lead: boolean
  profile: {
    id: string
    display_name: string
    handle: string
    avatar_url: string | null
    community_role: CommunityRole
  }
}

export default async function CirclePage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const admin = createAdminClient()
  const supabase = await createClient()

  const { data: rawCircle } = await admin
    .from('circles')
    .select(
      `id, name, slug, about, type, member_count, member_cap, status,
       host:profiles!host_id ( id, display_name, handle, avatar_url ),
       hub:hubs!hub_id (
         id, name, slug,
         nexus:nexuses!nexus_id (
           id, name, slug,
           outpost:outposts!outpost_id (
             id, name,
             region:nexus_regions!region_id ( name )
           )
         )
       )`
    )
    .eq('slug', slug)
    .neq('status', 'archived')
    .maybeSingle()

  if (!rawCircle) notFound()
  const circle = rawCircle as unknown as CircleDetail

  // Fetch members
  const { data: rawMembers } = await admin
    .from('memberships')
    .select(
      `id, volunteer_role, joined_at, is_crew_lead,
       profile:profiles!profile_id ( id, display_name, handle, avatar_url, community_role )`
    )
    .eq('circle_id', circle.id)
    .eq('status', 'active')
    .order('joined_at', { ascending: true })

  const members = (rawMembers ?? []) as unknown as MemberRow[]

  // Current user
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
      isHost = circle.host?.id === myProfileId
    }
  }

  // Sort: host first → by join date
  const sorted = [...members].sort((a, b) => {
    const aHost = circle.host?.id === a.profile.id ? 0 : 1
    const bHost = circle.host?.id === b.profile.id ? 0 : 1
    if (aHost !== bHost) return aHost - bHost
    return 0
  })

  const pct = Math.min(100, Math.round((circle.member_count / circle.member_cap) * 100))
  const nearCap = circle.member_count >= circle.member_cap * 0.9
  const full = circle.member_count >= circle.member_cap

  // Build breadcrumb data
  const crumbs = [
    circle.hub?.nexus?.outpost?.region?.name
      ? { label: circle.hub.nexus.outpost.region.name }
      : null,
    circle.hub?.nexus?.outpost
      ? { label: circle.hub.nexus.outpost.name }
      : null,
    circle.hub?.nexus
      ? { label: circle.hub.nexus.name, href: `/nexuses/${circle.hub.nexus.slug}` }
      : null,
    circle.hub
      ? { label: circle.hub.name, href: `/hubs/${circle.hub.slug}` }
      : null,
    { label: circle.name },
  ].filter(Boolean) as { label: string; href?: string }[]

  return (
    <div className="px-6 py-8 max-w-2xl">

      {/* Back */}
      <Link
        href="/circles"
        className="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 mb-4 transition-colors"
      >
        ← All circles
      </Link>

      {/* Breadcrumb */}
      <HierarchyBreadcrumb crumbs={crumbs} className="mb-4" />

      {/* ── Header ─────────────────────────────────── */}
      <div className="mb-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-semibold text-gray-900">{circle.name}</h1>
              <StatusBadge status={circle.status as any} />
              <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500 font-medium">
                {circle.type}
              </span>
            </div>

            {circle.host && (
              <p className="mt-1 text-xs text-gray-500">
                Host:{' '}
                <Link
                  href={`/people/${circle.host.handle}`}
                  className="text-indigo-600 hover:underline"
                >
                  {circle.host.display_name}
                </Link>
              </p>
            )}
          </div>

          {isMember && !isHost && (
            <form action={leaveCircle.bind(null, circle.id)}>
              <button
                type="submit"
                className="shrink-0 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-500 hover:text-red-600 hover:border-red-200 hover:bg-red-50 transition-colors"
              >
                Leave
              </button>
            </form>
          )}
        </div>

        {/* Capacity */}
        <div className="mt-4">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="flex items-center gap-1.5 text-sm text-gray-500">
              <Users className="w-4 h-4" />
              {circle.member_count} of {circle.member_cap} members
            </span>
            {nearCap && !full && (
              <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-700 font-medium">
                Almost full
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
                full ? 'bg-red-400' : nearCap ? 'bg-orange-400' : 'bg-indigo-400'
              }`}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      </div>

      {/* ── About ──────────────────────────────────── */}
      {circle.about ? (
        <div className="mb-6 rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
          <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
            {circle.about}
          </p>
        </div>
      ) : isHost ? (
        <div className="mb-6 rounded-xl border border-dashed border-gray-200 px-4 py-3">
          <p className="text-xs text-gray-400">+ Add a description for your circle</p>
        </div>
      ) : null}

      {/* ── Members ────────────────────────────────── */}
      <section>
        <h2 className="text-sm font-semibold text-gray-700 mb-3">
          Members
          <span className="ml-2 text-xs font-normal text-gray-400">{sorted.length}</span>
        </h2>

        {sorted.length === 0 ? (
          <p className="text-sm text-gray-400">No members yet.</p>
        ) : (
          <div className="space-y-0.5">
            {sorted.map(({ profile, volunteer_role, is_crew_lead }) => {
              const memberIsHost = circle.host?.id === profile.id
              const role = (profile.community_role ?? 'member') as CommunityRole
              const badge = ROLE_BADGE[role] ?? ROLE_BADGE.member
              const volBadge = volunteer_role ? ROLE_BADGE[volunteer_role] : null
              const isSelf = profile.id === myProfileId

              return (
                <div
                  key={profile.id}
                  className="flex items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-gray-50 transition-colors -mx-3 group"
                >
                  <Link
                    href={`/people/${profile.handle}`}
                    className="flex items-center gap-3 flex-1 min-w-0"
                  >
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
                          <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium">
                            Crew Lead
                          </span>
                        )}
                        {volBadge && !memberIsHost && (
                          <span className={`text-[11px] px-1.5 py-0.5 rounded-full font-medium ${volBadge.cls}`}>
                            {volBadge.label}
                          </span>
                        )}
                        <span className={`text-[11px] px-1.5 py-0.5 rounded-full font-medium ${badge.cls}`}>
                          {badge.label}
                        </span>
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5">@{profile.handle}</p>
                    </div>
                  </Link>

                  {/* Message icon — visible on hover, hidden for self */}
                  {!isSelf && isMember && (
                    <form action={startConversation.bind(null, profile.id)}>
                      <button
                        type="submit"
                        title={`Message ${profile.display_name}`}
                        className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 transition-all"
                      >
                        <MessageSquare className="w-4 h-4" />
                      </button>
                    </form>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* ── Upcoming events ────────────────────────── */}
      <UpcomingEventsWidget scopeIds={[circle.id]} />

      {/* ── Feed ───────────────────────────────────── */}
      <section className="mt-8 border-t border-gray-100 pt-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">Circle Feed</h2>
        {isMember && (
          <Composer
            scopeId={circle.id}
            visibility="group"
            placeholder={`Share something with ${circle.name}…`}
          />
        )}
        <FeedList
          scopeIds={[circle.id]}
          myProfileId={myProfileId}
          emptyMessage="No posts yet. Be the first to share something."
        />
      </section>
    </div>
  )
}
