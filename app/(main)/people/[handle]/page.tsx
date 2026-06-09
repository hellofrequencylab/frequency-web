import { notFound } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { startConversation } from '@/app/(main)/messages/actions'
import { Composer } from '@/components/feed/composer'
import { ProfileFeed } from '@/components/feed/profile-feed'
import { ProfilePosts } from '@/components/feed/profile-posts'
import { ProfileTabs, type ProfileTab } from './profile-tabs'
import { getInitials } from '@/lib/utils'
import { isEndorsed } from '@/lib/season-ranks'
import { FriendButton, type FriendState } from './friend-button'
import { BlockButton } from './block-button'
import { hasBlocked } from '@/lib/blocking'
import { MessageSquare, CalendarDays, Zap, Gem, Users, MapPin, Settings, Trophy, Star, Flame, Contact, Heart } from 'lucide-react'
import { parseVcard } from '@/lib/vcard'
import { type CommunityRole, RoleBadge } from '@/lib/community-roles'
import { getProfileCapabilities } from '@/lib/core/load-capabilities'
import { atLeastRole } from '@/lib/core/roles'
import { MemberSupportPanel } from '@/components/support/member-support-panel'
import { ConnectionPanel } from '@/components/people/connection-panel'
import { ModerateProfileButton } from './moderate-profile-button'
import { TipButton } from './tip-button'
import { getConnectStatus, payoutsLive } from '@/lib/billing/connect'
import { recordTipFromSessionId } from '@/lib/billing/tips'
import { SectionHeader } from '@/components/ui/section-header'
import { EditableIdentity } from './editable-identity'
import { DemoBadge } from '@/components/ui/demo-badge'
import { SupporterBadge } from '@/components/supporter-badge'
import { DetailTemplate } from '@/components/templates'

const RANK_TIERS = [
  { name: 'Ghost',    min: 0,    cls: 'bg-surface-elevated text-muted',     bar: 'bg-border-strong' },
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
  searchParams,
}: {
  params: Promise<{ handle: string }>
  searchParams: Promise<{ tab?: string; tip?: string; session_id?: string }>
}) {
  const { handle } = await params
  const { tab, tip, session_id } = await searchParams
  const activeTab: ProfileTab = tab === 'posts' ? 'posts' : 'activity'

  // Webhook-independent reconcile: when Stripe redirects back from a paid tip,
  // record it here (the webhook also does, idempotently) and show a thank-you.
  let tippedCents: number | null = null
  if (tip === 'success' && session_id) {
    tippedCents = await recordTipFromSessionId(session_id)
  }

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
      membership_tier,
      created_at,
      current_streak,
      lifetime_gems,
      is_demo,
      vcard,
      nexus_regions!nexus_region_id ( name )
    `)
    .eq('handle', handle)
    .eq('is_active', true)
    .maybeSingle()

  if (!profile) notFound()

  // header_image_url isn't in the generated types yet (new column) — read via cast.
  const { data: hdrRow } = await (admin as unknown as SupabaseClient)
    .from('profiles')
    .select('header_image_url')
    .eq('id', profile.id)
    .maybeSingle()
  const headerImageUrl = (hdrRow as { header_image_url?: string | null } | null)?.header_image_url ?? null

  const vcardEnabled = parseVcard(profile.vcard).enabled

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const isOwner = !!user && profile.auth_user_id === user.id

  const role = (profile.community_role ?? 'member') as CommunityRole
  const isDemo = (profile as { is_demo?: boolean }).is_demo ?? false
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

  // Tips (ADR-176): show the Tip control to a signed-in non-owner only when the
  // recipient is actually payouts-ready (and billing is live). The server decides;
  // the button never appears for someone who can't receive money.
  const canTipRecipient =
    !!user && !isOwner && (await payoutsLive()) && (await getConnectStatus(profileId)).ready

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

  const [zapsResult, completionsCountResult, postsCountResult, circlesResult] = await Promise.all([
    admin.from('crew_completions').select('zaps_earned').eq('profile_id', profileId),
    admin.from('crew_completions').select('id', { count: 'exact', head: true }).eq('profile_id', profileId),
    admin.from('posts').select('id', { count: 'exact', head: true }).eq('author_id', profileId).is('parent_id', null).is('hidden_at', null),
    admin.from('memberships').select('circles!circle_id ( id, name, slug )').eq('profile_id', profileId).eq('status', 'active'),
  ])

  const totalZaps = (zapsResult.data ?? []).reduce((sum: number, r: { zaps_earned: number }) => sum + (r.zaps_earned ?? 0), 0)
  const tasksCompleted = completionsCountResult.count ?? 0
  const postCount = postsCountResult.count ?? 0
  const currentStreak = (profile.current_streak as number | null) ?? 0
  const gems = (profile.lifetime_gems as number | null) ?? 0

  const circles = ((circlesResult.data ?? []) as unknown as { circles: { id: string; name: string; slug: string } | null }[])
    .map(m => m.circles).filter((c): c is { id: string; name: string; slug: string } => !!c)

  const rank = getRank(totalZaps)
  const nextRank = getNextRank(totalZaps)
  const progress = nextRank ? Math.min(100, Math.round(((totalZaps - rank.min) / (nextRank.min - rank.min)) * 100)) : 100
  // Rank is *endorsed* (shown publicly) only for Crew+; a free member earns it but
  // it stays in their own Vault, not on their public profile (ADR-141). Inert in Beta.
  const rankEndorsed = isEndorsed(role)
  // Supporter is the pay-more entitlement tier (orthogonal to role/rank) — endorse it
  // publicly with the thank-you badge (P2.4).
  const isSupporter = profile.membership_tier === 'supporter'

  // Rewards — surface the "nearly earned" ones so the next milestone feels within
  // reach (the celebration hook from the Progress spec), not just dimmed-out.
  // Earned float to the top; among the rest, the closest comes first.
  const firstName = (profile.display_name as string).trim().split(/\s+/)[0]
  const rewards = [
    { icon: Star, label: 'Early Adopter', description: 'Here from the beginning', current: 1, target: 1, milestone: true },
    { icon: MessageSquare, label: 'First Post', description: 'Said your first hello', current: postCount, target: 1 },
    { icon: Users, label: 'Circle Up', description: 'Found your first circle', current: circles.length, target: 1 },
    { icon: Zap, label: 'Spark', description: '50 zaps earned', current: totalZaps, target: 50 },
    { icon: Trophy, label: 'Task Master', description: '10 tasks done', current: tasksCompleted, target: 10 },
  ]
    .map((r) => ({ ...r, earned: r.current >= r.target, ratio: Math.min(1, r.current / r.target) }))
    .sort((a, b) => Number(b.earned) - Number(a.earned) || b.ratio - a.ratio)
  const rewardsEarned = rewards.filter((r) => r.earned).length

  // The avatar node, sized to sit inline with the name in the Detail band.
  const avatarNode = profile.avatar_url ? (
    <Image
      src={profile.avatar_url}
      alt={profile.display_name}
      width={56}
      height={56}
      className={`h-14 w-14 rounded-full object-cover ring-2 ring-surface ${isDemo ? 'grayscale-[0.5]' : ''}`}
    />
  ) : (
    <span className="flex h-14 w-14 items-center justify-center rounded-full bg-primary-bg text-primary-strong text-xl font-semibold ring-2 ring-surface">
      {initials}
    </span>
  )

  return (
    <DetailTemplate
      title={
        <span className="inline-flex items-center gap-3 align-middle">
          {avatarNode}
          <span className="min-w-0 break-words">{profile.display_name}</span>
        </span>
      }
      subtitle={
        <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <span className="font-medium">@{profile.handle as string}</span>
          {regionName && (
            <span className="flex items-center gap-1"><MapPin className="h-3 w-3" /> {regionName}</span>
          )}
          <span className="flex items-center gap-1"><CalendarDays className="h-3 w-3" /> Joined {joinedDate}</span>
          {circles.length > 0 && (
            <span className="flex items-center gap-1"><Users className="h-3 w-3" /> {circles.length} {circles.length === 1 ? 'circle' : 'circles'}</span>
          )}
        </span>
      }
      badges={
        <span className="flex items-center gap-2 flex-wrap">
          <RoleBadge role={role} className="text-xs leading-tight" />
          {isSupporter && <SupporterBadge />}
          {rankEndorsed && (
            <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${rank.cls}`}>{rank.name}</span>
          )}
          {isDemo && <DemoBadge />}
        </span>
      }
      actions={
        isOwner ? (
          <Link
            href="/settings/profile"
            className="flex items-center gap-1.5 rounded-lg border border-border-strong px-3 py-1.5 text-sm font-medium text-text hover:bg-surface-elevated transition-colors"
          >
            <Settings className="w-3.5 h-3.5" />
            Settings
          </Link>
        ) : user ? (
          <>
            {!isBlocked && <FriendButton targetProfileId={profileId} state={friendState} />}
            {vcardEnabled && (
              <a
                href={`/people/${profile.handle}/vcard`}
                className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-muted transition-colors hover:bg-surface-elevated hover:text-text"
              >
                <Contact className="w-3.5 h-3.5" />
                Save contact
              </a>
            )}
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
            {!isBlocked && canTipRecipient && (
              <TipButton toProfileId={profileId} recipientName={firstName} />
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
        ) : null
      }
    >
      {tippedCents !== null && (
        <div className="mb-4 inline-flex items-center gap-2 rounded-xl border border-primary-bg bg-primary-bg/40 px-4 py-2.5 text-sm font-semibold text-primary-strong">
          <Heart className="h-4 w-4" />
          Thank you — your ${(tippedCents / 100).toFixed(2)} tip to {firstName} is on its way.
        </div>
      )}

      {/* ── Cover image + bio + gamification (the identity hero, now in the body) ─── */}
      <div className="rounded-2xl border border-border bg-surface shadow-sm overflow-hidden mb-6">
        {/* Cover — the member's header image when set, else the default gradient. */}
        <div className="relative h-32 sm:h-44 bg-gradient-to-br from-primary via-signal to-signal-strong">
          {headerImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={headerImageUrl} alt="" className={`absolute inset-0 h-full w-full object-cover ${isDemo ? 'grayscale-[0.5]' : ''}`} />
          ) : (
            <div className="absolute inset-0 bg-[url('/images/hero.jpg')] bg-cover bg-center opacity-30 mix-blend-overlay" />
          )}
        </div>

        <div className="relative px-6 pb-5 pt-5">
          {/* Bio — inline-editable for the owner (name + bio autosave). */}
          <EditableIdentity
            isOwner={isOwner}
            displayName={profile.display_name}
            handle={profile.handle as string}
            bio={profile.bio ?? ''}
          />

          {/* ── Gamification: rank · core stats · achievements ─── */}
          <div className="mt-5 border-t border-border pt-4">
            {rankEndorsed && (
              <>
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${rank.cls}`}>{rank.name}</span>
                  <span className="text-xs text-subtle">
                    {nextRank ? <>{nextRank.min - totalZaps} zaps to <span className="font-medium text-muted">{nextRank.name}</span></> : 'Max rank reached'}
                  </span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-surface-elevated">
                  <div className={`h-full rounded-full transition-all ${rank.bar}`} style={{ width: `${progress}%` }} />
                </div>
              </>
            )}

            <div className="mt-4 grid grid-cols-3 gap-3">
              <HeaderStat icon={Zap} label="Zaps" value={totalZaps} />
              <HeaderStat icon={Gem} label="Gems" value={gems} />
              <HeaderStat icon={Flame} label="Streak" value={currentStreak} />
            </div>

            <div className="mt-4">
              <p className="mb-2 text-xs font-bold tracking-tight text-text">
                Achievements <span className="font-medium text-subtle">· {rewardsEarned}/{rewards.length}</span>
              </p>
              <div className="flex flex-wrap gap-2">
                {rewards.map((r) => (
                  <AchievementChip key={r.label} icon={r.icon} label={r.label} earned={r.earned} current={r.current} target={r.target} milestone={r.milestone} />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── How you're connected — the viewer's private read of their own tie (ADR-186) ── */}
      {!isOwner && !!user && !isBlocked && (
        <ConnectionPanel
          profileId={profileId}
          firstName={firstName}
          friendAction={friendState.kind === 'none' ? <FriendButton targetProfileId={profileId} state={friendState} /> : undefined}
        />
      )}

      {/* ── Staff-only: this member's support history, wired into the console ── */}
      {!isOwner && atLeastRole(myRole, 'host') && <MemberSupportPanel profileId={profileId} />}

      {/* ── Composer + timeline (single column; the global rail is on the right) ── */}
      {myProfileId && (
        <div className="mb-5">
          <Composer
            scopeId={profileId}
            visibility="public"
            placeholder={isOwner ? 'What’s on your mind?' : `Leave something for ${firstName}…`}
          />
        </div>
      )}

      <SectionHeader
        title={
          activeTab === 'posts'
            ? isOwner ? 'Your posts' : `${firstName}’s posts`
            : isOwner ? 'Your timeline' : `${firstName}’s timeline`
        }
        count={activeTab === 'posts' ? postCount : undefined}
      />
      <ProfileTabs handle={profile.handle as string} active={activeTab} />
      {activeTab === 'posts' ? (
        <ProfilePosts
          profileId={profileId}
          firstName={firstName}
          isOwner={isOwner}
          myProfileId={myProfileId}
          viewerRole={myRole}
        />
      ) : (
        <ProfileFeed
          profileId={profileId}
          profileHandle={profile.handle as string}
          myProfileId={myProfileId}
          viewerRole={myRole}
        />
      )}
    </DetailTemplate>
  )
}

// A single big gamification stat in the header (Zaps · Gems · Streak).
function HeaderStat({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: number }) {
  return (
    <div className="rounded-2xl bg-surface-elevated/60 px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-xs font-semibold text-subtle">
        <Icon className="h-3.5 w-3.5 text-primary" />
        {label}
      </div>
      <p className="mt-0.5 text-2xl font-bold tabular-nums text-text">{value.toLocaleString()}</p>
    </div>
  )
}

// A compact achievement pill — filled + star when earned, outline + progress
// when not (the "nearly earned" nudge).
function AchievementChip({
  icon: Icon, label, earned, current, target, milestone,
}: {
  icon: React.ElementType
  label: string
  earned: boolean
  current: number
  target: number
  milestone?: boolean
}) {
  const showProgress = !earned && !milestone
  return (
    <span
      title={earned ? `${label} — earned` : showProgress ? `${label} — ${current}/${target}` : label}
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
        earned ? 'bg-warning-bg text-primary' : 'border border-border text-muted'
      }`}
    >
      <Icon className={`h-3.5 w-3.5 ${earned ? 'text-primary' : 'text-subtle'}`} />
      {label}
      {earned ? (
        <Star className="h-3 w-3 fill-primary text-primary" />
      ) : showProgress ? (
        <span className="tabular-nums text-subtle">{current}/{target}</span>
      ) : null}
    </span>
  )
}
