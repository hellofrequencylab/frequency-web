import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { loadLibraryAssetUrls } from '@/lib/library/asset-urls'
import { columnImageUrl } from '@/lib/library/column-image'
import { MessageMemberButton } from '@/components/messages/message-member-button'
import { Composer } from '@/components/feed/composer'
import { ProfileFeed } from '@/components/feed/profile-feed'
import { ProfilePosts } from '@/components/feed/profile-posts'
import { getInitials } from '@/lib/utils'
import { isEndorsed, rankProgress } from '@/lib/season-ranks'
import { TierChip } from '@/components/pricing/tier-chip'
import { OpenAdminBarButton } from '@/components/admin/open-admin-bar-button'
import { FriendButton, type FriendState } from './friend-button'
import { BlockButton } from './block-button'
import { hasBlocked, isBlockedBetween } from '@/lib/blocking'
import { MessageSquare, Zap, Users, Trophy, Star, UserCog } from 'lucide-react'
import { parseVcard } from '@/lib/vcard'
import { type CommunityRole, RoleBadge, FoundingBadge } from '@/lib/community-roles'
import { getProfileCapabilities, getGlobalCapabilities } from '@/lib/core/load-capabilities'
import { getRealCallerWebRole } from '@/lib/auth'
import { actAsMember } from '@/app/(main)/impersonate-actions'
import { readSpotlightPublished, readSpotlightEnabled } from '@/lib/profile/spotlight-flags'
import { readProfileHeaderFocus } from '@/lib/profile/header-focus'
import { MemberSupportPanel } from '@/components/support/member-support-panel'
import { ConnectionPanel } from '@/components/people/connection-panel'
import { ProfileSettingsDrawer } from './profile-settings-drawer'
import { TipButton } from './tip-button'
import { getConnectStatus, payoutsLive } from '@/lib/billing/connect'
import { recordTipFromSessionId } from '@/lib/billing/tips'
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
import { ProfileAssociations } from '@/components/profile/profile-associations'
import { isUnwalledSpaceId } from '@/lib/people/associations'
import { loadRootSpaceId } from '@/lib/spaces/store'
import { resolveIdentityHero } from '@/lib/layout/detail-hero'
// The bought cosmetics, finally rendered (backlog LIVE-013). The store has charged Gems for
// borders, flairs and titles since the gem-store migration; until these three components landed,
// the only reader of the columns they write was a text chip in the buyer's own Vault.
import { CosmeticBorder, CosmeticFlair, CosmeticTitle } from '@/components/profile/profile-cosmetics'
import { ProfileSpotlightBlocks } from '@/components/profile/profile-spotlight-blocks'
import { OwnerProfileLayoutPreview } from '@/components/profile/owner-profile-layout-preview'
import { safeWebsite } from '@/lib/profiles/website'
import { ShareRefProvider } from '@/modules/qr'
import { QrShareDropdown } from '@/modules/qr'
import { roleUnlocked, stageUnlocked } from '@/lib/unlocks'
import { getCachedMemberProgress } from '@/lib/member-progress'
import { supporterMarkShows } from '@/lib/pricing/catalog-config'
import { HubLinks } from '@/components/frequency/members/shared/hub-links'
import { hubLinks } from '@/components/frequency/members/shell/nav'
import {
  ProfileBody, ProfilePhoto, ProfileCircles, ProfileStanding, ProfileAchievements, ProfilePractice,
} from '@/components/frequency/members/profile/profile-body'
import { FqIcon } from '@/components/frequency/icon'
import { getInPersonCounts, getCircleTenure, getPracticeCounts, sinceLabel } from '@/lib/profile/in-person'
import { getMemberJourneyProgress } from '@/lib/journeys/progress'
import { fqPlaceholderArt } from '@/lib/frequency/placeholder-art'

export default async function ProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ handle: string }>
  searchParams: Promise<{ tab?: string; tip?: string; session_id?: string }>
}) {
  const { handle } = await params
  const { tab, tip, session_id } = await searchParams

  // Webhook-independent reconcile: when Stripe redirects back from a paid tip,
  // record it here (the webhook also does, idempotently) and show a thank-you.
  let tippedCents: number | null = null
  if (tip === 'success' && session_id) {
    // Never fatal to the tipper: a DB refusal throws out of the settle (SCAN-764) so the webhook
    // redelivers, and this page must still render for someone who has just paid.
    try {
      tippedCents = await recordTipFromSessionId(session_id)
    } catch (e) {
      console.error('[tips] redirect settle failed; the webhook is now the only path', e)
    }
  }

  const admin = createAdminClient()
  // One profile read for everything the band needs. header_image_url + meta used to be a
  // second round-trip; they're folded in here. The companion header_image_asset_id is the
  // Loom truth; the url is the cache (HYG-068).
  const { data: profile } = await admin
    .from('profiles')
    .select(`
      id,
      auth_user_id,
      display_name,
      handle,
      bio,
      website,
      avatar_url,
      community_role,
      membership_tier,
      membership_payment_status,
      last_stripe_event_at,
      is_founding_member,
      created_at,
      current_streak,
      lifetime_gems,
      lifetime_zaps,
      profile_border,
      profile_flair,
      custom_title,
      is_demo,
      is_system,
      vcard,
      header_image_url,
      header_image_asset_id,
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

  const live = await loadLibraryAssetUrls([profile.header_image_asset_id])
  const headerImageUrl = columnImageUrl(profile.header_image_url, profile.header_image_asset_id, live)
  // The member's Website (Settings > Profile), rendered on the facts line as an external link.
  // Until L9-02 the setting saved to profiles.website and nothing read it back. safeWebsite is
  // the one seam: http(s) only (a stored `javascript:` value must never reach an href), a bare
  // domain read as https, and the hostname as the label.
  const website = safeWebsite(profile.website)
  // Where the header banner sits in its cropped hero window (owner's focal picker), stored on meta.headerFocal.
  const headerFocus = readProfileHeaderFocus((profile as { meta?: unknown }).meta)
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
  // The equipped cosmetics (LIVE-013). Read off the same single profile read as everything else
  // in the band; each renderer no-ops on null or on a value the registry cannot paint, so a
  // member who equipped nothing gets exactly the band they had before.
  const equippedBorder = (profile as { profile_border?: string | null }).profile_border ?? null
  const equippedFlair = (profile as { profile_flair?: string | null }).profile_flair ?? null
  const equippedTitle = (profile as { custom_title?: string | null }).custom_title ?? null
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
  // SCAN-683: the wall closes on a block in EITHER direction (the one-way read above drives the
  // Block/Unblock button, which must stay one-way).
  const blockedEitherPromise = isRelationalViewer
    ? isBlockedBetween(myProfileId!, profileId)
    : Promise.resolve(false)
  // The viewer's OWN merged contact card (docs/NETWORK-CRM.md) — same gate (signed-in
  // non-owner) as before, just folded into the batch.
  const linkedContactPromise =
    myProfileId && !isOwner ? getLinkedContactForProfile(myProfileId, profileId) : Promise.resolve(null)

  const [
    journeysDone, completionsCountResult, postsCountResult, circlesResult, signature, awards,
    payoutsAreLive, connectStatus, profileCaps, globalCaps, realWebRole,
    friendResult, isBlocked, blockedEither, myLinkedContact,
  ] = await Promise.all([
    // Journeys finished THIS SEASON — the canonical rank-ladder driver (same source the
    // feed / crew home / leaderboard use). The displayed Zaps number is a separate value
    // (profiles.lifetime_zaps, read off the row below) — they are not the same metric.
    journeysFinishedThisSeason(profileId),
    admin.from('crew_completions').select('id', { count: 'exact', head: true }).eq('profile_id', profileId),
    admin.from('posts').select('id', { count: 'exact', head: true }).eq('author_id', profileId).is('parent_id', null).is('hidden_at', null),
    // Circle memberships — the ONLY thing this still feeds is the `Circle Up` achievement chip,
    // which is public. It therefore carries the listing gate (ADR-895): the extra columns are read
    // so the rows can be narrowed below to circles a stranger could find by browsing. Before this,
    // the read was unfiltered and the band printed "{n} circles" with a deep link, so a visitor
    // learned that this member belonged to exactly one UNLISTED Circle and received its slug. The
    // band line is gone; narrowing the read is what stops the achievement republishing the same bit
    // three DOM nodes away.
    admin.from('memberships').select('circles!circle_id ( id, name, slug, unlisted, status, space_id, image_url )').eq('profile_id', profileId).eq('status', 'active'),
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
    blockedEitherPromise,
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

  // Circles a stranger could find by browsing: not hidden from the index, in a status whose ROW an
  // ordinary member may read (`archived` needs host+, `draft` needs guide+), and not owned by a
  // Space (the Space wall is a RESTRICTIVE policy, and this page reads through the admin client
  // where it never fires). Same allowlist as lib/people/associations.ts tier A.
  //
  // The wall itself comes FROM that module (isUnwalledSpaceId) rather than being spelled again
  // here. It used to read `c.space_id === null`, which stopped matching anything once
  // 20260712030000 began stamping every row's space_id to the root tenant — the same defect that
  // emptied all four Association tiles, and the reason the rule now lives in exactly one place.
  const rootSpaceId = await loadRootSpaceId()
  const LISTABLE_CIRCLE_STATUS = ['forming', 'active', 'inactive']
  const circles = ((circlesResult.data ?? []) as unknown as {
    circles: { id: string; name: string; slug: string; unlisted: boolean; status: string; space_id: string | null; image_url: string | null } | null
  }[])
    .map(m => m.circles)
    .filter((c): c is { id: string; name: string; slug: string; unlisted: boolean; status: string; space_id: string | null; image_url: string | null } =>
      !!c && c.unlisted === false && LISTABLE_CIRCLE_STATUS.includes(c.status) && isUnwalledSpaceId(c.space_id, rootSpaceId))

  // Rank, next tier, and progress come from the one canonical source (season-ranks),
  // so the profile shows the same ladder as the feed, crew home, and leaderboard.
  const { def: rankDef, next: rankNext, pct: rankPct, zapsToNext } = rankProgress(journeysDone)
  // Rank is *endorsed* (shown publicly) only on the paid Crew tier; a
  // free member earns it but it stays in their own Vault, not on their public
  // profile (ADR-141, PB.1i: tier, not role). Inert in Beta (everyone is comped Crew).
  const rankEndorsed = isEndorsed(profile.membership_tier)
  // The Supporter BADGE is the thank-you for backing the community, orthogonal to role and rank.
  // ADR-1709 (LIVE-755): it follows active Crew, whatever amount was picked, and fades 45 days after
  // support stops (supporterMarkShows). It no longer reads profiles.is_supporter, which recorded the
  // retired "at or above the suggested amount" rule and was never cleared when support ended.
  const isSupporter = supporterMarkShows(profile)

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
  // Stage reveal (LIVE-669, lib/unlocks.ts): on your OWN profile the Achievements grid waits until
  // setup is done, so a newcomer is not handed a row of empty badges. A visitor always sees it.
  // Fail-open: a progress read error shows the grid.
  const showAchievements =
    !isOwner ||
    (await getCachedMemberProgress(profileId)
      .then((p) => stageUnlocked('profile.achievements', p.stage.index))
      .catch(() => true))

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
  // The bought flair and title, wired ONCE and worn by both designs' status clusters.
  const cosmetics = (
    <>
      <CosmeticFlair value={equippedFlair} />
      <CosmeticTitle value={equippedTitle} />
    </>
  )



  // The secondary, lower-stakes controls (Block · janitor "Act as") live BELOW the cover, on the
  // join-date line (owner directive, 2026-07-28). They used to render as a second row nested inside
  // the hero's actions slot, which is what bent the on-cover button row: the hero lays its actions
  // out in ONE wrapping flex row, so a two-row never-shrink column inside it wrapped the whole
  // cluster down onto the @handle line and collided with the name. The hero now gets a FLAT list of
  // chips only, and these render in `secondaryControls` under the header.
  const hasSecondary = (!isOwner) || isJanitorViewer

  // Block · janitor "Act as" — the secondary controls, rendered UNDER the cover on the join-date
  // line (owner directive, 2026-07-28). Small text links: they must not compete with
  // Friends/Message/Settings for weight, and off the photo they never collide with the name lockup.
  // PHONE (< sm): these get their own right-aligned row instead of trailing a four-row wrap of
  // grey micro-text. On a 375px screen the facts line already spends its first row on region +
  // "Joined <Month Year>", so Block and "Act as" landed as the tail of the third or fourth wrapped
  // row — the two highest-consequence controls on the page reading as noise. `max-sm:w-full` puts
  // them on their own flex line; `max-sm:justify-end` keeps them right, away from the facts they
  // are not part of. Nothing is declared at or above 640px, so the single-line desktop layout is
  // untouched.
  const secondaryControls = user && hasSecondary ? (
    <span className="flex items-center gap-3 max-sm:w-full max-sm:justify-end">
      {!isOwner && <BlockButton profileId={profileId} blocked={isBlocked} variant="link" />}
      {/* Janitor full control: become this member (session swap). The server action
          re-checks the real janitor web_role before swapping. */}
      {isJanitorViewer && (
        <form action={actAsMember.bind(null, profileId)}>
          <button
            type="submit"
            className="inline-flex items-center gap-1 text-meta font-medium text-signal-strong transition-colors hover:underline"
            title="Act as this member (full control)"
          >
            <UserCog className="h-3 w-3" />
            Act as {firstName}
          </button>
        </form>
      )}
    </span>
  ) : null
  const fqTab = tab === 'posts' || tab === 'circles' || tab === 'practice' ? tab : 'story'
  const base = `/people/${profile.handle as string}`
  // The reference's four numbers are in-person counts (check-ins, people met), read from the host's
  // attendance marks; the Circles and Practice tabs read only what their tab shows.
  // The header photo (SCAN-882) through the same ladder the DAWN band reads: the member's own photo
  // and focal point, the operator's /people image behind it, then a brand photo picked from the
  // member's id, so the cover is never missing.
  const [fqHero, inPerson, tenure, myJourneys, practiceCounts] = await Promise.all([
    resolveIdentityHero(`/people/${profile.handle as string}`, {
      entityImage: headerImageUrl,
      entityFocus: headerFocus,
      fallbackImage: fqPlaceholderArt(profileId),
    }),
    getInPersonCounts(profileId),
    fqTab === 'circles' ? getCircleTenure(profileId, circles.map((c) => c.id)) : Promise.resolve(new Map()),
    fqTab === 'practice' && isOwner ? getMemberJourneyProgress(profileId) : Promise.resolve([]),
    fqTab === 'practice' && isOwner ? getPracticeCounts(profileId) : Promise.resolve([]),
  ])
  // The status cluster without the DAWN rank pill: the season rank wears the kit's glass tag instead.
  const fqBadges = (
    <>
      {cosmetics}
      <FoundingBadge founding={profile.is_founding_member} />
      {isSupporter && <SupporterBadge />}
      {isDemo && <DemoBadge />}
    </>
  )
  const fqActions = isOwner ? (
    <>
      <OpenAdminBarButton
        scope={{ kind: 'profile', id: profileId }}
        label="Edit profile"
        icon={<FqIcon name="edit" />}
        className="btn"
      />
      <Link className="btn pa" href="/codes">
        <FqIcon name="qr" />
        My Code
      </Link>
      {vcardEnabled && (
        <a className="btn" href={`${profilePath}/vcard`}>
          <FqIcon name="contacts" />
          Save contact
        </a>
      )}
      <QrShareDropdown manager className="btn" />
    </>
  ) : (
    <>
      {user && !isBlocked && <FriendButton targetProfileId={profileId} state={friendState} />}
      {user && vcardEnabled && (
        <a className="btn" href={`${profilePath}/vcard`}>
          <FqIcon name="contacts" />
          Save contact
        </a>
      )}
      {user && !isBlocked && friendState.kind === 'accepted' && (
        <MessageMemberButton profileId={profileId} threadTitle={firstName} className="btn">
          <FqIcon name="message" />
          Message
        </MessageMemberButton>
      )}
      {user && !isBlocked && canTipRecipient && <TipButton toProfileId={profileId} recipientName={firstName} />}
      {user && isStaffViewer && (
        <ProfileSettingsDrawer
          profileId={profileId}
          handle={profile.handle as string}
          initialName={profile.display_name}
          initialBio={profile.bio ?? ''}
          spotlightEnabled={spotlightEnabled}
          spotlightPublished={spotlightPublished}
          canModerate={canModerateProfile}
          isJanitor={isJanitorViewer}
          triggerClassName="btn"
        />
      )}
      <QrShareDropdown manager={false} className="btn" />
    </>
  )
  const isCrew = isEndorsed(profile.membership_tier)
  const fqChips = (
    <div className="row wrap">
      {role !== 'member' && roleBadge}
      {rankEndorsed && <span className="tag glass">{rankDef.label}</span>}
      {isCrew && <TierChip tier="crew" />}
      {/* The rest of the status cluster the DAWN band wears: the bought flair and title, Founder,
          Supporter, demo. */}
      {fqBadges}
    </div>
  )
  const metaLine = (
    <>
      @{profile.handle as string}
      {regionName ? ` · ${regionName}` : ''} · Member since {joinedDate}
      {website && (
        <>
          {' · '}
          <a href={website.href} target="_blank" rel="noopener noreferrer nofollow">
            {website.label}
          </a>
        </>
      )}
    </>
  )
  const tabContent =
    fqTab === 'circles' ? (
      <ProfileCircles
        circles={circles.map((c) => {
          const t = tenure.get(c.id)
          return { id: c.id, name: c.name, slug: c.slug, imageUrl: c.image_url, since: sinceLabel(t?.joinedAt ?? null), checkins: t?.checkins ?? 0 }
        })}
        emptyLine={isOwner ? 'No Circles yet. Find one near you.' : `${firstName} is not in a public Circle yet.`}
      />
    ) : fqTab === 'practice' ? (
      <ProfilePractice
        journeys={myJourneys.map((j) => ({
          slug: j.slug,
          title: j.title,
          percent: j.percent,
          line: j.phasesTotal > 0 ? `${j.phasesComplete} of ${j.phasesTotal} phases` : `${j.percent}%`,
        }))}
        practices={practiceCounts.map((p) => ({
          id: p.id,
          title: p.title,
          href: `/practices/${p.id}`,
          sessions: p.sessions,
        }))}
      >
        <FrequencySignature signature={signature} variant="full" layout="stack" name={isOwner ? undefined : firstName} />
      </ProfilePractice>
    ) : (
      <div className="stack mc-gap-24">
        {fqTab === 'story' && myProfileId && !blockedEither && (
          <Composer
            scopeId={profileId}
            visibility="public"
            placeholder={isOwner ? 'What’s on your mind?' : `Leave something for ${firstName}…`}
          />
        )}
        <Suspense fallback={<ProfileFeedSkeleton />}>
          {fqTab === 'posts' ? (
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
    )
  return (
    <ShareRefProvider profileId={profileId}>
      <ProfileBody
        notice={
          tippedCents !== null ? (
            <div className="mc-note">
              <span className="t1">
                Thank you. Your ${(tippedCents / 100).toFixed(2)} tip to {firstName} is on its way.
              </span>
            </div>
          ) : null
        }
        cover={{ image: fqHero.coverImage ?? fqPlaceholderArt(profileId), focus: fqHero.coverFocus }}
        avatar={
          <CosmeticBorder value={equippedBorder}>
            <ProfilePhoto src={profile.avatar_url} initials={initials} name={profile.display_name} />
          </CosmeticBorder>
        }
        metaLine={metaLine}
        name={profile.display_name}
        chips={fqChips}
        bio={<EditableIdentity isOwner={isOwner} bio={profile.bio ?? ''} />}
        actions={fqActions}
        secondary={secondaryControls}
        stats={[
          { value: currentStreak.toLocaleString(), label: 'Day streak' },
          { value: inPerson.checkinsThisYear.toLocaleString(), label: inPerson.checkinsThisYear === 1 ? 'Check-in this year' : 'Check-ins this year' },
          { value: circles.length.toLocaleString(), label: circles.length === 1 ? 'Circle' : 'Circles' },
          { value: inPerson.peopleMet.toLocaleString(), label: inPerson.peopleMet === 1 ? 'Person met in person' : 'People met in person' },
        ]}
        panels={
          <>
            {myLinkedContact && <PrivateContactPanel card={myLinkedContact} memberName={firstName} />}
            {!isOwner && !!user && !isBlocked && (
              <ConnectionPanel
                profileId={profileId}
                firstName={firstName}
                friendAction={friendState.kind === 'none' ? <FriendButton targetProfileId={profileId} state={friendState} /> : undefined}
              />
            )}
            {!isOwner && roleUnlocked('profile.member-support', myRole) && <MemberSupportPanel profileId={profileId} />}
            <Suspense fallback={null}>
              {isOwner ? <OwnerProfileLayoutPreview handle={handle} /> : <ProfileSpotlightBlocks handle={handle} />}
            </Suspense>
          </>
        }
        tabs={[
          { key: 'story', label: 'Story', href: base },
          { key: 'posts', label: postCount ? `Posts · ${postCount}` : 'Posts', href: `${base}?tab=posts` },
          { key: 'circles', label: 'Circles', href: `${base}?tab=circles` },
          { key: 'practice', label: 'Practice', href: `${base}?tab=practice` },
        ]}
        activeTab={fqTab}
        tabContent={tabContent}
        side={
          <>
            <Suspense fallback={null}>
              <ProfileAssociations
                profileId={profileId}
                handle={profile.handle as string}
                firstName={firstName}
                viewerProfileId={myProfileId}
                isOwner={isOwner}
                blocked={isBlocked}
              />
            </Suspense>
            <ProfileStanding
              isOwner={isOwner}
              rankLabel={rankDef.label}
              nextLabel={rankNext?.label ?? null}
              pct={rankPct}
              zapsToNext={zapsToNext}
              rows={[
                { label: 'Zaps', value: lifetimeZaps.toLocaleString(), href: '/crew/leaderboard' },
                { label: 'Gems', value: gems.toLocaleString(), href: '/crew/store' },
                { label: 'Streak', value: `${currentStreak} ${currentStreak === 1 ? 'day' : 'days'}`, href: '/crew/leaderboard' },
                { label: 'Rank', value: rankDef.label, href: '/crew/leaderboard' },
              ]}
            />
            {showAchievements && (
              <ProfileAchievements
                items={rewards.map((r) => ({
                  label: r.label,
                  description: r.description,
                  earned: r.earned,
                  current: r.current,
                  target: r.target,
                  milestone: r.milestone,
                }))}
              />
            )}
            <ProfileAwards awards={awards} firstName={firstName} isOwner={isOwner} />
            {isOwner && isCrew && (
              <div className="soft stack mc-start">
                <span className="k">Crew</span>
                <span className="h3">You&apos;re Crew this season.</span>
                <span className="t2">Thank you for backing the community. Your rank shows on your profile while you are Crew.</span>
              </div>
            )}
            {isOwner && (
              <Suspense fallback={null}>
                <HubLinks
                  title="You"
                  boxed
                  links={(v) => hubLinks('{profile}', v).filter((l) => !(isCrew && l.href === '/upgrade'))}
                />
              </Suspense>
            )}
          </>
        }
      />
    </ShareRefProvider>
  )
}

// Suspense fallback for the streamed timeline — a few pulsing bars sized to the feed
// rows, so the space is reserved (no layout shift) while the posts resolve.
function ProfileFeedSkeleton() {
  return (
    <div className="space-y-4" aria-hidden>
      {[0, 1, 2].map((i) => (
        <div key={i} className="rounded-card border border-border bg-surface p-4 lift-1">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 animate-pulse rounded-pill bg-surface-elevated" />
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


