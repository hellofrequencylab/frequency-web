import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Settings } from 'lucide-react'
import { getCachedUser, getMyProfileId } from '@/lib/auth'
import { leaveCircle } from '../../actions'
import { JoinCircleButton } from '@/components/circles/join-circle-button'
import { CircleHandoffBanner } from '@/components/circles/circle-handoff-banner'
import { CircleCreateMenu } from '@/components/circles/circle-create-menu'
import { CircleMemberMenu } from '@/components/circles/circle-member-menu'
import { OpenAdminBarButton } from '@/components/admin/open-admin-bar-button'
import { circleCapabilities } from '@/lib/circles/detail-access'
import { CircleLocked } from '@/components/circles/circle-locked'
import { DeviceNudge } from '@/components/push/device-nudge'
import { QrShareDropdown } from '@/modules/qr'
import { BoostButton } from '@/components/crew/boost-button'
import { resolveIdentityHero } from '@/lib/layout/detail-hero'
import { loadCircleShell } from '@/lib/circles/store'
import { LISTABLE_CIRCLE_STATUS } from '@/lib/circles/visibility'
import { circleTabs } from '@/lib/circles/tabs'
import {
  circleHeroOverlayStyle,
  hasCircleHeroHeight,
  readCircleCoverFocus,
  readCircleHeroHeight,
} from '@/lib/circles/hero'
import { ClaimCircle } from '@/components/circles/claim-circle'
import { listPublicPractices } from '@/lib/practices'
import { circleEventInsider, loadCircleContentFacts, loadCircleUpcomingEvents } from './tab-facts'
import { spaceCircleEventScope } from '@/lib/events/circle-upcoming'
import { sisterCircleOffer } from '@/lib/circles/sister'
import { SisterCirclePrompt } from '@/components/circles/sister-circle-prompt'
import { FqCircleShell } from '@/components/frequency/members/circle/circle-shell'
import { FqMeetups, type MeetupView } from '@/components/frequency/members/circle/circle-meetups'
import { FqCircleHealthPanel } from '@/components/frequency/members/circle/circle-health-panel'
import { loadAttendanceLine, loadCirclePageFacts, loadMeetupPicks } from '@/lib/circles/page-facts'
import { getCircleHealth } from '@/lib/circles/earned'
import { insightAffordance } from '@/lib/core/scoped-surface-ui'
import { surfaceAccess } from '@/lib/core/viewer-hats'
import { isoDaysAgo } from '@/lib/utils'
import { FqCircleSpaceHeader } from '@/components/frequency/members/space/circle-space-header'
import { owningSpaceSlug } from '@/lib/circles/owning-space'
import { loadRootSpaceId } from '@/lib/spaces/store'

// ── THE CIRCLE DETAIL SHELL (PAGE-FRAMEWORK §3, "How templates map to Next.js") ──────────────────
//
// A Detail page IS a route-segment layout: the context header + tabs live here, the tab bodies slot
// in as `children`. Navigating between tabs preserves this header (partial rendering) instead of
// repainting it.
//
// WHY A ROUTE GROUP. `manage/`, `settings/`, `edit/` and `crm/` are SIBLINGS of `(circle)/`, outside
// the group, so they never inherit this chrome. That is the shape app/(main)/spaces/[slug]/(profile)
// /layout.tsx settled on, and for the reason recorded there: the alternative — one shared layout
// that branches on the request path — is invalid in the App Router, because a layout does not
// re-render across its child segments and its output is cached per instance. A prefetch of an owner
// sub-route would poison the header for the profile itself.
//
// WHY THE TAB STRIP IS A CLIENT LEAF. Same cause, different symptom: this layout renders ONCE for
// the whole tab group, so a server-computed `active` tab would freeze on whichever tab you landed
// on first. <UnderlineTabs> resolves it from usePathname, the only signal that stays true across
// soft navigation. It is the smallest client boundary on the page; everything else here is a Server
// Component. The strip is a <nav> of real links carrying aria-current="page" — these tabs are
// ROUTES, so they must never wear ARIA tab/tablist roles (the most common bug in this pattern).
//
// WHY THE RAIL IS UNTOUCHED. Nothing is registered in lib/layout/page-chrome.ts for this route and
// nothing should be: FOCUS_NONE_PREFIXES / SCOPED_PREFIXES / SCOPED_PATTERNS are empty on purpose
// (owner directive 2026-06-20, reaffirmed 2026-07-28 after the Channel 'scoped' experiment was
// reversed the same night), so /circles/<slug> and every tab under it keep the 'global' community
// rail. The circle ADMIN rail also needs no edit: adminScopeFor matches /^\/circles\/([^/]+)/ as a
// PREFIX, so a tab route resolves to the same circle scope its parent does (locked by
// lib/layout/page-chrome.test.ts).
//
// ── THE HEADER: THE COVER LOCKUP, RESTORED (owner ruling, 2026-08-13) ────────────────────────────
//
// 🔴 READ THIS BEFORE CHANGING THE HEADER. It has now been rewritten twice and reverted once, and
// the revert was the owner's, in these words: *"The old header was perfect, I just wanted you to
// rearrange the content."* The 2026-08-12 version moved the title OFF the cover and into the
// template's own identity lockup below it. That is a defensible pattern in the abstract and it is
// NOT what this product uses: every other destination page — the Space profile, the Journey page,
// the person profile — opens on one immersive cover with the title riding it (ADR-793, the unified
// entity header). A Circle that alone put its title in a text row below the photo was the odd one
// out, and it read as one.
//
// So the `hero` + `band` shape is back, exactly as ADR-793 specifies it:
//
//   1. COVER    — ONE immersive PageHero as DetailTemplate's `hero` slot: rounded, bordered, height
//                 off the header element's size ladder. No cover photo = the neutral token gradient.
//                 Never a bare cover card with the title stranded underneath it.
//   2. TUNABLE  — variant / height / overlay + the cover ladder resolve through `resolveIdentityHero`
//                 (ADR-1136, one resolver for every entity band), so /admin/elements
//                 retunes the band with no deploy, and the operator's saved hero height wins over it.
//   3. TITLE    — the single page <h1> rides the cover, bottom-left, over the ink scrim. This is
//                 the ONLY h1 on the page: the body tabs beneath are bodies, not shells
//                 (check:headers proves it). The uppercase "CIRCLE" eyebrow that used to stack
//                 above it is now a PILL in the cover's top-left corner (PageHero's `corner` slot),
//                 on the owner's 2026-09-17 ruling — and on a Space Circle that pill is a link to
//                 the owning Space.
//   4. HISTORICAL SUBTITLE — the former PageHero purpose-summary rule was retired by HYG-203.
//                 The active Frequency shell renders member/type/place metadata under the title
//                 and keeps the human About text in its own panel.
//   5. BAND     — below the hero, and it is the part that moved. See the next block.
//   6. BACK     — DetailTemplate's `back` slot, above the band. The breadcrumb and the back link
//                 coexisted here for a year and the owner reads both as correct; this is not the
//                 page to relitigate it on.
//
// ── THE ACTIONS SIT IN THE BAND, ON THE FACT LINE (owner ruling, 2026-08-13, second pass) ────────
//
// The cover carries NO buttons. It carries the eyebrow, the title and the place, and nothing else.
//
// This moved twice in one night and the second move is the one that stands. First the owner put
// Edit and Manage back beside Post: *"Those are admin only. put them to the right by the post
// button."* They landed on the cover, where the primary already was. Then, seeing that:
// *"Move buttons under header on the same line with forming / in person pills & member count."*
//
// So the band's first line is now: chips + member count + Host on the left, every button on the
// right. One line, one baseline, and the facts the buttons act on are beside the buttons.
//
// 🔴 THE BUTTONS ARE NO LONGER ON A PHOTO, WHICH CHANGES THEIR CLASS. `HERO_ACTION_CLASS` is the
// kit's glassy on-ink treatment: translucent white over a backdrop blur, legible on an arbitrary
// image and effectively invisible on the page background. Moving a button off the cover without
// changing its class is how it disappears. Every button in the band takes `buttonClasses()`.
//
// Gating is unchanged: Edit and Manage are `circle.editSettings`, the SAME capability the admin
// rail's circle modules use, resolved once by `circleCapabilities` above.
//
// ── THE ROW WENT FROM FIVE BUTTONS TO TWO (owner ruling, 2026-09-17) ─────────────────────────────
//
// *"Remove: Post. Move Create to the header. Make Leave group a subtle setting somewhere else and
// not a primary button."*
//
// It read Post · Edit · Manage · Create · Leave, which is five controls of near-equal weight and
// two of them primary-amber. A member's row now holds ONE control and a manager's holds three:
//
//   member    Create                     (the menu carries New post)
//   manager   Create · Edit · Manage
//   visitor   Join                       (or a disabled "Full")
//
// POST DID NOT LOSE ITS DOOR, IT MOVED INSIDE CREATE. On the Feed tab the button was a link to a
// composer already on screen; on Members, What's On and Circle Stats there is no composer, so the
// button could not simply be deleted. `CircleCreateMenu` leads with "New post", anchored to the
// same `#circle-post` target, and it is no longer host-only for exactly that reason.
//
// LEAVE MOVED TO THE TAB ROW, behind the overflow control beside QR & Share (`CircleMemberMenu`).
// It could not move to the admin rail with the host tools: the rail is gated on
// `circle.editSettings`, which a plain member does not hold, so the only viewer who needs Leave is
// the one viewer who would never find it there.
//
// THE OPERATOR'S THREE COVER CONTROLS are native to this shape and need no special handling: hero
// HEIGHT, cover FOCAL POINT and the cover SCRIM are PageHero's own props, which is what they were
// written against. (Between 2026-08-12 and this revert they were briefly routed through
// DetailTemplate's standard cover path instead. That path keeps its `coverFocus`/`coverSize`/
// `coverOverlayStyle` props — other Detail pages use them — it is just not what a Circle takes.)
//
// ── THE MENU ROW CARRIES "QR & SHARE" AT ITS RIGHT END (owner ruling, 2026-08-13) ────────────────
//
// *"Remove QR & Share line. Move QR & Share to menu row aligned right."*
//
// QR & Share used to render on its OWN line below the tabs, sitting on the header's hairline rule,
// put there by the framework's `PageAdminBar asDivider`. That is a whole row of chrome for one
// control, and it pushed the Circle's content a line further down on every tab.
//
// It now shares the tab row: tabs left, share right, one line. The hairline itself STAYS —
// PageAdminBar still draws it — because the rule under a header is structure; the button on it was
// the redundancy.
//
// 🔴 HOW THE DUPLICATE IS PREVENTED, and why it is not a new mechanism. `circles` came out of
// `SHAREABLE_PREFIXES` in components/layout/page-admin-bar.tsx. That list is the file's OWN
// established seam: People and Journeys are already absent from it, and its comment says why in
// exactly this situation — both "carry their OWN 'QR & Share' control in the header actions, so the
// divider control would duplicate it." Putting `circles` back without removing the control below
// would put the same button on the page twice, one line apart.
//
// The row renders even when the strip does not. A Circle too small to earn tabs (ADR-089) keeps its
// share control instead of losing it as a side effect of having no tabs, so the empty `<span />` on
// the left is load-bearing: it holds the left edge and keeps the control right-aligned.
//
// The scrim mapping is NOT written here and must never be: `lib/layout/cover-scrim.ts` holds the
// one operator-vocabulary → PageHero-prop mapping (none/shade/blend → none/shadow/fade), shared
// with Spaces, and `circleHeroOverlayStyle` in lib/circles/hero.ts only says "read it off a
// Circle's theme blob". A second copy is how Spaces and Circles drift into disagreeing about what
// "Blend" looks like.
//
// ── SPEED (PAGE-FRAMEWORK §5) ────────────────────────────────────────────────────────────────────
// This file used to run FOUR serial awaits before it returned any JSX, which is §5.3's named
// anti-pattern: nothing can stream until the last one lands. It is now two rounds, and the second
// is a single Promise.all:
//   round 1 — the Circle itself + the viewer's profile id (both request-memoized).
//   round 2 — capabilities, the viewer's Crew hat, and the three tab-content facts, in parallel.
// Everything that is not identity streams behind its own <Suspense>: the demo-claim card (which
// reads the whole practice library) and the tab body below, whose skeleton lives in loading.tsx.
// The tab-content facts stay INLINE and are the one deliberate exception: the strip is navigation,
// and navigation that pops in after the page paints moves the content under the reader's cursor.
// They are three light reads that overlap with the capability resolution, and each one is memoized
// for the tab body that renders next, so the strip costs the page no extra round trip.

export default async function CircleDetailLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params

  // Round 1. The circle + roster and the viewer, request-memoized: the tab page under `children`
  // calls the same loaders and gets memo hits, so the shell costs no extra reads.
  const [shell, myProfileId] = await Promise.all([loadCircleShell(slug), getMyProfileId()])
  if (!shell) notFound()
  // 🔴 `canEnter` AND ITS REASON ARE READ HERE NOW (LIVE-519). Every consumer used to destructure
  // around them, so a Circle this viewer may see but not enter rendered as a Circle with ZERO
  // MEMBERS: the shell blanks the roster on purpose (public face keeps the COUNT, never the
  // names), and with the verdict dropped there was nothing left to say why. The card that sent
  // them here promises better in its own comment: a closed Circle gets "See what's inside"
  // instead of Join because "the honest action is the circle's own page, which states the door".
  const { circle, members, theme, canEnter, entryReason } = shell

  const isMember = !!myProfileId && members.some((m) => m.profile?.id === myProfileId)
  const isHost = !!myProfileId && circle.host?.id === myProfileId

  // Round 2. Independent reads in one batch. `user` gates the signed-in-only banners, caps drives the
  // manager rules, and the content facts decide which tabs exist at all. Joining a Circle is free
  // (owner, 2026-10-14): Crew is for hosting one, so Join no longer asks whether the viewer pays.
  const [user, caps, content, hero, pageFacts, insightAccess] = await Promise.all([
    getCachedUser(),
    // Request-memoized, so the tab page under `children` asking the same question is a memo hit
    // rather than a second capability resolution (lib/circles/detail-access.ts).
    circleCapabilities(circle.id),
    // `insider` keys the memoized events read, and it is derived from the roster (not from caps)
    // so the Events tab can derive the SAME key and hit the memo. See circleEventInsider.
    loadCircleContentFacts(
      circle.id,
      circleEventInsider({ isMember, isHost }),
      spaceCircleEventScope(circle),
    ),
    // The identity band's chrome through the ONE resolver (PROG-P5, ADR-1136): the same ladder as
    // every entity cover — the Circle's own image_url on rung 1, the operator's /circles Settings
    // image behind it — plus the element-resolved variant/height (ADR-793) this layout used to
    // hand-roll. It joins this batch rather than sitting in front of the JSX, because the cover
    // cannot paint without it and a serial await here is PAGE-FRAMEWORK §5.3's anti-pattern.
    // The host's stored height and their TOTAL None/Shade/Blend overlay choice (added to the
    // Circle admin rail 2026-08-12) ride in as entity values, so both keep beating the element.
    resolveIdentityHero(`/circles/${slug}`, {
      // A Space's Circle with no cover of its own wears its Space's page header (owner, 2026-10-14, SCAN-898),
      // not the generic /circles image. The platform root is not a Space with a header to lend.
      entityImage: circle.image_url ?? (circle.space && circle.space.type !== 'root' ? (circle.space.cover_image_url ?? null) : null),
      entityFocus: readCircleCoverFocus(theme),
      entitySize: hasCircleHeroHeight(theme) ? readCircleHeroHeight(theme) : null,
      entityOverlayStyle: circleHeroOverlayStyle(theme),
    }),
    // The side column and the cover badge: Channels, the written rhythm and agreements, who logged this week.
    loadCirclePageFacts(circle.id),
    // Scoped Insight (ADR-225): the same question the Feed page asks, now for the side column's health panel.
    surfaceAccess('insight', { type: 'circle', id: circle.id }),
  ])

  const canManage = caps.has('circle.editSettings')
  // Draft circles are private to their managers (ADR starter-circles draft status): a draft is a
  // not-yet-published circle only its host/stewards (and staff) may see, so it can be built up
  // before it goes live. Anyone else gets a 404 by direct link, exactly as if it did not exist —
  // and it is already excluded from every discovery surface (index, /discover, sitemap RPC). The
  // gate lives HERE so it covers every tab beneath the shell, not just the Feed one.
  const isDraft = circle.status === 'draft'
  if (isDraft && !canManage) notFound()

  const full = circle.member_count >= circle.member_cap
  const nearCap = circle.member_count >= circle.member_cap * 0.9

  // Header status pill: draft → muted, forming → green, active → blue, full/closed → red.
  const statusPill = isDraft
    ? { label: 'Draft', cls: 'bg-surface-elevated text-subtle' }
    : full
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

  // Which tabs this Circle has earned. Pure + unit-tested in lib/circles/tabs.ts.
  const tabs = circleTabs({
    slug: circle.slug,
    memberCount: members.length,
    canManage,
    isMember,
    ...content,
  })

  // The ONE primary action, resolved to a single answer per viewer (owner ruling, 2026-09-17).
  // Someone already inside gets CREATE, the menu that now carries posting; everyone else gets Join.
  // Post as a button is gone: it was a link to a composer three inches below it on the tab that has
  // one, and "New post" inside Create is the door from the tabs that do not.
  // SCAN-691: Join only on a LIVE circle (forming or active). A draft, an inactive Space Circle or
  // an archived circle shows its pill and no door; joinCircle refuses the same set server-side.
  const isLive = (LISTABLE_CIRCLE_STATUS as readonly string[]).includes(String(circle.status))
  const canJoin = !isMember && !!myProfileId && !full && isLive
  const primary = isMember || isHost || canManage ? 'create' : canJoin ? 'join' : 'none'
  // A full Circle seeds a sister instead of turning people away (LIVE-665).
  const sisterOffer = sisterCircleOffer({
    memberCount: circle.member_count,
    memberCap: circle.member_cap,
    isLive,
    signedIn: !!myProfileId,
    isHost,
    isMember,
  })
  // Memo hit: loadCircleContentFacts asked the same question with the same key above.
  const [upcoming, rootSpaceId] = await Promise.all([
    loadCircleUpcomingEvents(circle.id, circleEventInsider({ isMember, isHost }), spaceCircleEventScope(circle)),
    loadRootSpaceId(),
  ])
  // SCAN-881: a Circle that belongs to a Space (its space_id, the root excluded) opens under that
  // Space's own header, the one its Space pages wear; the Circle's cover, title, tabs and actions
  // follow below it. A personal Circle renders exactly as before.
  const owner = owningSpaceSlug(circle, rootSpaceId)
  const spaceName =
    circle.is_space_primary && circle.space && circle.space.type !== 'root'
      ? circle.space.brand_name || circle.space.name
      : null
  const place = circle.neighborhood ?? circle.city ?? null

  // The viewer's own view of this page: the same four the design draws (templates/circles/Circles.dc.html).
  const justJoined =
    isMember && members.some((m) => m.profile?.id === myProfileId && m.joined_at >= isoDaysAgo(7))
  const view: MeetupView = canManage || isHost ? 'host' : !isMember ? 'visitor' : justJoined ? 'new' : 'member'
  const insight = insightAffordance(insightAccess)
  const showsHealth = canManage || insight.visible
  const hostFirstName =
    circle.is_space_primary || !circle.host?.display_name ? null : (circle.host.display_name.split(/\s+/)[0] ?? null)
  // Meetup answers, who is going (the roster sees names), the viewer's attendance, and the manager's health numbers.
  const [picks, attendance, health] = await Promise.all([
    canEnter ? loadMeetupPicks(upcoming.events, myProfileId, isMember || canManage) : Promise.resolve([]),
    canEnter && isMember && myProfileId && view !== 'new' ? loadAttendanceLine(circle.id, myProfileId) : Promise.resolve(null),
    showsHealth
      ? getCircleHealth(
          circle.id,
          members.map((m) => m.profile?.id).filter((id): id is string => Boolean(id)),
          isoDaysAgo(7),
        )
      : Promise.resolve({ earnedZaps: 0, activeStreaks: 0, newThisWeek: 0 }),
  ])
  const online = circle.type === 'online'
  const placeLine = online ? 'Meets online' : place
  const circleShell = (
    <FqCircleShell
      inSpace={!!owner}
      notices={
        <>
          {isDraft && (
            <div className="panel stack" role="status">
              <span className="t1">This circle is in draft</span>
              <span className="t2">
                Only you can see it. It stays off the Circles directory, map, and search until you publish
                it from the builder.
              </span>
            </div>
          )}
          {user && <CircleHandoffBanner circleId={circle.id} />}
          {circle.is_demo && user && (
            <Suspense fallback={null}>
              <DemoClaimCard circleId={circle.id} name={circle.name} about={circle.about} />
            </Suspense>
          )}
        </>
      }
      coverImage={hero.coverImage}
      statusLabel={nearCap && !full ? `${statusPill.label} · Almost full` : statusPill.label}
      live={!isDraft && !full && circle.status === 'active'}
      name={circle.name}
      subline={[
        `${circle.member_count} ${circle.member_count === 1 ? 'member' : 'members'}`,
        typeLabel,
        place,
      ]
        .filter(Boolean)
        .join(' · ')}
      invite={<QrShareDropdown manager={canManage} className="btn" />}
      primary={
        <>
          {primary === 'create' && (
            <CircleCreateMenu circleId={circle.id} circleSlug={circle.slug} canPost={isMember || isHost} canManage={canManage} />
          )}
          {primary === 'join' && (
            <JoinCircleButton circleId={circle.id} circleSlug={circle.slug} label="Join" className="btn pa" />
          )}
          {!isMember && myProfileId && full && (
            <button type="button" className="btn" disabled>
              Full
            </button>
          )}
        </>
      }
      admin={
        canManage ? (
          <>
            <OpenAdminBarButton
              scope={{ kind: 'circle', id: circle.id }}
              caps={Array.from(caps)}
              label="Edit"
              icon={<Settings className="h-4 w-4" />}
              className="btn"
            />
            <Link href={`/circles/${circle.slug}/manage`} className="btn">
              Manage
            </Link>
          </>
        ) : null
      }
      sister={sisterOffer ? <SisterCirclePrompt circleId={circle.id} reason={sisterOffer} /> : null}
      badge={
        isDraft || full || circle.status !== 'active'
          ? { text: nearCap && !full && !isDraft ? `${statusPill.label} · Almost full` : statusPill.label, live: false }
          : pageFacts.hereThisWeek > 0
            ? { text: `${pageFacts.hereThisWeek} here this week`, live: true }
            : nearCap
              ? { text: 'Almost full', live: false }
              : null
      }
      channels={pageFacts.channels}
      rhythm={pageFacts.rhythm}
      hostedBy={
        spaceName && circle.space ? (
          <>
            Hosted by <Link href={`/spaces/${circle.space.slug}`}>{spaceName}</Link>
          </>
        ) : circle.host ? (
          <>
            Hosted by <Link href={`/people/${circle.host.handle}`}>{circle.host.display_name}</Link>
          </>
        ) : null
      }
      meetups={
        picks.length > 0 ? (
          <FqMeetups
            picks={picks}
            view={view}
            signedIn={!!myProfileId}
            hostFirstName={hostFirstName}
            attendance={attendance}
          />
        ) : null
      }
      agreements={pageFacts.agreements}
      faces={members
        .filter((m) => m.profile)
        .slice(0, 6)
        .map((m) => ({ id: m.profile.id, name: m.profile.display_name, avatarUrl: m.profile.avatar_url }))}
      place={canEnter ? placeLine : null}
      meetLine={
        canEnter && (place || pageFacts.rhythm)
          ? `${[online ? 'Online' : 'In person', pageFacts.rhythm].filter(Boolean).join(', ')}.`
          : null
      }
      hostPanel={
        showsHealth ? (
          <FqCircleHealthPanel
            label={insight.visible ? insight.label : 'Circle health'}
            earnedZaps={health.earnedZaps}
            activeStreaks={health.activeStreaks}
            newThisWeek={health.newThisWeek}
          />
        ) : null
      }
      tabBase={`/circles/${circle.slug}`}
      tabs={canEnter ? tabs : []}
      tabTools={
        <>
          {myProfileId && !isHost && <BoostButton kind="circle" targetId={circle.id} />}
          {isMember && !isHost && <CircleMemberMenu leaveAction={leaveCircle.bind(null, circle.id)} />}
        </>
      }
      about={circle.about}
      hostLine={
        spaceName && circle.space ? (
          <>
            Hosted by <Link href={`/spaces/${circle.space.slug}`}>{spaceName}</Link>
          </>
        ) : circle.host ? (
          <>
            Host <Link href={`/people/${circle.host.handle}`}>{circle.host.display_name}</Link>
          </>
        ) : null
      }
      memberCount={circle.member_count}
      memberCap={circle.member_cap}
    >
      {canEnter ? (
        <>
          {isMember && <DeviceNudge context="circle" className="mb-4" />}
          {children}
        </>
      ) : (
        <CircleLocked
          reason={entryReason ?? 'closed'}
          circleSlug={circle.slug}
          spaceSlug={circle.space && circle.space.type !== 'root' ? circle.space.slug : null}
          spaceName={circle.space?.brand_name || circle.space?.name || null}
        />
      )}
    </FqCircleShell>
  )
  return owner ? <FqCircleSpaceHeader spaceSlug={owner}>{circleShell}</FqCircleSpaceHeader> : circleShell
}

// The demo-claim card's practice picker needs the whole public practice library. Only a claimable
// demo circle seen by a signed-in viewer ever pays for that read, and now it pays for it BEHIND a
// Suspense boundary instead of in front of the header (PAGE-FRAMEWORK §5.3).
async function DemoClaimCard({
  circleId,
  name,
  about,
}: {
  circleId: string
  name: string
  about: string | null
}) {
  const practices = await listPublicPractices()
  return (
    <ClaimCircle
      circleId={circleId}
      name={name}
      about={about}
      practices={practices.map((p) => ({ id: p.id, title: p.title }))}
    />
  )
}
