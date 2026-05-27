import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { startConversation } from '@/app/(main)/messages/actions'
import { Composer } from '@/components/feed/composer'
import { ProfileFeed } from '@/components/feed/profile-feed'
import { getInitials, relativeTime } from '@/lib/utils'
import {
  MessageSquare, CalendarDays, Zap, Users, Megaphone,
  MapPin, Pencil, ArrowRight,
} from 'lucide-react'

type CommunityRole = 'member' | 'crew' | 'host' | 'guide' | 'mentor' | 'janitor'

const ROLE_BADGE: Record<CommunityRole, { label: string; cls: string }> = {
  member:  { label: 'Member',  cls: 'bg-gray-100 text-gray-600' },
  crew:    { label: 'Crew',    cls: 'bg-blue-100 text-blue-700' },
  host:    { label: 'Host',    cls: 'bg-green-100 text-green-700' },
  guide:   { label: 'Guide',   cls: 'bg-purple-100 text-purple-700' },
  mentor:  { label: 'Mentor',  cls: 'bg-amber-100 text-amber-700' },
  janitor: { label: 'Janitor', cls: 'bg-violet-100 text-violet-700' },
}

const RANK_TIERS = [
  { name: 'Ghost',    min: 0,    cls: 'bg-gray-100 text-gray-600' },
  { name: 'Spark',    min: 50,   cls: 'bg-amber-100 text-amber-700' },
  { name: 'Flame',    min: 150,  cls: 'bg-orange-100 text-orange-700' },
  { name: 'Blaze',    min: 400,  cls: 'bg-red-100 text-red-700' },
  { name: 'Inferno',  min: 1000, cls: 'bg-violet-100 text-violet-700' },
]

function getRank(zaps: number) {
  for (let i = RANK_TIERS.length - 1; i >= 0; i--) {
    if (zaps >= RANK_TIERS[i].min) return RANK_TIERS[i]
  }
  return RANK_TIERS[0]
}

function getNextRank(zaps: number) {
  for (const tier of RANK_TIERS) {
    if (zaps < tier.min) return tier
  }
  return null
}

export default async function ProfilePage({
  params,
}: {
  params: Promise<{ handle: string }>
}) {
  const { handle } = await params

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select(`
      id,
      auth_user_id,
      display_name,
      handle,
      bio,
      avatar_url,
      community_role,
      created_at,
      nexus_regions!nexus_region_id ( name )
    `)
    .eq('handle', handle)
    .eq('is_active', true)
    .maybeSingle()

  if (!profile) notFound()

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const isOwner = !!user && profile.auth_user_id === user.id

  const role = (profile.community_role ?? 'member') as CommunityRole
  const badge = ROLE_BADGE[role] ?? ROLE_BADGE.member
  const initials = getInitials(profile.display_name)
  const regionName = (profile.nexus_regions as unknown as { name: string } | null)?.name
  const joinedDate = new Date(profile.created_at as string).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

  let myProfileId: string | null = null
  let myRole: CommunityRole = 'member'

  if (user) {
    const { data: viewer } = await admin
      .from('profiles')
      .select('id, community_role')
      .eq('auth_user_id', user.id)
      .maybeSingle()
    if (viewer) {
      myProfileId = viewer.id as string
      myRole = (viewer.community_role ?? 'member') as CommunityRole
    }
  }

  // Parallel sidebar data fetches
  const [zapsResult, postsCountResult, circlesResult, eventsResult, dispatchesResult] = await Promise.all([
    admin
      .from('crew_completions')
      .select('points_earned')
      .eq('profile_id', profile.id as string),
    admin
      .from('posts')
      .select('id', { count: 'exact', head: true })
      .eq('author_id', profile.id as string)
      .is('parent_id', null),
    admin
      .from('memberships')
      .select('circles!circle_id ( id, name, slug )')
      .eq('profile_id', profile.id as string)
      .eq('status', 'active'),
    admin
      .from('events')
      .select('id, title, starts_at, location, slug')
      .eq('host_id', profile.id as string)
      .eq('is_cancelled', false)
      .order('starts_at', { ascending: false })
      .limit(3),
    admin
      .from('dispatches')
      .select('id, title, published_at, audience_scope')
      .eq('author_id', profile.id as string)
      .eq('status', 'published')
      .order('published_at', { ascending: false })
      .limit(3),
  ])

  const totalZaps = (zapsResult.data ?? []).reduce((sum: number, r: { points_earned: number }) => sum + (r.points_earned ?? 0), 0)
  const postCount = postsCountResult.count ?? 0
  const circles = ((circlesResult.data ?? []) as unknown as { circles: { id: string; name: string; slug: string } | null }[])
    .map(m => m.circles)
    .filter((c): c is { id: string; name: string; slug: string } => !!c)
  const hostedEvents = (eventsResult.data ?? []) as { id: string; title: string; starts_at: string; location: string | null; slug: string }[]
  const authoredDispatches = (dispatchesResult.data ?? []) as { id: string; title: string; published_at: string; audience_scope: string }[]

  const rank = getRank(totalZaps)
  const nextRank = getNextRank(totalZaps)
  const progress = nextRank ? Math.min(100, Math.round(((totalZaps - rank.min) / (nextRank.min - rank.min)) * 100)) : 100

  return (
    <div>
      {/* ── Profile header ─────────────────────────────────── */}
      <div className="rounded-2xl border border-gray-200/60 dark:border-gray-800/60 bg-white dark:bg-gray-900 shadow-sm p-6 mb-6">
        <div className="flex items-start justify-between gap-4 mb-5">
          <div className="flex items-center gap-4">
            {profile.avatar_url ? (
              <img
                src={profile.avatar_url}
                alt={profile.display_name}
                className="w-20 h-20 rounded-full object-cover shrink-0 ring-2 ring-gray-100 dark:ring-gray-800"
              />
            ) : (
              <div className="w-20 h-20 rounded-full bg-indigo-100 text-indigo-600 text-2xl font-semibold flex items-center justify-center shrink-0">
                {initials}
              </div>
            )}
            <div>
              <h1 className="text-xl font-bold text-gray-900 dark:text-gray-50 leading-tight">
                {profile.display_name}
              </h1>
              <p className="text-sm text-gray-500 mt-0.5">@{profile.handle}</p>
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${badge.cls}`}>
                  {badge.label}
                </span>
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${rank.cls}`}>
                  {rank.name}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {isOwner ? (
              <Link
                href="/settings/profile"
                className="flex items-center gap-1.5 rounded-lg border border-gray-300 dark:border-gray-700 px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                <Pencil className="w-3.5 h-3.5" />
                Edit
              </Link>
            ) : user ? (
              <form action={startConversation.bind(null, profile.id as string)}>
                <button
                  type="submit"
                  className="flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-sm font-medium text-indigo-700 hover:bg-indigo-100 transition-colors"
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                  Message
                </button>
              </form>
            ) : null}
          </div>
        </div>

        {(profile.bio || regionName) && (
          <div className="border-t border-gray-100 dark:border-gray-800 pt-4 space-y-2">
            {profile.bio && (
              <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap leading-relaxed">
                {profile.bio}
              </p>
            )}
            <div className="flex items-center gap-4 flex-wrap">
              {regionName && (
                <span className="flex items-center gap-1 text-xs text-gray-400">
                  <MapPin className="w-3 h-3" /> {regionName}
                </span>
              )}
              <span className="flex items-center gap-1 text-xs text-gray-400">
                <CalendarDays className="w-3 h-3" /> Joined {joinedDate}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* ── Stat tiles ─────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="rounded-2xl border border-indigo-100 dark:border-indigo-900 bg-indigo-50 dark:bg-indigo-950/40 p-4">
          <div className="flex items-center gap-1.5 mb-1">
            <MessageSquare className="w-3.5 h-3.5 text-indigo-500" />
            <span className="text-xs font-semibold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">Posts</span>
          </div>
          <p className="text-2xl font-black text-indigo-700 dark:text-indigo-300">{postCount}</p>
        </div>
        <div className="rounded-2xl border border-amber-100 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/40 p-4">
          <div className="flex items-center gap-1.5 mb-1">
            <Zap className="w-3.5 h-3.5 text-amber-500" />
            <span className="text-xs font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400">Zaps</span>
          </div>
          <p className="text-2xl font-black text-amber-700 dark:text-amber-300">{totalZaps}</p>
        </div>
        <div className="rounded-2xl border border-green-100 dark:border-green-900 bg-green-50 dark:bg-green-950/40 p-4">
          <div className="flex items-center gap-1.5 mb-1">
            <Users className="w-3.5 h-3.5 text-green-500" />
            <span className="text-xs font-semibold uppercase tracking-wider text-green-600 dark:text-green-400">Circles</span>
          </div>
          <p className="text-2xl font-black text-green-700 dark:text-green-300">{circles.length}</p>
        </div>
      </div>

      {/* ── Two-column layout ──────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Main column: composer + timeline */}
        <div className="lg:col-span-2">
          {myProfileId && (
            <div className="mb-5">
              <Composer
                scopeId={profile.id as string}
                visibility="public"
                placeholder={
                  isOwner
                    ? 'Share something...'
                    : `Write on ${profile.display_name}'s wall...`
                }
              />
            </div>
          )}

          <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-600 mb-4">
            Timeline
          </h2>
          <ProfileFeed
            profileId={profile.id as string}
            profileHandle={profile.handle as string}
            myProfileId={myProfileId}
            viewerRole={myRole}
          />
        </div>

        {/* Sidebar */}
        <div className="space-y-5">

          {/* Rank progress */}
          <SidebarCard title="Season rank">
            <div className="px-4 py-3">
              <div className="flex items-center justify-between mb-2">
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${rank.cls}`}>{rank.name}</span>
                {nextRank && (
                  <span className="text-[11px] text-gray-400">{totalZaps} / {nextRank.min} zaps</span>
                )}
              </div>
              <div className="w-full h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-indigo-500 rounded-full transition-all"
                  style={{ width: `${progress}%` }}
                />
              </div>
              {nextRank && (
                <p className="text-[11px] text-gray-400 mt-1.5">
                  {nextRank.min - totalZaps} zaps to <span className="font-medium">{nextRank.name}</span>
                </p>
              )}
            </div>
          </SidebarCard>

          {/* Circles */}
          {circles.length > 0 && (
            <SidebarCard title="Circles">
              <ul className="divide-y divide-gray-50 dark:divide-gray-800">
                {circles.map(c => (
                  <li key={c.id}>
                    <Link
                      href={`/circles/${c.slug}`}
                      className="flex items-center justify-between px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <Users className="w-3.5 h-3.5 text-gray-400" />
                        <span className="text-xs font-medium text-gray-700 dark:text-gray-300">{c.name}</span>
                      </div>
                      <ArrowRight className="w-3 h-3 text-gray-300 dark:text-gray-600" />
                    </Link>
                  </li>
                ))}
              </ul>
            </SidebarCard>
          )}

          {/* Hosted events */}
          {hostedEvents.length > 0 && (
            <SidebarCard title="Events hosted">
              <ul className="divide-y divide-gray-50 dark:divide-gray-800">
                {hostedEvents.map(e => {
                  const d = new Date(e.starts_at)
                  return (
                    <li key={e.id}>
                      <Link
                        href={`/events/${e.slug}`}
                        className="flex items-start gap-3 px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                      >
                        <div className="shrink-0 w-9 text-center">
                          <div className="text-[9px] font-bold uppercase text-indigo-500 leading-none">
                            {d.toLocaleString('default', { month: 'short' })}
                          </div>
                          <div className="text-base font-black text-gray-900 dark:text-gray-50 leading-tight">
                            {d.getDate()}
                          </div>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-gray-700 dark:text-gray-300 line-clamp-1">{e.title}</p>
                          {e.location && <p className="text-[11px] text-gray-400 truncate">{e.location}</p>}
                        </div>
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </SidebarCard>
          )}

          {/* Authored dispatches */}
          {authoredDispatches.length > 0 && (
            <SidebarCard title="Dispatches">
              <ul className="divide-y divide-gray-50 dark:divide-gray-800">
                {authoredDispatches.map(d => (
                  <li key={d.id}>
                    <Link
                      href={`/broadcast/${d.id}`}
                      className="flex items-center gap-2.5 px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                    >
                      <Megaphone className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-gray-700 dark:text-gray-300 line-clamp-1">{d.title}</p>
                        <p className="text-[11px] text-gray-400">{relativeTime(d.published_at)}</p>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </SidebarCard>
          )}
        </div>
      </div>
    </div>
  )
}

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
