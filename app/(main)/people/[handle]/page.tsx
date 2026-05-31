import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { startConversation } from '@/app/(main)/messages/actions'
import { Composer } from '@/components/feed/composer'
import { ProfileFeed } from '@/components/feed/profile-feed'
import { getInitials, relativeTime } from '@/lib/utils'
import { FriendButton, type FriendState } from './friend-button'
import { BlockButton } from './block-button'
import { hasBlocked } from '@/lib/blocking'
import {
  MessageSquare, CalendarDays, Zap, Users, Megaphone, Radio,
  MapPin, Pencil, ArrowRight, Trophy, Star, Sparkles, Flame,
} from 'lucide-react'

import { type CommunityRole, RoleBadge } from '@/lib/community-roles'
import { getProfileCapabilities } from '@/lib/core/load-capabilities'
import { ModerateProfileButton } from './moderate-profile-button'

const RANK_TIERS = [
  { name: 'Ghost',    min: 0,    cls: 'bg-surface-elevated text-muted',     bar: 'bg-gray-400' },
  { name: 'Spark',    min: 50,   cls: 'bg-warning-bg text-warning',   bar: 'bg-primary' },
  { name: 'Flame',    min: 150,  cls: 'bg-warning-bg text-warning', bar: 'bg-primary' },
  { name: 'Blaze',    min: 400,  cls: 'bg-danger-bg text-danger',       bar: 'bg-danger' },
  { name: 'Inferno',  min: 1000, cls: 'bg-signal-bg text-signal-strong', bar: 'bg-signal' },
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

  const profileId = profile.id as string

  // Capability-gated moderator edit: profile.edit on a profile you don't own = janitor.
  const profileCaps = await getProfileCapabilities(profileId)
  const canModerateProfile = !isOwner && profileCaps.has('profile.edit')

  // Friendship state between viewer and this profile
  let friendState: FriendState = { kind: 'none' }
  if (myProfileId && myProfileId !== profileId) {
    const pair = myProfileId < profileId
      ? { user_a_id: myProfileId, user_b_id: profileId }
      : { user_a_id: profileId, user_b_id: myProfileId }
    const { data: f } = await admin
      .from('friendships')
      .select('status, requested_by')
      .match(pair)
      .maybeSingle()
    if (f) {
      if (f.status === 'accepted') friendState = { kind: 'accepted' }
      else if (f.requested_by === myProfileId) friendState = { kind: 'pending_outgoing' }
      else friendState = { kind: 'pending_incoming' }
    }
  }

  // Block state between viewer and this profile.
  let isBlocked = false
  if (myProfileId && myProfileId !== profileId) {
    isBlocked = await hasBlocked(myProfileId, profileId)
  }

  const [zapsResult, completionsCountResult, postsCountResult, circlesResult, channelsResult, eventsResult, dispatchesResult, practicesCountResult, streakResult] = await Promise.all([
    admin.from('crew_completions').select('zaps_earned').eq('profile_id', profileId),
    admin.from('crew_completions').select('id', { count: 'exact', head: true }).eq('profile_id', profileId),
    admin.from('posts').select('id', { count: 'exact', head: true }).eq('author_id', profileId).is('parent_id', null).is('hidden_at', null),
    admin.from('memberships').select('circles!circle_id ( id, name, slug )').eq('profile_id', profileId).eq('status', 'active'),
    admin.from('channel_memberships').select('channels!channel_id ( id, name )').eq('profile_id', profileId).eq('status', 'active'),
    admin.from('events').select('id, title, starts_at, location, slug').eq('host_id', profileId).eq('is_cancelled', false).order('starts_at', { ascending: false }).limit(3),
    admin.from('dispatches').select('id, title, published_at, audience_scope').eq('author_id', profileId).eq('status', 'published').is('hidden_at', null).order('published_at', { ascending: false }).limit(3),
    admin.from('engagement_events').select('id', { count: 'exact', head: true }).eq('actor_profile_id', profileId).eq('event_type', 'practice.verified'),
    admin.from('profiles').select('current_streak').eq('id', profileId).maybeSingle(),
  ])

  const totalZaps = (zapsResult.data ?? []).reduce((sum: number, r: { zaps_earned: number }) => sum + (r.zaps_earned ?? 0), 0)
  const tasksCompleted = completionsCountResult.count ?? 0
  const postCount = postsCountResult.count ?? 0
  const verifiedPractices = practicesCountResult.count ?? 0
  const currentStreak = (streakResult.data as { current_streak: number } | null)?.current_streak ?? 0

  const circles = ((circlesResult.data ?? []) as unknown as { circles: { id: string; name: string; slug: string } | null }[])
    .map(m => m.circles).filter((c): c is { id: string; name: string; slug: string } => !!c)

  const channels = ((channelsResult.data ?? []) as unknown as { channels: { id: string; name: string } | null }[])
    .map(m => m.channels).filter((c): c is { id: string; name: string } => !!c)

  const hostedEvents = (eventsResult.data ?? []) as { id: string; title: string; starts_at: string; location: string | null; slug: string }[]
  const authoredDispatches = (dispatchesResult.data ?? []) as { id: string; title: string; published_at: string; audience_scope: string }[]

  const rank = getRank(totalZaps)
  const nextRank = getNextRank(totalZaps)
  const progress = nextRank ? Math.min(100, Math.round(((totalZaps - rank.min) / (nextRank.min - rank.min)) * 100)) : 100

  return (
    <div>
      {/* ── Cover image + avatar header ────────────────────── */}
      <div className="rounded-2xl border border-border bg-surface shadow-sm overflow-hidden mb-6">
        {/* Cover */}
        <div className="relative h-32 sm:h-40 bg-gradient-to-br from-primary via-signal to-signal-strong">
          <div className="absolute inset-0 bg-[url('/images/hero.jpg')] bg-cover bg-center opacity-30 mix-blend-overlay" />
        </div>

        {/* Avatar overlapping the cover */}
        <div className="relative px-6 pb-5">
          <div className="flex items-end justify-between -mt-12 mb-4">
            <div className="shrink-0">
              {profile.avatar_url ? (
                <img
                  src={profile.avatar_url}
                  alt={profile.display_name}
                  className="w-24 h-24 rounded-full object-cover ring-4 ring-surface"
                />
              ) : (
                <div className="w-24 h-24 rounded-full bg-primary-bg text-primary-strong text-3xl font-semibold flex items-center justify-center ring-4 ring-surface">
                  {initials}
                </div>
              )}
            </div>
            <div className="relative flex items-center gap-2 shrink-0 pb-1">
              {isOwner ? (
                <Link
                  href="/settings/profile"
                  className="flex items-center gap-1.5 rounded-lg border border-border-strong px-3 py-1.5 text-sm font-medium text-text hover:bg-surface-elevated transition-colors"
                >
                  <Pencil className="w-3.5 h-3.5" />
                  Edit
                </Link>
              ) : user ? (
                <>
                  {!isBlocked && <FriendButton targetProfileId={profileId} state={friendState} />}
                  {!isBlocked && friendState.kind === 'accepted' && (
                    <form action={startConversation.bind(null, profileId)}>
                      <button
                        type="submit"
                        className="flex items-center gap-1.5 rounded-lg border border-primary-bg bg-primary-bg px-3 py-1.5 text-sm font-medium text-primary-strong hover:bg-primary-bg transition-colors"
                      >
                        <MessageSquare className="w-3.5 h-3.5" />
                        Message
                      </button>
                    </form>
                  )}
                  {!isOwner && <BlockButton profileId={profileId} blocked={isBlocked} />}
                  {canModerateProfile && (
                    <ModerateProfileButton
                      profileId={profileId}
                      initialName={profile.display_name}
                      initialBio={profile.bio ?? ''}
                    />
                  )}
                </>
              ) : null}
            </div>
          </div>

          {/* Identity */}
          <h1 className="text-xl font-bold text-text leading-tight">
            {profile.display_name}
          </h1>
          <p className="text-sm text-muted mt-0.5">@{profile.handle}</p>

          <div className="flex items-center gap-2 mt-2.5 flex-wrap">
            <RoleBadge role={role} className="text-xs leading-tight" />
            <span className={`px-2.5 py-0.5 rounded-md text-xs font-medium ${rank.cls}`}>
              {rank.name}
            </span>
          </div>

          {(profile.bio || regionName) && (
            <div className="mt-4 space-y-2">
              {profile.bio && (
                <p className="text-sm text-text whitespace-pre-wrap leading-relaxed">
                  {profile.bio}
                </p>
              )}
              <div className="flex items-center gap-4 flex-wrap">
                {regionName && (
                  <span className="flex items-center gap-1 text-xs text-subtle">
                    <MapPin className="w-3 h-3" /> {regionName}
                  </span>
                )}
                <span className="flex items-center gap-1 text-xs text-subtle">
                  <CalendarDays className="w-3 h-3" /> Joined {joinedDate}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Two-column layout ──────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Main column: composer + timeline */}
        <div className="lg:col-span-2">
          {myProfileId && (
            <div className="mb-5">
              <Composer
                scopeId={profileId}
                visibility="public"
                placeholder={
                  isOwner
                    ? 'Share something...'
                    : `Write on ${profile.display_name}'s wall...`
                }
              />
            </div>
          )}

          <h2 className="text-xs font-semibold uppercase tracking-widest text-subtle mb-4">
            Timeline
          </h2>
          <ProfileFeed
            profileId={profileId}
            profileHandle={profile.handle as string}
            myProfileId={myProfileId}
            viewerRole={myRole}
          />
        </div>

        {/* ── Right sidebar ────────────────────────────────── */}
        <div className="space-y-4">

          {/* Stat tiles - compact stacked */}
          <div className="grid grid-cols-2 gap-2">
            <MiniStat icon={Sparkles} label="Practices" value={verifiedPractices} color="green" />
            <MiniStat icon={Flame} label="Streak" value={currentStreak} color="amber" />
            <MiniStat icon={MessageSquare} label="Posts" value={postCount} color="indigo" />
            <MiniStat icon={Zap} label="Zaps" value={totalZaps} color="amber" />
            <MiniStat icon={Trophy} label="Tasks" value={tasksCompleted} color="green" />
            <MiniStat icon={Users} label="Circles" value={circles.length} color="violet" />
          </div>

          {/* Season rank */}
          <SidebarCard title="Season rank">
            <div className="px-4 py-3">
              <div className="flex items-center justify-between mb-2">
                <span className={`text-xs font-bold px-2 py-0.5 rounded-md ${rank.cls}`}>{rank.name}</span>
                <span className="text-[11px] text-subtle flex items-center gap-1">
                  <Zap className="w-3 h-3 text-primary" /> {totalZaps}
                </span>
              </div>
              <div className="w-full h-2 bg-surface-elevated rounded-full overflow-hidden">
                <div className={`h-full rounded-full transition-all ${rank.bar}`} style={{ width: `${progress}%` }} />
              </div>
              {nextRank ? (
                <p className="text-[11px] text-subtle mt-1.5">
                  {nextRank.min - totalZaps} zaps to <span className="font-medium">{nextRank.name}</span>
                </p>
              ) : (
                <p className="text-[11px] text-subtle mt-1.5">Max rank reached</p>
              )}
            </div>
          </SidebarCard>

          {/* Rewards / gamification */}
          <SidebarCard title="Rewards">
            <div className="px-4 py-3 space-y-2.5">
              <RewardBadge icon={Star} label="Early Adopter" description="Joined during beta" earned />
              <RewardBadge icon={MessageSquare} label="First Post" description="Made your first post" earned={postCount > 0} />
              <RewardBadge icon={Users} label="Circle Up" description="Joined a circle" earned={circles.length > 0} />
              <RewardBadge icon={Zap} label="Spark" description="Earned 50 zaps" earned={totalZaps >= 50} />
              <RewardBadge icon={Trophy} label="Task Master" description="Completed 10 tasks" earned={tasksCompleted >= 10} />
            </div>
          </SidebarCard>

          {/* Circles & channels */}
          {(circles.length > 0 || channels.length > 0) && (
            <SidebarCard title="Groups">
              <ul className="divide-y divide-border">
                {circles.map(c => (
                  <li key={c.id}>
                    <Link href={`/circles/${c.slug}`} className="flex items-center gap-2.5 px-4 py-2 hover:bg-surface-elevated transition-colors">
                      <Users className="w-3.5 h-3.5 text-primary-strong shrink-0" />
                      <span className="text-xs font-medium text-text truncate">{c.name}</span>
                      <ArrowRight className="w-3 h-3 text-subtle ml-auto shrink-0" />
                    </Link>
                  </li>
                ))}
                {channels.map(c => (
                  <li key={c.id}>
                    <Link href={`/channels/${c.id}`} className="flex items-center gap-2.5 px-4 py-2 hover:bg-surface-elevated transition-colors">
                      <Radio className="w-3.5 h-3.5 text-success shrink-0" />
                      <span className="text-xs font-medium text-text truncate">{c.name}</span>
                      <ArrowRight className="w-3 h-3 text-subtle ml-auto shrink-0" />
                    </Link>
                  </li>
                ))}
              </ul>
            </SidebarCard>
          )}

          {/* Events hosted */}
          {hostedEvents.length > 0 && (
            <SidebarCard title="Events">
              <ul className="divide-y divide-border">
                {hostedEvents.map(e => {
                  const d = new Date(e.starts_at)
                  return (
                    <li key={e.id}>
                      <Link href={`/events/${e.slug}`} className="flex items-start gap-3 px-4 py-2.5 hover:bg-surface-elevated transition-colors">
                        <div className="shrink-0 w-9 text-center">
                          <div className="text-[9px] font-bold uppercase text-primary leading-none">
                            {d.toLocaleString('default', { month: 'short' })}
                          </div>
                          <div className="text-base font-black text-text leading-tight">
                            {d.getDate()}
                          </div>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-text line-clamp-1">{e.title}</p>
                          {e.location && <p className="text-[11px] text-subtle truncate">{e.location}</p>}
                        </div>
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </SidebarCard>
          )}

          {/* Dispatches authored */}
          {authoredDispatches.length > 0 && (
            <SidebarCard title="Dispatches">
              <ul className="divide-y divide-border">
                {authoredDispatches.map(d => (
                  <li key={d.id}>
                    <Link href={`/broadcast/${d.id}`} className="flex items-center gap-2.5 px-4 py-2.5 hover:bg-surface-elevated transition-colors">
                      <Megaphone className="w-3.5 h-3.5 text-primary-strong shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-text line-clamp-1">{d.title}</p>
                        <p className="text-[11px] text-subtle">{relativeTime(d.published_at)}</p>
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

function MiniStat({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: React.ElementType
  label: string
  value: number
  color: string
}) {
  const colors: Record<string, string> = {
    indigo: 'border-primary-bg bg-primary-bg text-primary-strong',
    amber:  'border-warning-bg bg-warning-bg/40 text-warning',
    green:  'border-success bg-success-bg/40 text-success',
    violet: 'border-violet-100 bg-signal-bg/40 text-signal-strong',
  }
  const cls = colors[color] ?? colors.indigo
  return (
    <div className={`rounded-xl border p-3 ${cls}`}>
      <div className="flex items-center gap-1.5 mb-0.5">
        <Icon className="w-3 h-3" />
        <span className="text-[10px] font-semibold uppercase tracking-wider">{label}</span>
      </div>
      <p className="text-xl font-black">{value}</p>
    </div>
  )
}

function RewardBadge({
  icon: Icon,
  label,
  description,
  earned,
}: {
  icon: React.ElementType
  label: string
  description: string
  earned: boolean
}) {
  return (
    <div className={`flex items-center gap-3 ${earned ? '' : 'opacity-35'}`}>
      <div className={`shrink-0 w-7 h-7 rounded-lg flex items-center justify-center ${earned ? 'bg-warning-bg dark:bg-warning-bg/40' : 'bg-surface-elevated'}`}>
        <Icon className={`w-3.5 h-3.5 ${earned ? 'text-primary' : 'text-subtle'}`} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-text">{label}</p>
        <p className="text-[10px] text-subtle">{description}</p>
      </div>
      {earned && <Star className="w-3 h-3 text-primary fill-amber-400 shrink-0" />}
    </div>
  )
}

function SidebarCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-surface shadow-sm overflow-hidden">
      <div className="px-4 py-2.5 border-b border-border">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-subtle">{title}</h3>
      </div>
      {children}
    </div>
  )
}
