import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Users, MessageSquare, Settings2, Activity, TrendingUp, Zap, Flame } from 'lucide-react'
import { ContextActions } from '@/components/context-actions'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { leaveCircle, joinCircle } from '../actions'
import { CrewGateButton } from '@/components/crew-gate-button'
import { startConversation } from '@/app/(main)/messages/actions'
import { Composer } from '@/components/feed/composer'
import { FeedList } from '@/components/feed/feed-list'
import { UpcomingEventsWidget } from '@/components/events/upcoming-widget'
import { HierarchyBreadcrumb } from '@/components/hierarchy/breadcrumb'
import { StatusBadge } from '@/components/groups/status-badge'
import { HostInviteButton } from '@/components/circles/host-invite-button'
import { getInitials } from '@/lib/utils'
import { ProfileFlair } from '@/components/profile-flair'

type CommunityRole = 'member' | 'crew' | 'host' | 'guide' | 'mentor'

const ROLE_BADGE: Record<CommunityRole, { label: string; cls: string }> = {
  member: { label: 'Member', cls: 'bg-surface-elevated text-muted' },
  crew:   { label: 'Crew',   cls: 'bg-signal-bg text-signal-strong' },
  host:   { label: 'Host',   cls: 'bg-success-bg text-success' },
  guide:  { label: 'Guide',  cls: 'bg-signal-bg text-signal-strong' },
  mentor: { label: 'Mentor', cls: 'bg-warning-bg text-warning' },
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
      `id, volunteer_role, joined_at, is_crew_lead,
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
    <div>

      {/* Back */}
      <Link
        href="/circles"
        className="inline-flex items-center gap-1 text-xs text-subtle hover:text-muted mb-4 transition-colors"
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
              <h1 className="text-xl font-semibold text-text">{circle.name}</h1>
              <StatusBadge status={circle.status} />
              <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-surface-elevated text-muted font-medium">
                {circle.type}
              </span>
            </div>

            {circle.host && (
              <p className="mt-1 text-xs text-muted">
                Host:{' '}
                <Link
                  href={`/people/${circle.host.handle}`}
                  className="text-primary-strong hover:underline"
                >
                  {circle.host.display_name}
                </Link>
              </p>
            )}
          </div>

          {isHost && (
            <ContextActions
              role="host"
              context={{ type: 'circle', id: circle.id, slug: circle.slug, isHost: true }}
            />
          )}

          {isMember && !isHost && (
            <form action={leaveCircle.bind(null, circle.id)}>
              <button
                type="submit"
                className="shrink-0 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted hover:text-danger hover:border-danger hover:bg-danger-bg transition-colors"
              >
                Leave
              </button>
            </form>
          )}

          {!isMember && myProfileId && !full && (
            <CrewGateButton
              isCrew={isCrew}
              label="Join circle"
              buttonClassName="shrink-0 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white hover:bg-primary-hover transition-colors inline-flex items-center gap-1"
            >
              <form action={joinCircle.bind(null, circle.id, circle.slug)}>
                <button
                  type="submit"
                  className="shrink-0 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white hover:bg-primary-hover transition-colors"
                >
                  Join circle
                </button>
              </form>
            </CrewGateButton>
          )}

          {!isMember && myProfileId && full && (
            <span className="shrink-0 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-subtle cursor-not-allowed">
              Circle full
            </span>
          )}
        </div>

        {/* Capacity */}
        <div className="mt-4">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="flex items-center gap-1.5 text-sm text-muted">
              <Users className="w-4 h-4" />
              {circle.member_count} of {circle.member_cap} members
            </span>
            {nearCap && !full && (
              <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-warning-bg text-warning font-medium">
                Almost full
              </span>
            )}
            {full && (
              <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-danger-bg text-danger font-medium">
                Full
              </span>
            )}
          </div>
          <div className="mt-2 h-1.5 max-w-xs rounded-full bg-surface-elevated overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                full ? 'bg-red-400' : nearCap ? 'bg-orange-400' : 'bg-primary'
              }`}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      </div>

      {/* ── About ──────────────────────────────────── */}
      {circle.about ? (
        <div className="mb-6 rounded-2xl border border-border/80 bg-surface shadow-sm px-4 py-3">
          <p className="text-sm text-text leading-relaxed whitespace-pre-wrap">
            {circle.about}
          </p>
        </div>
      ) : isHost ? (
        <div className="mb-6 rounded-2xl border border-dashed border-border/60 bg-surface/50 dark:bg-canvas/50 px-4 py-3">
          <p className="text-xs text-subtle">+ Add a description for your circle</p>
        </div>
      ) : null}

      {/* ── Host tools ─────────────────────────────── */}
      {isHost && (
        <div className="mb-6 rounded-2xl border border-primary-bg/50 bg-primary-bg/40 dark:bg-primary-bg/10 shadow-sm px-4 py-3">
          <div className="flex items-center gap-1.5 mb-2.5">
            <Settings2 className="w-3.5 h-3.5 text-primary-strong" />
            <span className="text-xs font-semibold text-primary-strong uppercase tracking-wider">
              Host Tools
            </span>
          </div>
          <div className="flex items-center flex-wrap gap-2">
            <HostInviteButton circleId={circle.id} />
          </div>
        </div>
      )}

      {/* ── Circle Health Score (host+ only) ──────── */}
      {isHost && healthScore.totalZaps > 0 && (
        <div className="mb-6 rounded-2xl border border-border bg-surface shadow-sm overflow-hidden">
          <div className="px-4 py-2.5 border-b border-border flex items-center gap-2">
            <Activity className="w-3.5 h-3.5 text-signal" />
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-subtle">Circle Health</h3>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-px bg-surface-elevated">
            <HealthStat label="Avg Zaps" value={healthScore.avgZaps.toLocaleString()} Icon={Zap} />
            <HealthStat label="Total Zaps" value={healthScore.totalZaps.toLocaleString()} Icon={TrendingUp} />
            <HealthStat label="Active Streaks" value={String(healthScore.activeStreaks)} Icon={Flame} />
            <HealthStat label="Badges Earned" value={String(healthScore.totalAchievements)} Icon={Activity} />
            <HealthStat label="New This Week" value={String(healthScore.newThisWeek)} Icon={Users} />
          </div>
        </div>
      )}

      {/* ── Members ────────────────────────────────── */}
      <section>
        <h2 className="text-sm font-semibold text-text mb-3">
          Members
          <span className="ml-2 text-xs font-normal text-subtle">{sorted.length}</span>
        </h2>

        {sorted.length === 0 ? (
          <p className="text-sm text-subtle">No members yet.</p>
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
                  className="flex items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-surface transition-colors -mx-3 group"
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
                          <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-success-bg text-success font-medium">
                            Host
                          </span>
                        )}
                        {is_crew_lead && !memberIsHost && (
                          <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-warning-bg text-warning font-medium">
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
                        <ProfileFlair
                          rank={profile.current_season_rank}
                          streak={profile.current_streak}
                          compact
                        />
                      </div>
                      <p className="text-xs text-subtle mt-0.5">@{profile.handle}</p>
                    </div>
                  </Link>

                  {/* Message icon — visible on hover, hidden for self */}
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

      {/* ── Upcoming events ────────────────────────── */}
      <UpcomingEventsWidget scopeIds={[circle.id]} />

      {/* ── Feed ───────────────────────────────────── */}
      <section className="mt-8 border-t border-border pt-6">
        <h2 className="text-sm font-semibold text-text mb-4">Circle Feed</h2>
        {isMember && (
          <Composer
            scopeId={circle.id}
            visibility="group"
            placeholder={`Share something with ${circle.name}…`}
            canAnnounce={isHost}
          />
        )}
        <FeedList
          circleIds={[circle.id]} showPublicLayer={false}
          myProfileId={myProfileId}
          viewerRole={isHost ? 'host' : isCrew ? 'crew' : 'member'}
          emptyMessage="No posts yet. Be the first to share something."
        />
      </section>
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
