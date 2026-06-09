import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Users, Activity, TrendingUp, Zap, Flame, MapPin } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { leaveCircle, joinCircle } from '../actions'
import { CrewGateButton } from '@/components/crew/upgrade-lightbox'
import { TeaserGate } from '@/components/teaser-gate'
import { teaserAllowed, TEASER_PREVIEW_SECONDS } from '@/lib/teaser'
import { Composer } from '@/components/feed/composer'
import { FeedList } from '@/components/feed/feed-list'
import { UpcomingEventsWidget } from '@/components/events/upcoming-widget'
import { HostInviteButton } from '@/components/circles/host-invite-button'
import { HostInviteEmail } from '@/components/circles/host-invite-email'
import { CollapsibleAbout } from '@/components/circles/collapsible-about'
import { CircleHostMenu } from '@/components/circles/circle-host-menu'
import { CircleMembersList } from '@/components/circles/circle-members-list'
import { getCircleCapabilities } from '@/lib/core/load-capabilities'
import { isPaidViewer } from '@/lib/core/viewer-hats'
import { getCircleActivePractice, listPublicPractices } from '@/lib/practices'
import { LogPracticeButton } from '@/components/practice/log-practice-button'
import { DetailTemplate } from '@/components/templates/detail-template'
import { ModuleCard } from '@/components/modules/module-card'
import { isoDaysAgo } from '@/lib/utils'
import { type CommunityRole } from '@/lib/community-roles'
import { ClaimCircle } from '@/components/circles/claim-circle'
import { CircleCover } from '@/components/circles/circle-cover'

type CircleDetail = {
  id: string
  name: string
  slug: string
  about: string | null
  image_url: string | null
  type: 'in-person' | 'online'
  member_count: number
  member_cap: number
  status: string
  is_demo: boolean
  sidebar_order: string[] | null
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
      `id, name, slug, about, image_url, type, member_count, member_cap, status, is_demo, sidebar_order,
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
  const memberProfileIds = members.map((m) => m.profile?.id).filter(Boolean)
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
        .gte('joined_at', isoDaysAgo(7)),
    ])

    const profiles = (memberProfiles ?? []) as Array<{
      current_season_zaps: number | null
      current_streak: number | null
      achievement_count: number | null
    }>
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
      isCrew = await isPaidViewer()
    }
  }

  // Inline-admin gating via the one capability resolver: host + janitors, plus
  // guides/mentors who lead this circle's hub/nexus (scope-aware).
  const caps = await getCircleCapabilities(circle.id)
  const canManage = caps.has('circle.editSettings')

  // This week's practice (host-assigned). Library only needed for the host picker.
  const [circlePractice, practiceLibrary] = await Promise.all([
    getCircleActivePractice(circle.id),
    canManage || circle.is_demo ? listPublicPractices() : Promise.resolve([]),
  ])

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

  // Right-rail blocks, keyed. Build only the blocks this viewer should see, then
  // render them in circle.sidebar_order (host-chosen). Gating + content unchanged.
  const railMap: Record<string, React.ReactNode> = {
    members: (
      <ModuleCard title="Members" badge={String(sorted.length)}>
        <CircleMembersList
          members={sorted}
          hostId={circle.host?.id ?? null}
          myProfileId={myProfileId}
          isMember={isMember}
        />
      </ModuleCard>
    ),
  }

  if (canManage && healthScore.totalZaps > 0) {
    railMap.health = (
      <ModuleCard title="Circle health">
        <div className="grid grid-cols-2 gap-2">
          <HealthStat label="Avg zaps" value={healthScore.avgZaps.toLocaleString()} Icon={Zap} />
          <HealthStat label="Total zaps" value={healthScore.totalZaps.toLocaleString()} Icon={TrendingUp} />
          <HealthStat label="Active streaks" value={String(healthScore.activeStreaks)} Icon={Flame} />
          <HealthStat label="Badges earned" value={String(healthScore.totalAchievements)} Icon={Activity} />
          <HealthStat label="New this week" value={String(healthScore.newThisWeek)} Icon={Users} />
        </div>
      </ModuleCard>
    )
  }

  if (circlePractice || canManage) {
    railMap.practice = (
      <ModuleCard title="This week's practice">
        {circlePractice ? (
          <>
            <p className="font-medium text-text">{circlePractice.title}</p>
            {circlePractice.description && (
              <p className="mt-0.5 text-sm text-muted">{circlePractice.description}</p>
            )}
            {isMember && (
              <div className="mt-3">
                <LogPracticeButton practiceId={circlePractice.id} circleId={circle.id} />
              </div>
            )}
          </>
        ) : (
          <p className="text-sm text-muted">No practice set yet.</p>
        )}
      </ModuleCard>
    )
  }

  railMap.events = (
    <ModuleCard title="Upcoming events">
      <UpcomingEventsWidget scopeIds={[circle.id]} />
    </ModuleCard>
  )

  if (canManage) {
    railMap.invite = (
      <ModuleCard title="Invite a friend">
        <p className="mb-3 text-xs leading-relaxed text-muted">
          Bring someone into {circle.name}. (Edit the circle itself from
          {' '}<span className="font-medium text-text">Settings</span> at the top.)
        </p>
        <HostInviteButton circleId={circle.id} />
        <div className="mt-2">
          <HostInviteEmail circleId={circle.id} />
        </div>
      </ModuleCard>
    )
  }

  const DEFAULT_RAIL_ORDER = ['members', 'health', 'practice', 'events', 'invite']
  const savedOrder = circle.sidebar_order ?? DEFAULT_RAIL_ORDER
  // Saved order first (only keys present in the map), then any new map keys the
  // saved order doesn't mention — so a freshly-added block never goes missing.
  const railKeys = [
    ...savedOrder.filter((k) => k in railMap),
    ...Object.keys(railMap).filter((k) => !savedOrder.includes(k)),
  ]
  const railBlocks = railKeys.map((k) => <div key={k}>{railMap[k]}</div>)

  return (
    <div>
      {/* Demo circles invite a real member to claim + host them in place. */}
      {circle.is_demo && user && (
        <ClaimCircle
          circleId={circle.id}
          name={circle.name}
          about={circle.about}
          practices={practiceLibrary.map((p) => ({ id: p.id, title: p.title }))}
        />
      )}

      <CircleCover imageUrl={circle.image_url} name={circle.name} />

      {/* Unified Detail header: title + status/type badges, member/host + capacity
          below, capability-gated actions right. Editing is in the Settings panel. */}
      <DetailTemplate
        title={circle.name}
        badges={
          <>
            <span className={`text-xs px-1.5 py-0.5 rounded-md font-medium ${statusPill.cls}`}>
              {statusPill.label}
            </span>
            <span className="text-xs px-1.5 py-0.5 rounded-md bg-signal-bg text-signal-strong font-medium">
              {typeLabel}
            </span>
            {nearCap && !full && (
              <span className="text-xs px-1.5 py-0.5 rounded-md bg-warning-bg text-warning font-medium">
                Almost full
              </span>
            )}
          </>
        }
        subtitle={
          <>
            {/* Place-first context: the locale, then the Hub this circle belongs to.
                Hubs/Nexuses surface here as the emergent "where this sits", never as
                primary nav — a member reads it as place, not an org chart (IA §3a/§4). */}
            {circle.hub && (
              <div className="mb-1.5 flex items-center gap-1.5 text-sm text-subtle">
                <MapPin className="w-4 h-4 shrink-0" />
                <span className="truncate">
                  {circle.hub.nexus?.outpost?.name && <>{circle.hub.nexus.outpost.name} · </>}
                  <Link href={`/hubs/${circle.hub.slug}`} className="hover:text-primary-strong hover:underline">
                    {circle.hub.name}
                  </Link>
                </span>
              </div>
            )}
            <div className="flex items-center gap-x-4 gap-y-1 flex-wrap">
              <span className="flex items-center gap-1.5">
                <Users className="w-4 h-4" />
                {circle.member_count} of {circle.member_cap} members
              </span>
              {circle.host && (
                <span>
                  Host{' '}
                  <Link
                    href={`/people/${circle.host.handle}`}
                    className="text-primary-strong hover:underline font-medium"
                  >
                    {circle.host.display_name}
                  </Link>
                </span>
              )}
            </div>
            <div className="mt-2 h-1.5 max-w-xs rounded-full bg-border overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${full ? 'bg-danger' : 'bg-primary'}`}
                style={{ width: `${pct}%` }}
              />
            </div>
          </>
        }
        actions={
          <>
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
                buttonClassName="shrink-0 inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary hover:bg-primary-hover transition-colors"
              >
                <form action={joinCircle.bind(null, circle.id, circle.slug)}>
                  <button
                    type="submit"
                    className="shrink-0 inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary hover:bg-primary-hover transition-colors"
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
          </>
        }
      >
        {/* ── About (boxless, collapsible) ───────────── */}
        {circle.about && (
          <div className="mb-6">
            <CollapsibleAbout text={circle.about} />
          </div>
        )}

        {/* ── Two-column body (event / social-profile layout): the circle's
                conversation on the left (2/3), its info rail on the right (1/3). */}
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
          {/* LEFT — the circle's conversation + announcements. */}
          <div className="lg:col-span-2">
            <TeaserGate
              allowed={teaserAllowed({ role: isCrew ? 'crew' : 'member', hasAccess: isMember })}
              resourceKey={`circle:${circle.id}`}
              previewSeconds={TEASER_PREVIEW_SECONDS}
              title="Crew unlocks the full circle"
              body="Take a look around. Crew members can post, join the conversation, and connect with everyone here."
            >
              <section>
                <div className="mb-4">
                  <h2 className="text-sm font-bold text-text">Circle feed</h2>
                  <p className="mt-0.5 text-xs leading-relaxed text-muted">
                    {canManage
                      ? 'Post to your circle. Toggle Announce to broadcast to the wider hub.'
                      : 'Conversation and event announcements for everyone in this circle.'}
                  </p>
                </div>
                {isMember ? (
                  <Composer
                    scopeId={circle.id}
                    visibility="group"
                    placeholder={`Share something with ${circle.name}…`}
                    canAnnounce={canManage}
                  />
                ) : (
                  myProfileId && (
                    <div className="mb-4 rounded-2xl border border-dashed border-border bg-surface/60 px-4 py-3">
                      <p className="text-xs leading-relaxed text-muted">
                        Join this circle to post and follow it from your feed.
                      </p>
                    </div>
                  )
                )}
                <FeedList
                  circleIds={[circle.id]} showPublicLayer={false}
                  myProfileId={myProfileId}
                  viewerRole={canManage ? 'host' : isCrew ? 'crew' : 'member'}
                  emptyMessage="No posts yet. Be the first to share something."
                />
              </section>
            </TeaserGate>
          </div>

          {/* RIGHT — the circle's info rail. Each block is keyed; the host can
                reorder them via Settings (circle.sidebar_order). We render in saved
                order, filtered to the blocks this viewer actually sees, then append
                any new block missing from the saved order so it never disappears. */}
          <aside className="space-y-8">{railBlocks}</aside>
        </div>
      </DetailTemplate>
    </div>
  )
}

function HealthStat({ label, value, Icon }: { label: string; value: string; Icon: React.ElementType }) {
  return (
    <div className="rounded-2xl bg-surface-elevated/60 px-3 py-2.5 text-center">
      <Icon className="w-3.5 h-3.5 text-subtle mx-auto mb-1" />
      <div className="text-lg font-bold text-text leading-none tabular-nums">{value}</div>
      <div className="text-xs text-subtle mt-1">{label}</div>
    </div>
  )
}
