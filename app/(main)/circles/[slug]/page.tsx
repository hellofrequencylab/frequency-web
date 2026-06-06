import { notFound } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import { Users, MessageSquare, Activity, TrendingUp, Zap, Flame, Pencil, MapPin } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { leaveCircle, joinCircle } from '../actions'
import { CrewGateButton } from '@/components/crew/upgrade-lightbox'
import { TeaserGate } from '@/components/teaser-gate'
import { teaserAllowed, TEASER_PREVIEW_SECONDS } from '@/lib/teaser'
import { startConversation } from '@/app/(main)/messages/actions'
import { Composer } from '@/components/feed/composer'
import { FeedList } from '@/components/feed/feed-list'
import { UpcomingEventsWidget } from '@/components/events/upcoming-widget'
import { HostInviteButton } from '@/components/circles/host-invite-button'
import { HostInviteEmail } from '@/components/circles/host-invite-email'
import { CollapsibleAbout } from '@/components/circles/collapsible-about'
import { CircleHostMenu } from '@/components/circles/circle-host-menu'
import { getCircleCapabilities } from '@/lib/core/load-capabilities'
import { getCircleActivePractice, listPublicPractices } from '@/lib/practices'
import { LogPracticeButton } from '@/components/practice/log-practice-button'
import { SetCirclePractice } from '@/components/practice/set-circle-practice'
import { DetailTemplate } from '@/components/templates/detail-template'
import { ModuleCard } from '@/components/modules/module-card'
import { getInitials, isoDaysAgo } from '@/lib/utils'
import { ProfileFlair } from '@/components/profile-flair'
import { isEndorsed } from '@/lib/season-ranks'
import { type CommunityRole, RoleBadge } from '@/lib/community-roles'
import { ClaimCircle } from '@/components/circles/claim-circle'
import { StaffEditButton } from '@/components/ui/staff-edit-button'
import { EditModeButton, StartEditingLink } from '@/components/admin/inline/edit-mode-button'
import { InlineText } from '@/components/admin/inline/inline-text'
import { updateCircleField, uploadCircleCover, removeCircleCover } from '../admin-actions'
import { InlineCover } from '@/components/admin/inline/inline-cover'

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
      `id, name, slug, about, image_url, type, member_count, member_cap, status, is_demo,
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
      const role = (myProfile as { community_role: string }).community_role ?? ''
      isCrew = ['crew', 'host', 'guide', 'mentor', 'admin', 'janitor'].includes(role)
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

  return (
    <div>
      <Link
        href="/circles"
        className="mb-3 inline-block text-xs text-subtle hover:text-muted transition-colors"
      >
        ← All circles
      </Link>

      {/* Demo circles invite a real member to claim + host them in place. */}
      {circle.is_demo && user && (
        <ClaimCircle
          circleId={circle.id}
          name={circle.name}
          about={circle.about}
          practices={practiceLibrary.map((p) => ({ id: p.id, title: p.title }))}
        />
      )}

      <InlineCover
        value={circle.image_url}
        alt={circle.name}
        canEdit={canManage}
        upload={uploadCircleCover.bind(null, circle.id, slug)}
        remove={removeCircleCover.bind(null, circle.id, slug)}
      />

      {/* Unified Detail header (REDESIGN-INAPP Phase 1): title + status/type
          badges, member/host + capacity below, capability-gated actions right. */}
      <DetailTemplate
        title={
          canManage ? (
            <InlineText
              value={circle.name}
              save={updateCircleField.bind(null, circle.id, circle.slug, 'name')}
              inputClassName="w-full rounded-lg border border-border-strong bg-surface px-2 py-0.5 text-xl sm:text-2xl font-bold text-text outline-none focus:ring-2 focus:ring-border-strong/30"
            />
          ) : (
            circle.name
          )
        }
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
            {canManage && <EditModeButton />}

            <StaffEditButton href={`/admin/circles?edit=${circle.id}`} label="Edit circle" />

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
        {canManage ? (
          <div className="mb-6">
            <InlineText
              value={circle.about}
              multiline
              placeholder="Add a description for your circle…"
              save={updateCircleField.bind(null, circle.id, circle.slug, 'about')}
            >
              {circle.about ? (
                <CollapsibleAbout text={circle.about} />
              ) : (
                <StartEditingLink label="+ Add a description for your circle" />
              )}
            </InlineText>
          </div>
        ) : circle.about ? (
          <div className="mb-6">
            <CollapsibleAbout text={circle.about} />
          </div>
        ) : null}

        {/* ── This week's practice (host-assigned). Members log it for
                practice.verified + zaps; hosts set/change it. ──────────── */}
        {(circlePractice || canManage) && (
          <div className="mb-6 rounded-2xl border border-border bg-surface-elevated p-4">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div className="min-w-0">
                <p className="text-xs font-bold text-subtle">This week&rsquo;s practice</p>
                {circlePractice ? (
                  <>
                    <p className="mt-1 font-medium text-text">{circlePractice.title}</p>
                    {circlePractice.description && (
                      <p className="mt-0.5 text-sm text-muted">{circlePractice.description}</p>
                    )}
                  </>
                ) : (
                  <p className="mt-1 text-sm text-muted">No practice set yet.</p>
                )}
              </div>
              {circlePractice && isMember && (
                <div className="shrink-0">
                  <LogPracticeButton practiceId={circlePractice.id} circleId={circle.id} />
                </div>
              )}
            </div>
            {canManage && (
              <div className="mt-3 pt-3 border-t border-border">
                <SetCirclePractice
                  circleId={circle.id}
                  library={practiceLibrary}
                  current={circlePractice?.id}
                />
              </div>
            )}
          </div>
        )}

        {/* ── Body. One border-t spans the row so the feed and the right
                rail hang off the same line (mirrors Channels). Teaser-gated:
                below-tier viewers preview, then it blurs (no-op until the gate
                is switched on — see lib/teaser.ts). ──────── */}
        <TeaserGate
          allowed={teaserAllowed({ role: isCrew ? 'crew' : 'member', hasAccess: isMember })}
          resourceKey={`circle:${circle.id}`}
          previewSeconds={TEASER_PREVIEW_SECONDS}
          title="Crew unlocks the full circle"
          body="Take a look around. Crew members can post, join the conversation, and connect with everyone here."
        >
          <div className="border-t border-border pt-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

              {/* ── Main: circle feed ────────────────────── */}
              <div className="lg:col-span-2">
                <div className="mb-4">
                  <h2 className="text-sm font-bold text-text">Circle feed</h2>
                  <p className="text-xs text-muted leading-relaxed mt-0.5">
                    {canManage
                      ? 'Post to your circle. Toggle Announce to broadcast to the wider hub.'
                      : 'Share with everyone in this circle.'}
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
                      <p className="text-xs text-muted leading-relaxed">
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
              </div>

              {/* ── Right rail: host tools, members, events. Borderless modules
                      (group, don't box). ─────────────────── */}
              <div className="space-y-8">

                {/* Host tools */}
                {canManage && (
                  <ModuleCard title="Host tools">
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
                    <div className="mt-2">
                      <HostInviteEmail circleId={circle.id} />
                    </div>
                  </ModuleCard>
                )}

                {/* Circle health (host+ only) */}
                {canManage && healthScore.totalZaps > 0 && (
                  <ModuleCard title="Circle health">
                    <div className="grid grid-cols-2 gap-2">
                      <HealthStat label="Avg zaps" value={healthScore.avgZaps.toLocaleString()} Icon={Zap} />
                      <HealthStat label="Total zaps" value={healthScore.totalZaps.toLocaleString()} Icon={TrendingUp} />
                      <HealthStat label="Active streaks" value={String(healthScore.activeStreaks)} Icon={Flame} />
                      <HealthStat label="Badges earned" value={String(healthScore.totalAchievements)} Icon={Activity} />
                      <HealthStat label="New this week" value={String(healthScore.newThisWeek)} Icon={Users} />
                    </div>
                  </ModuleCard>
                )}

                {/* Upcoming events */}
                <ModuleCard title="Circle events">
                  <UpcomingEventsWidget scopeIds={[circle.id]} />
                </ModuleCard>

                {/* Members */}
                <ModuleCard title="Members" badge={String(sorted.length)}>
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
                                <Image
                                  src={profile.avatar_url}
                                  alt={profile.display_name}
                                  width={32}
                                  height={32}
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
                                    <span className="text-xs px-1.5 py-0.5 rounded-md bg-success-bg text-success font-medium">
                                      Host
                                    </span>
                                  )}
                                  {volunteer_role && !memberIsHost && (
                                    <RoleBadge role={volunteer_role} className="text-xs leading-tight" />
                                  )}
                                  <ProfileFlair
                                    rank={profile.current_season_rank}
                                    streak={profile.current_streak}
                                    endorsed={isEndorsed(profile.community_role)}
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
                </ModuleCard>
              </div>
            </div>
          </div>
        </TeaserGate>
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
