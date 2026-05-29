import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Users, MessageSquare, Settings2, Activity, TrendingUp, Zap, Flame, Pencil } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { leaveCircle, joinCircle } from '../actions'
import { CrewGateButton } from '@/components/crew-gate-button'
import { startConversation } from '@/app/(main)/messages/actions'
import { Composer } from '@/components/feed/composer'
import { FeedList } from '@/components/feed/feed-list'
import { UpcomingEventsWidget } from '@/components/events/upcoming-widget'
import { HostInviteButton } from '@/components/circles/host-invite-button'
import { CollapsibleAbout } from '@/components/circles/collapsible-about'
import { CircleHostMenu } from '@/components/circles/circle-host-menu'
import { getCircleCapabilities } from '@/lib/core/load-capabilities'
import { getInitials } from '@/lib/utils'
import { ProfileFlair } from '@/components/profile-flair'
import { type CommunityRole, RoleBadge } from '@/lib/community-roles'

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
  profile: {
    id: string
    display_name: string
    handle: string
    avatar_url: string | null
    community_role: CommunityRole
    current_season_rank: string | null
    current_streak: number
    achievement_count: number
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
      `id, volunteer_role, joined_at,
       profile:profiles!profile_id ( id, display_name, handle, avatar_url, community_role, current_season_rank, current_streak, achievement_count )`
    )
    .eq('circle_id', circle.id)
    .eq('status', 'active')
    .order('joined_at', { ascending: true })

  const members = (rawMembers ?? []) as unknown as MemberRow[]

  // Circle health metrics
  const memberProfileIds = (rawMembers ?? []).map((m: any) => m.profile?.id).filter(Boolean)
  let healthScore = { avgZaps: 0, totalZaps: 0, activeStreaks: 0, totalAchievements: 0, newThisWeek: 0 }

  if (memberProfileIds.length > 0) {
    const [{ data: memberProfiles }, { data: recentJoins }] = await Promise.all([
      admin.from('profiles')
        .select('current_season_zaps, current_streak, achievement_count')
        .in('id', memberProfileIds),
      admin.from('memberships')
        .select('id')
        .eq('circle_id', circle.id)
        .eq('status', 'active')
        .gte('joined_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()),
    ])

    const profiles = (memberProfiles ?? []) as any[]
    const totalZaps = profiles.reduce((s, p) => s + (p.current_season_zaps ?? 0), 0)
    healthScore = {
      avgZaps: profiles.length > 0 ? Math.round(totalZaps / profiles.length) : 0,
      totalZaps,
      activeStreaks: profiles.filter(p => (p.current_streak ?? 0) > 0).length,
      totalAchievements: profiles.reduce((s, p) => s + (p.achievement_count ?? 0), 0),
      newThisWeek: recentJoins?.length ?? 0,
    }
  }

  // Current user
  const {
    data: { user },
  } = await supabase.auth.getUser()

  let myProfileId: string | null = null
  let isMember = false
  let isHost = false
  let isCrew = false

  if (user) {
    const { data: myProfile } = await admin
      .from('profiles')
      .select('id, community_role')
      .eq('auth_user_id', user.id)
      .maybeSingle()
    if (myProfile) {
      myProfileId = myProfile.id
      isMember = members.some((m) => m.profile.id === myProfileId)
      isHost = circle.host?.id === myProfileId
      isCrew = ['crew', 'host', 'guide', 'mentor', 'janitor'].includes((myProfile as { community_role: string }).community_role ?? '')
    }
  }

  // Inline-admin gating via the one capability resolver: host + janitors, plus
  // guides/mentors who lead this circle's hub/nexus (scope-aware).
  const caps = await getCircleCapabilities(circle.id)
  const canManage = caps.has('circle.editSettings')

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

  // Header status pill: forming → green, active → blue, full/closed → red.
  const statusPill = full
    ? { label: 'Full', cls: 'bg-danger-bg text-danger' }
    : circle.status === 'forming'
      ? { label: 'Forming', cls: 'bg-success-bg text-success' }
      : circle.status === 'active'
        ? { label: 'Active', cls: 'bg-info-bg text-info' }
        : { label: circle.status === 'archived' ? 'Closed' : 'Inactive', cls: 'bg-danger-bg text-danger' }

  const typeLabel = String(circle.type)
    .split(/[-_\s]+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')

  return (
    <div>

      {/* ── Header. Back-link + status/type pills on the top line, title
              below, then member count + host and the action buttons, with a
              boxless collapsible description underneath. ──────────────── */}
      <div className="flex items-center gap-2.5 mb-1.5 min-w-0">
        <Link
          href="/circles"
          className="text-xs text-subtle hover:text-muted transition-colors shrink-0"
        >
          ← All circles
        </Link>
        <span className={`text-[11px] px-1.5 py-0.5 rounded-md font-medium shrink-0 ${statusPill.cls}`}>
          {statusPill.label}
        </span>
        <span className="text-[11px] px-1.5 py-0.5 rounded-md bg-signal-bg text-signal-strong font-medium shrink-0">
          {typeLabel}
        </span>
      </div>

      <h1 className="text-2xl font-bold text-text leading-tight truncate mb-3">{circle.name}</h1>

      <div className="flex items-end justify-between gap-4 mb-4">
        {/* Member count + host, beside each other under the title */}
        <div className="min-w-0">
          <div className="flex items-center gap-x-4 gap-y-1 flex-wrap">
            <span className="flex items-center gap-1.5 text-sm text-muted">
              <Users className="w-4 h-4" />
              {circle.member_count} of {circle.member_cap} members
            </span>
            {circle.host && (
              <span className="text-sm text-muted">
                Host{' '}
                <Link
                  href={`/people/${circle.host.handle}`}
                  className="text-primary-strong hover:underline font-medium"
                >
                  {circle.host.display_name}
                </Link>
              </span>
            )}
            {nearCap && !full && (
              <span className="text-[11px] px-1.5 py-0.5 rounded-md bg-warning-bg text-warning font-medium">
                Almost full
              </span>
            )}
          </div>
          <div className="mt-2 h-1.5 max-w-xs rounded-full bg-border overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${full ? 'bg-danger' : 'bg-primary'}`}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>

        {/* Create / join / leave actions */}
        <div className="flex items-center gap-3 shrink-0">
          {canManage && <CircleHostMenu circleId={circle.id} />}

          {isMember && !isHost && (
            <form action={leaveCircle.bind(null, circle.id)}>
              <button
                type="submit"
                className="shrink-0 inline-flex items-center justify-center rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium text-text hover:text-danger hover:border-danger transition-colors"
              >
                Leave
              </button>
            </form>
          )}

          {!isMember && myProfileId && !full && (
            <CrewGateButton
              isCrew={isCrew}
              label="Join circle"
              buttonClassName="shrink-0 inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-hover transition-colors"
            >
              <form action={joinCircle.bind(null, circle.id, circle.slug)}>
                <button
                  type="submit"
                  className="shrink-0 inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-hover transition-colors"
                >
                  Join circle
                </button>
              </form>
            </CrewGateButton>
          )}

          {!isMember && myProfileId && full && (
            <span className="shrink-0 rounded-lg border border-border px-4 py-2 text-sm font-medium text-subtle cursor-not-allowed">
              Circle full
            </span>
          )}
        </div>
      </div>

      {/* ── About (boxless, collapsible) ───────────── */}
      {circle.about ? (
        <div className="mb-6">
          <CollapsibleAbout text={circle.about} />
        </div>
      ) : isHost ? (
        <Link
          href={`/circles/${circle.slug}?edit=true`}
          className="inline-block mb-6 text-xs text-subtle hover:text-primary-strong transition-colors"
        >
          + Add a description for your circle
        </Link>
      ) : null}

      {/* ── Body. One border-t spans the row so the feed and the right
              rail hang off the same line (mirrors Channels). ──────── */}
      <div className="border-t border-border pt-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

          {/* ── Main: circle feed ────────────────────── */}
          <div className="lg:col-span-2">
            <div className="mb-4">
              <h2 className="text-sm font-semibold text-text">Circle Feed</h2>
              <p className="text-xs text-muted leading-relaxed mt-0.5">
                {isHost
                  ? 'Post to your circle. Toggle Announce to broadcast to the wider hub.'
                  : 'Share with everyone in this circle.'}
              </p>
            </div>
            {isMember ? (
              <Composer
                scopeId={circle.id}
                visibility="group"
                placeholder={`Share something with ${circle.name}…`}
                canAnnounce={isHost}
              />
            ) : (
              myProfileId && (
                <div className="mb-4 rounded-xl border border-dashed border-border bg-surface/60 px-4 py-3">
                  <p className="text-xs text-muted leading-relaxed">
                    Join this circle to post and follow it from your feed.
                  </p>
                </div>
              )
            )}
            <FeedList
              circleIds={[circle.id]} showPublicLayer={false}
              myProfileId={myProfileId}
              viewerRole={isHost ? 'host' : isCrew ? 'crew' : 'member'}
              emptyMessage="No posts yet. Be the first to share something."
            />
          </div>

          {/* ── Right rail: host tools, members, events ─ */}
          <div className="space-y-6">

            {/* Host tools */}
            {isHost && (
              <div className="rounded-2xl border border-primary-bg/50 bg-primary-bg/40 dark:bg-primary-bg/10 shadow-sm px-4 py-3">
                <div className="flex items-center gap-1.5 mb-2.5">
                  <Settings2 className="w-3.5 h-3.5 text-primary-strong" />
                  <span className="text-xs font-semibold text-primary-strong uppercase tracking-wider">
                    Host Tools
                  </span>
                </div>
                <div className="flex items-center flex-wrap gap-2">
                  <HostInviteButton circleId={circle.id} />
                  <Link
                    href={`/circles/${circle.slug}?edit=true`}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-medium text-text hover:border-primary-bg dark:hover:border-primary transition-colors"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                    Edit info
                  </Link>
                </div>
              </div>
            )}

            {/* Circle health (host+ only) */}
            {isHost && healthScore.totalZaps > 0 && (
              <div className="rounded-2xl border border-border bg-surface shadow-sm overflow-hidden">
                <div className="px-4 py-2.5 border-b border-border flex items-center gap-2">
                  <Activity className="w-3.5 h-3.5 text-signal" />
                  <h3 className="text-[11px] font-semibold uppercase tracking-wider text-subtle">Circle Health</h3>
                </div>
                <div className="grid grid-cols-2 gap-px bg-surface-elevated">
                  <HealthStat label="Avg Zaps" value={healthScore.avgZaps.toLocaleString()} Icon={Zap} />
                  <HealthStat label="Total Zaps" value={healthScore.totalZaps.toLocaleString()} Icon={TrendingUp} />
                  <HealthStat label="Active Streaks" value={String(healthScore.activeStreaks)} Icon={Flame} />
                  <HealthStat label="Badges Earned" value={String(healthScore.totalAchievements)} Icon={Activity} />
                  <HealthStat label="New This Week" value={String(healthScore.newThisWeek)} Icon={Users} />
                </div>
              </div>
            )}

            {/* Upcoming events */}
            <div>
              <h2 className="text-sm font-semibold text-text mb-3">Circle Events</h2>
              <UpcomingEventsWidget scopeIds={[circle.id]} />
            </div>

            {/* Members */}
            <section>
              <h2 className="text-sm font-semibold text-text mb-3">
                Members
                <span className="ml-2 text-xs font-normal text-subtle">{sorted.length}</span>
              </h2>

              {sorted.length === 0 ? (
                <p className="text-sm text-subtle">No members yet.</p>
              ) : (
                <div className="space-y-0.5">
                  {sorted.map(({ profile, volunteer_role }) => {
                    const memberIsHost = circle.host?.id === profile.id
                    const isSelf = profile.id === myProfileId

                    return (
                      <div
                        key={profile.id}
                        className="flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-surface transition-colors -mx-3 group"
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
                            <div className="w-8 h-8 rounded-full bg-primary-bg text-primary-strong text-xs font-semibold flex items-center justify-center shrink-0 select-none">
                              {getInitials(profile.display_name)}
                            </div>
                          )}

                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-sm font-medium text-text truncate">
                                {profile.display_name}
                              </span>
                              {memberIsHost && (
                                <span className="text-[11px] px-1.5 py-0.5 rounded-md bg-success-bg text-success font-medium">
                                  Host
                                </span>
                              )}
                              {volunteer_role && !memberIsHost && (
                                <RoleBadge role={volunteer_role} className="text-[11px] leading-tight" />
                              )}
                              <ProfileFlair
                                rank={profile.current_season_rank}
                                streak={profile.current_streak}
                                compact
                              />
                            </div>
                            <p className="text-xs text-subtle mt-0.5">@{profile.handle}</p>
                          </div>
                        </Link>

                        {/* Message icon. Visible on hover, hidden for self */}
                        {!isSelf && isMember && (
                          <form action={startConversation.bind(null, profile.id)}>
                            <button
                              type="submit"
                              title={`Message ${profile.display_name}`}
                              className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg text-subtle hover:text-primary-strong hover:bg-primary-bg transition-all"
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
          </div>
        </div>
      </div>
    </div>
  )
}

function HealthStat({ label, value, Icon }: { label: string; value: string; Icon: React.ElementType }) {
  return (
    <div className="bg-surface px-3 py-2.5 text-center">
      <Icon className="w-3.5 h-3.5 text-subtle mx-auto mb-1" />
      <div className="text-lg font-bold text-text leading-none">{value}</div>
      <div className="text-[10px] text-subtle mt-0.5">{label}</div>
    </div>
  )
}
