import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { startConversation } from '@/app/(main)/messages/actions'
import { Composer } from '@/components/feed/composer'
import { ProfileFeed } from '@/components/feed/profile-feed'
import { ProfilePosts } from '@/components/feed/profile-posts'
import { type ProfileTab } from './profile-tabs'
import { getInitials } from '@/lib/utils'
import { isEndorsed, rankProgress, seasonRankStyle, type RankDef, type SeasonRank } from '@/lib/season-ranks'
import { UnderlineTabs } from '@/components/admin/underline-tabs'
import { OpenAdminBarButton } from '@/components/admin/open-admin-bar-button'
import { FriendButton, type FriendState } from './friend-button'
import { BlockButton } from './block-button'
import { hasBlocked } from '@/lib/blocking'
import { MessageSquare, CalendarDays, Zap, Users, MapPin, Pencil, Trophy, Star, Contact, Heart, Gem, Flame, ArrowRight, UserCog } from 'lucide-react'
import { parseVcard } from '@/lib/vcard'
import { type CommunityRole, RoleBadge, FoundingBadge } from '@/lib/community-roles'
import { getProfileCapabilities, getGlobalCapabilities } from '@/lib/core/load-capabilities'
import { getRealCallerWebRole } from '@/lib/auth'
import { actAsMember } from '@/app/(main)/impersonate-actions'
import { readSpotlightPublished, readSpotlightEnabled } from '@/lib/profile/spotlight-flags'
import { readProfileHeaderFocus, readProfileAvatarFocus, readProfileOverlayStyle, readProfileOverlayColor } from '@/lib/profile/header-focus'
import { atLeastRole } from '@/lib/core/roles'
import { MemberSupportPanel } from '@/components/support/member-support-panel'
import { ConnectionPanel } from '@/components/people/connection-panel'
import { ProfileSettingsDrawer } from './profile-settings-drawer'
import { TipButton } from './tip-button'
import { getConnectStatus, payoutsLive } from '@/lib/billing/connect'
import { recordTipFromSessionId } from '@/lib/billing/tips'
import { SectionHeader } from '@/components/ui/section-header'
import { EditableIdentity } from './editable-identity'
import { DemoBadge } from '@/components/ui/demo-badge'
import { SupporterBadge } from '@/components/supporter-badge'
import { VeraProfile } from '@/components/people/vera-profile'
import { getMemberSignature } from '@/lib/frequency-signature-data'
import { journeysFinishedThisSeason } from '@/lib/quest/completion-read'
import { getProfileAwards } from '@/lib/profile/awards'
import { ProfileAwards } from '@/components/profile/profile-awards'
import { FrequencySignature } from '@/components/profile/frequency-signature'
import { getLinkedContactForProfile } from '@/lib/connections/matching'
import { PrivateContactPanel } from '@/components/connections/private-contact-panel'
import { DetailTemplate, PageHero, HERO_ACTION_CLASS } from '@/components/templates'
import { resolveHeaderElement } from '@/lib/elements/header'
import { ProfileAvatar } from '@/components/profile/profile-avatar'
import { ProfileSpotlightBlocks } from '@/components/profile/profile-spotlight-blocks'
import { OwnerProfileLayoutPreview } from '@/components/profile/owner-profile-layout-preview'
import { ShareRefProvider } from '@/components/qr/share-ref-context'
import { QrShareDropdown } from '@/components/qr/qr-share-dropdown'

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
  // One profile read for everything the band needs. header_image_url + meta used to be a
  // second round-trip; they're folded in here. header_image_url isn't in the generated
  // types yet (new column) — read it off the row via the cast below, same as before.
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
      is_founding_member,
      created_at,
      current_streak,
      lifetime_gems,
      lifetime_zaps,
      is_demo,
      is_system,
      vcard,
      header_image_url,
      meta,
      nexus_regions!nexus_region_id ( name )
    `)
    .eq('handle', handle)
    .eq('is_active', true)
    .maybeSingle()

  if (!profile) notFound()

  // The system voice gets her own page (ADR-238) — no member stats, no friend
  // chrome; the branch also skips every member-shaped query below.
  if (profile.is_system) {
    return (
      <VeraProfile
        name={profile.display_name}
        handle={profile.handle as string}
        avatarUrl={profile.avatar_url}
        bio={profile.bio}
      />
    )
  }

  // header_image_url isn't in the generated types yet (new column) — read via cast.
  const headerImageUrl = (profile as { header_image_url?: string | null }).header_image_url ?? null
  // Where the header banner sits in its cropped hero window (owner's focal picker), stored on meta.headerFocal.
  const headerFocus = readProfileHeaderFocus((profile as { meta?: unknown }).meta)
  const avatarFocus = readProfileAvatarFocus((profile as { meta?: unknown }).meta)
  // Spotlight (opt-in public mini-site): show a link to it when this member has
  // published one. Derived from meta server-side; the blob never reaches the client.
  const spotlightPublished = readSpotlightPublished((profile as { meta?: unknown }).meta)
  const spotlightEnabled = readSpotlightEnabled((profile as { meta?: unknown }).meta)

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

  // Everything the identity band + sidebar needs is mutually independent once we have
  // user / viewer / profileId, so it all goes through ONE Promise.all instead of a chain
  // of serial awaits (the band used to wait on the slowest of ~10 round-trips). The
  // relationship reads (friendship / block / linked contact) are gated exactly as before
  // — built as conditional promises so we only issue them when the same guard would have.
  const isRelationalViewer = !!myProfileId && myProfileId !== profileId

  // Friendship state — same pairing + status mapping as before, just resolved in-batch.
  const friendPair = isRelationalViewer
    ? (myProfileId! < profileId
        ? { user_a_id: myProfileId!, user_b_id: profileId }
        : { user_a_id: profileId, user_b_id: myProfileId! })
    : null
  const friendPromise = friendPair
    ? admin.from('friendships').select('status, requested_by').match(friendPair).maybeSingle()
    : Promise.resolve(null)
  // Block state — only read for a signed-in non-self viewer, same guard as before.
  const blockPromise = isRelationalViewer ? hasBlocked(myProfileId!, profileId) : Promise.resolve(false)
  // The viewer's OWN merged contact card (docs/NETWORK-CRM.md) — same gate (signed-in
  // non-owner) as before, just folded into the batch.
  const linkedContactPromise =
    myProfileId && !isOwner ? getLinkedContactForProfile(myProfileId, profileId) : Promise.resolve(null)

  const [
    journeysDone, completionsCountResult, postsCountResult, circlesResult, signature, awards,
    payoutsAreLive, connectStatus, profileCaps, globalCaps, realWebRole,
    friendResult, isBlocked, myLinkedContact,
  ] = await Promise.all([
    // Journeys finished THIS SEASON — the canonical rank-ladder driver (same source the
    // feed / crew home / leaderboard use). The displayed Zaps number is a separate value
    // (profiles.lifetime_zaps, read off the row below) — they are not the same metric.
    journeysFinishedThisSeason(profileId),
    admin.from('crew_completions').select('id', { count: 'exact', head: true }).eq('profile_id', profileId),
    admin.from('posts').select('id', { count: 'exact', head: true }).eq('author_id', profileId).is('parent_id', null).is('hidden_at', null),
    admin.from('memberships').select('circles!circle_id ( id, name, slug )').eq('profile_id', profileId).eq('status', 'active'),
    // The Frequency Signature — the member's practice spread across the four Pillars
    // (docs/JOURNEYS.md §9.2), the identity centerpiece below.
    getMemberSignature(profileId),
    // Real earned awards + owned shop items for the public awards section.
    getProfileAwards(profileId),
    // Tips (ADR-176): payouts-live + the recipient's Connect status. Always fetched; the
    // canTipRecipient boolean below keeps the signed-in-non-owner short-circuit semantics.
    payoutsLive(),
    getConnectStatus(profileId),
    // Capability-gated moderator edit: profile.edit on a profile you don't own = janitor.
    getProfileCapabilities(profileId),
    // Staff (admin/janitor) deep link into the full account editor in Admin → People.
    getGlobalCapabilities(),
    // Janitors additionally get "Act as" — full identity impersonation of this member.
    getRealCallerWebRole(),
    friendPromise,
    blockPromise,
    linkedContactPromise,
  ])

  // Tips (ADR-176): show the Tip control to a signed-in non-owner only when the recipient
  // is actually payouts-ready (and billing is live). The server decides; the button never
  // appears for someone who can't receive money.
  const canTipRecipient = !!user && !isOwner && payoutsAreLive && connectStatus.ready
  const canModerateProfile = !isOwner && profileCaps.has('profile.edit')
  const isStaffViewer = !isOwner && globalCaps.has('admin.access')
  const isJanitorViewer = !isOwner && realWebRole === 'janitor'

  // Friendship state between viewer and this profile (same status mapping as before).
  let friendState: FriendState = { kind: 'none' }
  const f = friendResult?.data
  if (f) {
    if (f.status === 'accepted') friendState = { kind: 'accepted' }
    else if (f.requested_by === myProfileId) friendState = { kind: 'pending_outgoing' }
    else friendState = { kind: 'pending_incoming' }
  }

  const tasksCompleted = completionsCountResult.count ?? 0
  const postCount = postsCountResult.count ?? 0
  const currentStreak = (profile.current_streak as number | null) ?? 0
  const gems = (profile.lifetime_gems as number | null) ?? 0
  // Lifetime Zaps shown on the standing card + the Spark milestone — the authoritative
  // profiles.lifetime_zaps (the same headline number the dashboard shows). NOT the
  // crew-completions subtotal, which read 0 for Zaps earned from posts/reactions/joins.
  const lifetimeZaps = (profile as { lifetime_zaps?: number | null }).lifetime_zaps ?? 0

  const circles = ((circlesResult.data ?? []) as unknown as { circles: { id: string; name: string; slug: string } | null }[])
    .map(m => m.circles).filter((c): c is { id: string; name: string; slug: string } => !!c)

  // Rank, next tier, and progress come from the one canonical source (season-ranks),
  // so the profile shows the same ladder as the feed, crew home, and leaderboard.
  const { rank, def: rankDef, next: rankNext, pct: rankPct, zapsToNext } = rankProgress(journeysDone)
  // Rank is *endorsed* (shown publicly) only on the paid tier (Crew/Supporter); a
  // free member earns it but it stays in their own Vault, not on their public
  // profile (ADR-141, PB.1i: tier, not role). Inert in Beta (everyone is comped Crew).
  const rankEndorsed = isEndorsed(profile.membership_tier)
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
    { icon: Zap, label: 'Spark', description: '50 Zaps earned', current: lifetimeZaps, target: 50 },
    { icon: Trophy, label: 'Task Master', description: '10 tasks done', current: tasksCompleted, target: 10 },
  ]
    .map((r) => ({ ...r, earned: r.current >= r.target, ratio: Math.min(1, r.current / r.target) }))
    .sort((a, b) => Number(b.earned) - Number(a.earned) || b.ratio - a.ratio)
  const rewardsEarned = rewards.filter((r) => r.earned).length

  // The page route (used for the vCard "Save contact" download when the member enabled
  // a contact card). The profile QR + share link is supplied by the DetailTemplate's
  // own PageAdminBar (the framework "Share" panel for /people/<handle>), so the page no
  // longer builds its own QR/links disclosure.
  const profilePath = `/people/${profile.handle as string}`

  // Badges — shared by the Detail identity band.
  {/* The ROLE badge (e.g. Janitor) is an IDENTITY chip — it rides the header image beside the name
      (the space-page treatment). The system voice (Vera, ADR-231) shows "Moderator". */}
  // Smaller than the default .rank-badge (which hard-codes 12px + 2/8 padding), and the eyebrow wrapper adds
  // wide tracking + uppercase — so shrink with important utilities + reset the tracking so JANITOR reads as a
  // compact chip, not a big banner.
  const roleBadge = (
    <RoleBadge
      role={profile.is_system ? 'moderator' : role}
      className="!px-1.5 !py-0 !text-3xs !tracking-normal leading-tight"
    />
  )
  {/* The remaining chips (Founder / Supporter / season rank / demo) are gamification/status — they read
      BELOW the header with the stats, not over the photo. */}
  const badges = (
    <span className="flex items-center gap-2 flex-wrap">
      <FoundingBadge founding={profile.is_founding_member} className="text-xs leading-tight" />
      {isSupporter && <SupporterBadge />}
      {rankEndorsed && (
        <span className="rank-badge text-xs font-medium" style={seasonRankStyle(rank)}>{rankDef.label}</span>
      )}
      {isDemo && <DemoBadge />}
    </span>
  )

  // The Detail band's action slot — same controls + gating as before. The owner gets
  // Edit Profile (and a contact-card download when they enabled one); the profile QR +
  // share link ride the header actions (QrShareDropdown). A signed-in non-owner gets the
  // full friend/contact/message/tip/block/moderate set.
  // The owner's on-cover header action is just Save contact (when they expose a vCard); Edit profile moved
  // to a right-aligned admin row BELOW the header (see the band), so it doesn't ride the cover photo.
  const ownerActions = vcardEnabled ? (
    <a href={`${profilePath}/vcard`} className={HERO_ACTION_CLASS}>
      <Contact className="h-3.5 w-3.5" />
      Save contact
    </a>
  ) : null

  // Edit profile — the owner's admin control, right-aligned on the SAME row as the stats line just below the
  // header (light chrome; it sits on the page, not the cover). Opens the side admin rail (identity editor +
  // the in-rail page builder); the full /settings/profile form stays reachable from inside the rail.
  const editProfileButton = isOwner ? (
    <OpenAdminBarButton
      scope={{ kind: 'profile', id: profileId }}
      label="Edit profile"
      icon={<Pencil className="h-4 w-4" />}
      className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-muted transition-colors hover:bg-surface-elevated hover:text-text"
    />
  ) : null

  // The secondary, lower-stakes controls (Block · janitor "Act as") render as small
  // text LINKS in a row UNDER the primary button row, right-aligned — they shouldn't
  // compete with Friends/Message/Settings for weight.
  const hasSecondary = (!isOwner) || isJanitorViewer
  const viewerActions = user ? (
    <div className="flex flex-col items-end gap-2">
      <div className="flex flex-wrap items-center justify-end gap-2">
        {!isBlocked && <FriendButton targetProfileId={profileId} state={friendState} />}
        {vcardEnabled && (
          <a href={`${profilePath}/vcard`} className={HERO_ACTION_CLASS}>
            <Contact className="w-3.5 h-3.5" />
            Save contact
          </a>
        )}
        {!isBlocked && friendState.kind === 'accepted' && (
          <form action={startConversation.bind(null, profileId)}>
            <button type="submit" className={HERO_ACTION_CLASS}>
              <MessageSquare className="w-3.5 h-3.5" />
              Message
            </button>
          </form>
        )}
        {!isBlocked && canTipRecipient && (
          <TipButton toProfileId={profileId} recipientName={firstName} />
        )}
        {/* One Settings drawer for staff — the member's profile fields, Spotlight admin
            controls, and a deep link to full account management. */}
        {isStaffViewer && (
          <ProfileSettingsDrawer
            profileId={profileId}
            handle={profile.handle as string}
            initialName={profile.display_name}
            initialBio={profile.bio ?? ''}
            spotlightEnabled={spotlightEnabled}
            spotlightPublished={spotlightPublished}
            canModerate={canModerateProfile}
            isJanitor={isJanitorViewer}
          />
        )}
      </div>
      {hasSecondary && (
        <div className="flex items-center gap-3 pr-0.5">
          {!isOwner && <BlockButton profileId={profileId} blocked={isBlocked} variant="link" />}
          {/* Janitor full control: become this member (session swap). The server action
              re-checks the real janitor web_role before swapping. */}
          {isJanitorViewer && (
            <form action={actAsMember.bind(null, profileId)}>
              <button
                type="submit"
                className="inline-flex items-center gap-1 text-xs font-medium text-signal-strong transition-colors hover:underline"
                title="Act as this member (full control)"
              >
                <UserCog className="h-3 w-3" />
                Act as {firstName}
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  ) : null

  // ── The profile IS the Detail template (PAGE-FRAMEWORK §3, Template C; the
  // reference entity-profile composition, ENTITY-SPACES-BUILD §A.4). The context band
  // carries identity (avatar + name) · meta · badges · actions; its own PageAdminBar
  // draws the closing rule and the framework "Share" panel (profile QR + link). The
  // body below is a 2/3 content column beside a 1/3 info column, all composed from kit
  // primitives — no hand-rolled header, no raw <h1>. The global community rail stays
  // put beyond the body (page-chrome keeps profiles 'global'); the body splits at xl so
  // it never cramps against that rail, stacking the info column up top below xl.
  // The header is the standardized `header` element (ADR-793), identity layout — the Space-page
  // treatment with a ROUND profile photo: avatar + role badge + name + @handle + actions all ride the
  // cover, stats/gamification read below. Scrim OFF by default (a clean photo; PageHero's on-image-text
  // keeps the overlaid identity + buttons legible), unless an operator turns it on. layout / height /
  // scrim resolve from the master config (retune site-wide).
  // The owner's picked overlay (profiles.meta) is the surface default — an operator master value in
  // /admin/elements can still override it site-wide (resolveHeaderElement precedence).
  const overlayStyle = readProfileOverlayStyle((profile as { meta?: unknown }).meta)
  const overlayColor = readProfileOverlayColor((profile as { meta?: unknown }).meta)
  const header = await resolveHeaderElement({ defaults: { layout: 'identity', height: 'standard', scrim: false, overlayStyle } })
  return (
    <>
      {tippedCents !== null && (
        <div className="mb-4 inline-flex items-center gap-2 rounded-xl border border-primary-bg bg-primary-bg/40 px-4 py-2.5 text-sm font-semibold text-primary-strong">
          <Heart className="h-4 w-4" />
          Thank you. Your ${(tippedCents / 100).toFixed(2)} tip to {firstName} is on its way.
        </div>
      )}

      {/* ShareRefProvider threads the profile owner's id to the framework "QR & Share"
          control (inside DetailTemplate's PageAdminBar), so the copied link AND the QR for
          this profile become `/people/<handle>?ref=<ownerId>` — a new signup via either is
          credited to this owner (proxy drops fq_ref → applyReferralAttribution). */}
      <ShareRefProvider profileId={profileId}>
      <DetailTemplate
        hero={
          <PageHero
            variant={header.layout}
            size={header.height}
            overlayStyle={header.overlayStyle}
            overlayColor={overlayColor ?? undefined}
            coverImage={headerImageUrl}
            coverFocus={headerFocus}
            dimmed={isDemo}
            leading={<ProfileAvatar src={profile.avatar_url} name={profile.display_name} initials={initials} dimmed={isDemo} focus={avatarFocus} />}
            eyebrow={roleBadge}
            title={profile.display_name}
            subtitle={<span className="font-medium text-on-ink/90">@{profile.handle as string}</span>}
            actions={
              <>
                {isOwner ? ownerActions : viewerActions}
                <QrShareDropdown manager={isOwner} className={HERO_ACTION_CLASS} />
              </>
            }
          />
        }
        title={profile.display_name}
        band={
          <div className="min-w-0 space-y-2">
            {/* ONE compact line right under the header: the at-a-glance stats/meta on the left with the
                status chips (Ghost/Founder/rank) at the END, and the owner's Edit profile on the right. */}
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
                {regionName && (
                  <span className="flex items-center gap-1"><MapPin className="h-3 w-3" /> {regionName}</span>
                )}
                <span className="flex items-center gap-1"><CalendarDays className="h-3 w-3" /> Joined {joinedDate}</span>
                {circles.length > 0 && (
                  <Link
                    href={circles.length === 1 ? `/circles/${circles[0]!.slug}` : '/circles'}
                    className="flex items-center gap-1 transition-colors hover:text-text"
                  >
                    <Users className="h-3 w-3" /> {circles.length} {circles.length === 1 ? 'circle' : 'circles'}
                  </Link>
                )}
                {/* Status chips (Ghost rank, Founder, Supporter, demo) sit at the END of the stats line. */}
                {badges}
              </div>
              {editProfileButton}
            </div>
            {/* Bio reads with the identity block, above the header's hairline rule. */}
            <EditableIdentity isOwner={isOwner} bio={profile.bio ?? ''} />
          </div>
        }
      >
      {/* ── BODY — a 2/3 content area beside a 1/3 tiled info column. The content
          carries bio + the relationship panels + composer + timeline; the info column
          lists Standing, Frequency Signature, then Achievements. ── */}
      <div className="grid gap-6 xl:grid-cols-3">
        {/* CONTENT (2/3) — practice, the relationship panels, composer, timeline.
            (Bio now reads with the identity band above the header rule.) */}
        <div className="order-2 min-w-0 space-y-6 xl:order-1 xl:col-span-2">
          {/* Your private contact card — only the viewer who merged their own personal
              contact with this member sees this (their own logged data). */}
          {myLinkedContact && <PrivateContactPanel card={myLinkedContact} memberName={firstName} />}

          {/* How you're connected — the viewer's private read of their own tie (ADR-186). */}
          {!isOwner && !!user && !isBlocked && (
            <ConnectionPanel
              profileId={profileId}
              firstName={firstName}
              friendAction={friendState.kind === 'none' ? <FriendButton targetProfileId={profileId} state={friendState} /> : undefined}
            />
          )}

          {/* Staff-only: this member's support history, wired into the console. */}
          {!isOwner && atLeastRole(myRole, 'host') && <MemberSupportPanel profileId={profileId} />}

          {/* The member's page-builder content (ADR-508 → ADR-516 Phase C → ADR-522). ONE engine: both
              branches render the member's freeform grid (resolveRows over meta.entityGrid). For the OWNER
              it is the LIVE PREVIEW (the WYSIWYG surface the in-rail builder edits, in sync via the shared
              ProfileLayoutContext); for a VISITOR it is a STATIC render of the identical grid — same
              arrangement / columns / hidden choices. DECOUPLED from the Spotlight publish gate: it renders
              for every member (default starter when they never opened the builder), not just published
              Crew+. Fail-safe + streamed behind Suspense so they never block the profile's first byte. */}
          <Suspense fallback={null}>
            {isOwner ? (
              <OwnerProfileLayoutPreview handle={handle} />
            ) : (
              <ProfileSpotlightBlocks handle={handle} />
            )}
          </Suspense>

          {/* Composer + timeline. */}
          {myProfileId && (
            <Composer
              scopeId={profileId}
              visibility="public"
              placeholder={isOwner ? 'What’s on your mind?' : `Leave something for ${firstName}…`}
            />
          )}

          <div>
            <SectionHeader
              title={
                activeTab === 'posts'
                  ? isOwner ? 'Your posts' : `${firstName}’s posts`
                  : isOwner ? 'Your timeline' : `${firstName}’s timeline`
              }
              count={activeTab === 'posts' ? postCount : undefined}
            />
            {/* The one tab vocabulary (UnderlineTabs), ?tab=-driven. */}
            <div className="mb-4">
              <UnderlineTabs
                activeHref={activeTab === 'posts' ? `/people/${profile.handle}?tab=posts` : `/people/${profile.handle}`}
                tabs={[
                  { href: `/people/${profile.handle}`, label: 'Activity' },
                  { href: `/people/${profile.handle}?tab=posts`, label: 'Posts', count: postCount },
                ]}
              />
            </div>
            {/* The timeline/posts list is the slowest async work on the page, so it
                streams behind its own Suspense boundary — the identity band + sidebar
                paint first, the feed swaps in when its rows resolve. */}
            <Suspense fallback={<ProfileFeedSkeleton />}>
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
            </Suspense>
          </div>
        </div>

        {/* SIDEBAR (1/3) — tiled info: Standing, Frequency Signature, Achievements. Scrolls
            with the main content (no sticky) so the whole column reads as one page. */}
        <aside className="order-1 min-w-0 space-y-4 self-start xl:order-2 xl:col-span-1">
          {/* Standing — Zaps · Gems · Streak · Rank, shown on every profile (the owner asked
              for everyone's stats to be public, not just paid-tier members). */}
          <ProfileStandingCard
            isOwner={isOwner}
            rank={rank}
            rankDef={rankDef}
            next={rankNext}
            pct={rankPct}
            zapsToNext={zapsToNext}
            zaps={lifetimeZaps}
            gems={gems}
            streak={currentStreak}
          />

          {/* Frequency Signature — the identity constellation, stacked for the column. */}
          <div>
            <SectionHeader title="Frequency Signature" />
            <FrequencySignature
              signature={signature}
              variant="full"
              layout="stack"
              name={isOwner ? undefined : firstName}
              className="mt-2"
            />
          </div>

          {/* Achievements — the earned / nearly-earned chips. */}
          <div className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
            <p className="mb-3 text-sm font-bold tracking-tight text-text">
              Achievements <span className="font-medium text-subtle">· {rewardsEarned}/{rewards.length}</span>
            </p>
            <div className="flex flex-wrap gap-2">
              {rewards.map((r) => (
                <AchievementChip key={r.label} icon={r.icon} label={r.label} earned={r.earned} current={r.current} target={r.target} milestone={r.milestone} />
              ))}
            </div>
          </div>

          {/* Real earned awards + owned/awarded shop items (renders nothing when empty). */}
          <ProfileAwards awards={awards} firstName={firstName} isOwner={isOwner} />
        </aside>
      </div>
      </DetailTemplate>
      </ShareRefProvider>
    </>
  )
}

// Suspense fallback for the streamed timeline — a few pulsing bars sized to the feed
// rows, so the space is reserved (no layout shift) while the posts resolve.
function ProfileFeedSkeleton() {
  return (
    <div className="space-y-4" aria-hidden>
      {[0, 1, 2].map((i) => (
        <div key={i} className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 animate-pulse rounded-full bg-surface-elevated" />
            <div className="flex-1 space-y-2">
              <div className="h-3 w-1/3 animate-pulse rounded bg-surface-elevated" />
              <div className="h-3 w-1/5 animate-pulse rounded bg-surface-elevated" />
            </div>
          </div>
          <div className="mt-3 space-y-2">
            <div className="h-3 w-full animate-pulse rounded bg-surface-elevated" />
            <div className="h-3 w-4/5 animate-pulse rounded bg-surface-elevated" />
          </div>
        </div>
      ))}
    </div>
  )
}

// The profile's standing as a compact MENU — Zaps · Gems · Streak · Rank as rows
// (the owner's link into the Quest; a visitor's are read-only), under a rank header
// with a slim progress bar to the next tier. The gamification summary at the top of
// the profile's interior column, above the Frequency Signature.
function ProfileStandingCard({
  isOwner, rank, rankDef, next, pct, zapsToNext, zaps, gems, streak,
}: {
  isOwner: boolean
  rank: SeasonRank
  rankDef: RankDef
  next: RankDef | null
  pct: number
  zapsToNext: number
  zaps: number
  gems: number
  streak: number
}) {
  const rows: { icon: React.ElementType; label: string; value: string; href: string | null }[] = [
    { icon: Zap, label: 'Zaps', value: zaps.toLocaleString(), href: isOwner ? '/crew/leaderboard' : null },
    { icon: Gem, label: 'Gems', value: gems.toLocaleString(), href: isOwner ? '/crew/store' : null },
    { icon: Flame, label: 'Streak', value: `${streak} ${streak === 1 ? 'day' : 'days'}`, href: isOwner ? '/crew/leaderboard' : null },
    { icon: Trophy, label: 'Rank', value: rankDef.label, href: isOwner ? '/crew/leaderboard' : null },
  ]
  return (
    <div className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-bold tracking-tight text-text">Standing</p>
        <span className="rank-badge text-2xs font-medium" style={seasonRankStyle(rank)}>{rankDef.label}</span>
      </div>

      {next ? (
        <div className="mt-3 space-y-1.5">
          <div className="flex items-center justify-between gap-2 text-2xs">
            <span className="font-semibold text-text">Climbing to {next.label}</span>
            <span className="tabular-nums text-subtle">{zapsToNext.toLocaleString()} ⚡ to go</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-warning-bg/60">
            <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
          </div>
        </div>
      ) : (
        <p className="mt-3 text-2xs font-semibold text-primary-strong">Top rank reached</p>
      )}

      <div className="mt-3 space-y-0.5">
        {rows.map((r) => {
          const Icon = r.icon
          const body = (
            <>
              <Icon className="h-4 w-4 shrink-0 text-subtle" aria-hidden />
              <span className="min-w-0 flex-1 text-sm font-medium text-text">{r.label}</span>
              <span className="shrink-0 text-sm font-semibold tabular-nums text-muted">{r.value}</span>
            </>
          )
          return r.href ? (
            <Link
              key={r.label}
              href={r.href}
              className="group flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-surface-elevated"
            >
              {body}
              <ArrowRight className="h-3 w-3 shrink-0 text-subtle opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />
            </Link>
          ) : (
            <div key={r.label} className="flex items-center gap-2.5 px-2 py-1.5">
              {body}
            </div>
          )
        })}
      </div>
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
      title={earned ? `${label} (earned)` : showProgress ? `${label} (${current}/${target})` : label}
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
