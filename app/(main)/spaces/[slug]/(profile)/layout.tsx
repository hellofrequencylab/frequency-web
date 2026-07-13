import { notFound } from 'next/navigation'
import { Suspense } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { SlidersHorizontal, ArrowUpRight } from 'lucide-react'
import { DetailTemplate } from '@/components/templates'
import { buttonClasses } from '@/components/ui/button'
import { getMyProfileId, getCallerProfile } from '@/lib/auth'
import { getVisibleSpaceBySlug, getSpaceVisibility } from '@/lib/spaces/store'
import { getSpaceClaimToken } from '@/lib/spaces/claim'
import { resolveSpaceManageAccess, getSpaceCapabilities } from '@/lib/spaces/entitlements'
import { usableSpaceFunctions, type SpaceFunctionKey } from '@/lib/spaces/functions'
import { getActiveSpace } from '@/lib/spaces/active-space'
import { trackSpaceProfileViewOnce } from '@/lib/spaces/analytics'
import { buildSpaceProfileNav } from '@/lib/spaces/profile-nav'
import { defaultAccentForType, defaultPrimaryCtaLabel } from '@/lib/spaces/profile-config'
import { readHeroConfig, resolveHero, heroHeightClass } from '@/lib/spaces/hero-config'
import { coverPlaceholderFor } from '@/lib/spaces/cover-placeholder'
import { resolveAccentVars } from '@/lib/spaces/accent'
import { parseSpaceTheme } from '@/lib/theme/space-themes'
import { getInitials, cn } from '@/lib/utils'
import { readCoverSize, readCoverScrim, readCoverFocus } from '@/app/(main)/spaces/[slug]/manage/layout/preferences'
import { readTagline } from '@/lib/spaces/tagline'
import { FollowSpaceButton } from '@/components/spaces/follow-space-button'
import { OpenAdminBarButton } from '@/components/admin/open-admin-bar-button'
import { readModuleMenuPrefs } from '@/lib/spaces/module-menu'
import { SpaceProfileMenu } from '@/components/spaces/space-profile-menu'
import { SpaceManageBoard } from '@/app/(main)/spaces/[slug]/manage/manage-board'
import { SpaceCrmSnapshot } from '@/app/(main)/spaces/[slug]/crm/crm-snapshot'
import { isFollowing } from '@/lib/spaces/follows'
import { AccentScope } from '@/components/spaces/accent-scope'
import { SpaceShareButton } from '@/components/spaces/space-share-button'
import { SpacePrivateNotice } from '@/components/spaces/space-private-notice'
import { JsonLd } from '@/components/json-ld'
import { spaceSchema, breadcrumbSchema } from '@/lib/jsonld'
import { getSpaceReviews } from '@/lib/spaces/content-data'

// ── THE NETWORKED ENTITY PROFILE CHROME (ENTITY-SPACES-BUILD §A.4 / §B.1) ────────────────────────
// This is the profile's ONE cohesive header for every public tab (Facebook/LinkedIn business-page
// grammar): a full-width COVER at the top (Header or Hero size, off preferences.coverSize) → ONE
// identity row (logo chip + the brand name as the single <h1> + type badge + tagline on the left; the
// action buttons — the primary CTA by type + Follow + Connect + owner tools — pushed RIGHT on the same
// line) → the menu row (Home + section anchors + custom pages, with the operator's Manage/CRM links
// right-aligned) → a hairline rule → the tab body (children). In the Hero size the identity row is
// overlaid on the bottom of the cover over a gradient scrim.
//
// WHY THIS IS A ROUTE-GROUP LAYOUT (the soft-nav header bug fix): the chrome used to live in the PARENT
// [slug]/layout.tsx, which decided whether to render it by reading the request path from the
// `x-pathname` header. That is invalid in the App Router: a layout does NOT re-render when you navigate
// between its child segments, and its rendered output is cached per instance. A prefetch of an owner
// sub-route (e.g. /manage) rendered the shared layout in its "no chrome" branch, and that chrome-less
// render was then reused when landing on the bare profile — so the whole header vanished until a hard
// refresh. The fix: the chrome lives in THIS layout, which wraps ONLY the public profile routes (the
// `(profile)` route group). Owner surfaces (manage/settings/crm/edit-page) are siblings OUTSIDE the
// group, so they never inherit the chrome and no path-branching is needed. The active tab is resolved
// client-side (SpaceProfileTabs → usePathname), the only signal that stays correct across soft nav.
//
// The Space itself is resolved + stamped once by the parent [slug]/layout.tsx; we read it back from the
// request-scoped active-space context (getActiveSpace), falling back to a re-resolve defensively.

// The cover PLACEHOLDER (a Space with no uploaded cover) is the SHARED deterministic pick from
// lib/spaces/cover-placeholder — the OG share card (opengraph-image.tsx) draws from the same source,
// so a shared link previews the SAME photo this hero shows.

// The action-row button GEOMETRY, sized to the compact `sm` scale so the identity row stays trim next
// to the avatar (the buttons were shrunk down a notch from `md`). On a photo (Hero overlay) a bordered
// translucent-white chip over a backdrop blur reads legibly on any cover (the gradient scrim guarantees
// the ≥4.5:1 floor); off-cover uses the canonical secondary token. Tokens only — no hardcoded hex; the
// translucent whites are legibility scrims.
const SM_BUTTON_GEOMETRY =
  'inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors'
const onInkSecondaryClasses = cn(
  SM_BUTTON_GEOMETRY,
  'border border-white/40 bg-white/10 text-on-ink backdrop-blur-sm hover:bg-white/20',
)

// The ONE dominant primary action: a real filled primary BUTTON on the Space header (owner ask — the
// header CTA is a BUTTON, while the Space INDEX card uses a text link). It keeps its accent fill in flow
// and over a Hero photo alike; on a cover photo it gains a soft shadow so it lifts off the image. Tokens
// only, no hex.
function primaryCtaButton(onInk: boolean): string {
  return buttonClasses('primary', 'sm', onInk ? 'shadow-md' : undefined)
}

function ownerToolClasses(onInk: boolean): string {
  return onInk ? onInkSecondaryClasses : buttonClasses('secondary', 'sm')
}

// A borderless, background-free ICON button for the compact mobile action band: just the glyph, no chip
// or white card behind it, so QR + Edit Space take minimal width and the primary CTA gets the room (owner
// ask). Square 40px tap target, muted glyph that fills in on press. Tokens only.
const ghostIconClasses =
  'inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface hover:text-text'

export default async function SpaceProfileChromeLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const viewerProfileId = await getMyProfileId()

  // The Space was resolved + stamped by the parent [slug]/layout.tsx; read it back. Fall back to a
  // re-resolve if the context is somehow empty (defensive; getVisibleSpaceBySlug fails closed).
  const space = getActiveSpace() ?? (await getVisibleSpaceBySlug(slug, viewerProfileId))
  if (!space) notFound()

  // Profile telemetry (the first signal on /spaces profiles): a profile-VIEW into the engagement
  // ledger, tagged with space_id. Non-blocking side effect — `void`-ed and deduped per request via
  // React.cache. This lives HERE (only the public profile), so owner-surface visits are never counted.
  void trackSpaceProfileViewOnce(space.id, viewerProfileId)

  const brandName = space.brandName ?? space.name

  // The brand accent override (§1 KEYSTONE): the Space's own validated `brand_accent` token wins, else
  // the per-type default (profile-config, re-homed off the retired blueprint). Only tokens, never a hex.
  const accentVars = resolveAccentVars(space.brandAccent, defaultAccentForType(space.type))

  // The Space PAGE THEME (ADR-578): the owner's typography + shape identity, read fail-safe off
  // preferences (defaults to 'bold' = today's look). Rides the same AccentScope wrapper as the accent.
  const spaceTheme = parseSpaceTheme(space.preferences)

  // The hero's remaining inputs are independent, so resolve them in ONE round-trip (site-audit PERF-4).
  // `visibility` gates the JSON-LD (a private Space is noindex; fail-safe private). `presence` (which
  // live sections have real rows) rides the same round-trip and is request-cached, SHARED with the page
  // body's own content read, so the anchor menu costs no extra queries on the Home render.
  const [caller, tagline, visibility, viewerFollows] = await Promise.all([
    getCallerProfile(),
    readTagline(space.id),
    getSpaceVisibility(slug),
    viewerProfileId ? isFollowing(space.id, viewerProfileId) : Promise.resolve(false),
  ])
  const manage = await resolveSpaceManageAccess(space, caller?.id ?? null, caller?.webRole ?? null)
  const canSeeAsOwner = manage.canManage || manage.staffViewing
  const isNetwork = visibility !== 'private'

  // Operator (admin/janitor) claim link: for a seeded, still-unclaimed Space, surface the shareable
  // claim link inside the QR & Share dialog so an operator can send it to the real owner. Only platform
  // staff see it (the token read is gated here); it disappears once claimed (getSpaceClaimToken returns
  // null). The claimer opens /spaces/claim/<token> and ownership transfers to them.
  const isPlatformStaffViewer = caller?.webRole === 'admin' || caller?.webRole === 'janitor'
  const spaceClaimToken = isPlatformStaffViewer ? await getSpaceClaimToken(space.id) : null
  const claimUrl = spaceClaimToken ? `/spaces/claim/${spaceClaimToken}` : undefined

  // Review stars for the profile's structured data (AggregateRating): only a NETWORK Space emits schema,
  // so only then do we pay the reviews read. Passed to spaceSchema, which emits the node ONLY when there
  // is a real average AND ≥1 review (a null/zero rating is dropped so answer engines never see malformed
  // schema).
  const reviews = isNetwork ? await getSpaceReviews(space.id) : null
  const aggregateRating =
    reviews && reviews.average != null && reviews.count > 0
      ? { ratingValue: reviews.average, reviewCount: reviews.count }
      : undefined

  // The per-Space FUNCTIONS this viewer may use — resolved by the SHARED helper the /manage console also
  // feeds (usableSpaceFunctions: spaceFunctionAccess over the viewer's space role; a staff previewer sees
  // them all), so the standardized admin rail gates the Space's surfaces exactly as the console does and
  // the two can never drift. Only computed for a manager (the Customize trigger is owner-gated), so a
  // visitor never pays the space-capabilities read.
  let spaceFns: SpaceFunctionKey[] = []
  if (canSeeAsOwner) {
    const spaceCaps = await getSpaceCapabilities(space, caller?.id ?? null)
    spaceFns = usableSpaceFunctions(space, spaceCaps.role, manage.staffViewing)
  }

  // The owner's Module Manager menu overrides (modular menu P3b, ADR-546b): the module order + hidden set
  // saved at spaces.preferences.moduleMenu, read fail-safe. Passed to the Customize trigger so the RAIL
  // honors hiding + reordering exactly as the /manage console does (the console reads the same node).
  const moduleMenu = readModuleMenuPrefs(space.preferences)

  const base = `/spaces/${space.slug}`

  // The profile sub-nav (Home + section anchors + custom pages, plus the operator's Manage/CRM links)
  // is built by the shared helper — the SAME menu the owner shell layouts (manage / crm) render, so the
  // sticky bar reads as one persistent nav across profile ↔ Manage ↔ CRM. Active state stays client-side
  // (SpaceProfileTabs → usePathname), so nothing here goes stale across soft navigation.
  const { tabs, adminTabs } = await buildSpaceProfileNav(space)

  // THE EDITABLE TOP HERO (PR: editable-top-hero). The whole cover hero — height, button orientation, the
  // eyebrow / heading / tagline copy, and the one dominant CTA — resolves through ONE pure helper over the
  // operator's hero overrides (preferences.hero) + the Space's canonical brand name / tagline + the existing
  // header-CTA node (preferences.headerCta, reused; item 5). A Space that never opened the hero editor reads
  // its defaults (medium height, row buttons, brand name + tagline, the per-type default CTA), so nothing
  // changes for it. The pinned hero editor in the rail arranger writes these same nodes.
  const hero = resolveHero({
    config: readHeroConfig(space.preferences),
    preferences: space.preferences,
    base,
    brandName,
    tagline,
    defaultCtaLabel: defaultPrimaryCtaLabel(space.type),
  })
  const heroHeading = hero.heading
  const heroEyebrow = hero.eyebrow
  const heroTagline = hero.tagline
  const ctaHref = hero.cta.href
  const ctaLabel = hero.cta.label
  // A custom (operator-supplied) external URL opens in a new tab with a safe rel; an in-house surface or
  // same-origin path stays in-app (no target/rel).
  const ctaLinkProps = hero.cta.external
    ? { target: '_blank' as const, rel: 'noopener noreferrer' }
    : {}
  // The operator's chosen cover size (Header vs Hero), read off preferences. Default-safe to Header.
  const coverSize = readCoverSize(space.preferences)
  // The Hero scrim treatment (only relevant to the Hero size): 'shade' = a dark ink scrim under the
  // overlaid identity (WCAG-safe on any photo, on-ink text); 'blend' = the photo fades to the page
  // canvas and the identity uses the theme's own text tokens. Default-safe to 'shade'.
  const coverScrim = readCoverScrim(space.preferences)
  const heroOnInk = coverScrim === 'shade'
  // The operator's chosen cover FOCAL POINT (where the cropped cover sits in its window), set with the shared
  // ImageFocalPicker in the Branding rail. A CSS object-position applied to the cover <Image> below; unset
  // reads as centered ("50% 50%"), so a Space that never touched it crops exactly as before. Repositions
  // the photo only — the header height is untouched (coverH is unchanged).
  const coverFocus = readCoverFocus(space.preferences)

  // The ONE owner affordance (Customize): opens the STANDARDIZED admin rail (openAdminBar) pointed at this
  // Space's scope — the SAME rail chrome circles / events / hubs / nexuses use (ENTITY-MANAGEMENT / PR C),
  // replacing the bespoke SpaceCustomizeDrawer. It resolves the Space's 9-spine surfaces as browse-first
  // link-rows into the existing /settings/* sub-pages, gated on the viewer's per-Space functions (spaceFns)
  // + the always-on floor. Owner-gated (canSeeAsOwner), so a visitor never sees it and never triggers it.
  const ownerTools = (onInk = false, extra = '', iconOnly = false) =>
    canSeeAsOwner ? (
      <OpenAdminBarButton
        scope={{ kind: 'space', id: space.id }}
        spaceType={space.type}
        spaceFns={spaceFns}
        moduleMenu={{ order: moduleMenu.order, hidden: moduleMenu.hidden }}
        label={manage.staffViewing ? 'Edit Space (staff)' : 'Edit Space'}
        icon={<SlidersHorizontal className={iconOnly ? 'h-5 w-5' : 'h-4 w-4'} aria-hidden />}
        iconOnly={iconOnly}
        // Desktop (non-icon) tool matches the primary CTA height (h-9) and never shrinks, so the three
        // hero buttons read as one even row. The mobile icon-only variant keeps its own square target.
        className={cn(iconOnly ? ghostIconClasses : cn(ownerToolClasses(onInk), 'h-9 shrink-0'), extra)}
      />
    ) : null

  // The quiet social FOLLOW chip, factored out so it can sit ABOVE the name on desktop (in the lockup) and
  // move into the mobile action card below the cover (where every button lives on a phone). Null for a
  // signed-out visitor. `onInk` paints it for legibility over a Hero cover photo.
  // A COMPACT Follow chip (owner ask): smaller than a standard sm button so it reads as the quiet social
  // action sitting above the name, not competing with the primary CTA. tailwind-merge lets the tighter
  // padding/size win over the base secondary tokens.
  const followButton = (onInk = false) =>
    viewerProfileId ? (
      <FollowSpaceButton
        spaceId={space.id}
        spaceName={brandName}
        initialFollowing={viewerFollows}
        className={
          onInk
            ? cn(onInkSecondaryClasses, 'gap-1 px-2.5 py-1 text-2xs')
            : buttonClasses('secondary', 'sm', 'gap-1 px-2.5 py-1 text-2xs')
        }
      />
    ) : null

  // The dominant primary CTA + the Connect (QR) affordance, factored out so both the desktop action row and
  // the mobile action card render the identical buttons. `onInk` swaps Connect to on-cover styling; the
  // primary CTA keeps its accent everywhere.
  // Desktop hero buttons share a fixed h-9 and never shrink, so Book / QR / Edit Space line up as one even
  // row (the mobile band renders its own separate buttons, untouched).
  const primaryCta = (onInk = false) => (
    <Link href={ctaHref} className={cn(primaryCtaButton(onInk), 'h-9 shrink-0')} {...ctaLinkProps}>
      {ctaLabel}
      <ArrowUpRight className="h-4 w-4" aria-hidden />
    </Link>
  )
  // The Connect affordance shows the "QR" label IN FRONT of the QR glyph (owner ask), so it reads as a
  // labelled button, not a bare icon. ROOT-CAUSE FIX: this used to be a bare `<Link href="/codes">`,
  // which opened the VIEWER's OWN personal code hub (their code + their avatar) — so a scan of a business
  // Space showed the scanner's personal code, not the Space's. It now opens SpaceShareButton, which
  // encodes THIS Space's public page + centers the Space's brand logo (and carries the sharer's ref for
  // attribution + a "Save contact" vCard link).
  const connectLink = (onInk = false) => (
    <SpaceShareButton
      slug={space.slug}
      brandName={brandName}
      brandLogoUrl={space.brandLogoUrl}
      sharerProfileId={viewerProfileId}
      hasContactCard
      claimUrl={claimUrl}
      className={cn(
        onInk ? onInkSecondaryClasses : buttonClasses('secondary', 'sm'),
        'inline-flex items-center h-9 shrink-0 gap-1.5',
      )}
    />
  )

  // The identity ACTION ROW (desktop, ≥sm): the emphasized primary CTA, then Connect, then the single
  // Customize tool. Follow is NOT here on desktop — it sits above the name in the lockup (nameLockup). This
  // row sits RIGHT of the avatar + name lockup on the SAME line (wrapping below only when the row runs out
  // of room). `onInk` swaps the secondary/owner affordances to on-cover styling for the Hero overlay while
  // the primary CTA stays the same accent. Hidden on mobile — the buttons move to `mobileActionBand`.
  // The action cluster is a bottom-anchored VERTICAL STACK by default (flex-col-reverse, so the primary
  // CTA sits on the BOTTOM line, aligned with the identity's bottom row) that expands to one horizontal
  // row once there is room (lg+). So a button row that would be too long stacks instead of crowding the
  // name, and whichever button is at the bottom stays on the identity's bottom line. An operator who
  // forces 'stacked' keeps the column at every width.
  const identityActions = (onInk = false) => (
    <div
      className={cn(
        'flex flex-col-reverse items-end gap-2',
        hero.buttonOrientation !== 'stacked' && 'lg:flex-row lg:items-center',
      )}
    >
      {primaryCta(onInk)}
      {connectLink(onInk)}
      {ownerTools(onInk)}
    </div>
  )

  // MOBILE action band (<sm): the dominant primary CTA (Book / Join) fills the row, with QR (Connect) and
  // Edit Space as compact ICON-ONLY buttons beside it — no white chip or card behind them, so the actions
  // read as a clean toolbar and the primary CTA gets the width (owner ask). Follow is NOT here: it sits
  // above the identity on the cover. `sm:hidden` — desktop keeps the overlaid row.
  const mobileActionBand = (
    <div className="mt-4 flex items-center gap-2 sm:hidden">
      <Link href={ctaHref} className={cn(primaryCtaButton(false), 'flex-1')} {...ctaLinkProps}>
        {ctaLabel}
        <ArrowUpRight className="h-4 w-4" aria-hidden />
      </Link>
      <SpaceShareButton
        slug={space.slug}
        brandName={brandName}
        brandLogoUrl={space.brandLogoUrl}
        sharerProfileId={viewerProfileId}
        hasContactCard
        claimUrl={claimUrl}
        iconOnly
        className={ghostIconClasses}
      />
      {ownerTools(false, '', true)}
    </div>
  )

  // ── THE COVER + IDENTITY ─────────────────────────────────────────────────────────────────────────
  // A real uploaded cover always wins; a Space with NONE falls back to a calm SITE stock photo. The
  // image is a next/image with `fill` + `preload` (not a plain <img>) so it paints on the FIRST
  // navigation instead of blank-until-refresh.
  const coverSrc = space.coverImageUrl || coverPlaceholderFor(space.id)
  const isHero = coverSize === 'hero'
  // The Hero cover height is now operator-selectable (Short / Medium / Tall), off the hero config. The Header
  // size keeps its compact band (the Header size is retired for Spaces — always Hero, ADR-526 — but the branch
  // is kept intact + fail-safe).
  const coverH = isHero ? heroHeightClass(hero.height) : 'h-40 sm:h-52'
  const coverImage = (
    <Image
      src={coverSrc}
      alt=""
      fill
      sizes="(max-width: 1024px) 100vw, 1344px"
      preload
      className="object-cover"
      style={{ objectPosition: coverFocus }}
    />
  )

  // The name + type badge + tagline lockup, with FOLLOW sitting ABOVE the name (a compact chip, the
  // quiet social action that belongs with the identity rather than in the primary action row). `onInk`
  // paints the whole lockup for legibility over a Hero cover photo.
  // The tagline "say what you do" line (or, for an owner with none, a gentle prompt to add one).
  // Extracted from the lockup so the Hero cover can relocate it to its own full-width row below the
  // identity on mobile, while desktop keeps it inline under the name. Renders nothing for a visitor on
  // a Space with no tagline, so wrappers can `empty:hidden` to collapse the reserved space.
  const taglineNode = (onInk = false) =>
    heroTagline ? (
      <p className={cn('max-w-2xl text-base font-medium', onInk ? 'text-on-ink' : 'text-muted')}>
        {heroTagline}
      </p>
    ) : (
      canSeeAsOwner && (
        <Link
          href={`${base}/settings/basics`}
          className={cn(
            'inline-block max-w-2xl text-sm font-medium underline decoration-dashed underline-offset-4 transition-colors',
            onInk ? 'text-on-ink-muted hover:text-on-ink' : 'text-muted hover:text-text',
          )}
        >
          Add a tagline. Say what you do.
        </Link>
      )
    )

  const nameLockup = (onInk = false, taglineHiddenOnMobile = false) => (
    <div className="min-w-0">
      {viewerProfileId && (
        // Desktop only: Follow sits above the name. On mobile it moves to the white action card under the
        // cover (mobileActionBand), so the phone hero reads as a clean identity band. Tight `mb-1` so the
        // Follow -> name -> tagline stack reads as one balanced block against the (bigger) avatar.
        <div className="mb-1 hidden sm:block">{followButton(onInk)}</div>
      )}
      {/* The operator's optional EYEBROW: a small pre-text kicker above the name (editable in the pinned hero
          editor). Absent by default, so the lockup reads exactly as before for a Space with none. */}
      {heroEyebrow && (
        <p
          className={cn(
            'mb-1 text-2xs font-semibold uppercase tracking-wide',
            onInk ? 'text-on-ink-muted' : 'text-primary-strong',
          )}
        >
          {heroEyebrow}
        </p>
      )}
      {/* The name is the single <h1>. The Business / Non Profit type pill was removed from the header
          content (D-refine #8): the designation is carried by the directory + naming context, so the
          identity reads as name -> tagline without a redundant type chip. */}
      <h1
        className={cn(
          'min-w-0 break-words text-2xl font-bold leading-tight sm:text-3xl',
          onInk ? 'text-on-ink [text-shadow:0_1px_3px_rgb(0_0_0/0.35)]' : 'text-text',
        )}
      >
        {heroHeading}
      </h1>
      {/* The tagline reads as part of the identity, not fine print. On the Hero cover it stays inline
          under the name only at WIDE widths (lg+); below lg (narrow desktop + mobile) it is relocated to
          its own full-width row below the buttons (taglineHiddenOnMobile), so the identity block stays a
          clean Follow -> name that bottom-aligns with the avatar and never crowds the action row. At the
          Header size (no taglineHiddenOnMobile) it always stays inline under the name. */}
      <div className={cn('mt-1 empty:hidden', taglineHiddenOnMobile && 'hidden lg:block')}>
        {taglineNode(onInk)}
      </div>
    </div>
  )

  // HERO cover node: image + a legibility SCRIM anchored at the bottom (a dark `ink` gradient fading up
  // to transparent) so the overlaid on-ink identity clears the WCAG ≥4.5:1 floor on ANY cover photo,
  // while the top of the image stays crisp. ONE identity row anchors to the bottom over the scrim:
  // avatar + name on the left, the action buttons pushed RIGHT on the same line (they wrap below the
  // lockup only when the row runs out of room). Tokens only (ink), no hardcoded hex.
  const heroScrimGradient = heroOnInk
    ? 'from-ink/80 via-ink/30 to-transparent'
    : 'from-canvas via-canvas/40 to-transparent'
  const heroCoverNode = (
    <div className={cn('relative w-full overflow-hidden rounded-xl bg-surface-elevated', coverH)}>
      {coverImage}
      <div className={cn('absolute inset-0 bg-gradient-to-t', heroScrimGradient)} />
      <div className="absolute inset-x-0 bottom-0 p-6 sm:p-8">
        {/* Mobile only: the Follow chip sits ABOVE the profile pic + title (the operator's ask). On desktop
            Follow lives inside the name lockup, so this is suppressed there. */}
        {viewerProfileId && <div className="mb-3 sm:hidden">{followButton(heroOnInk)}</div>}
        {/* ONE bottom row (owner ask): the identity (logo + Follow + title + tagline) anchors to the
            bottom-LEFT and the action buttons to the bottom-RIGHT, both aligned to the SAME bottom line
            (items-end). The name column (min-w-0) gives way and wraps for a long name; the action cluster
            stacks vertically when the row would be too long, its bottom button staying on the bottom row.
            On mobile the actions move to the card below the cover, so the phone hero holds only the identity. */}
        <div className="flex items-end justify-between gap-4">
          <div className="flex min-w-0 items-end gap-4">
            <div className="shrink-0">
              <BrandAnchor name={brandName} logoUrl={space.brandLogoUrl} />
            </div>
            <div className="min-w-0 pb-1">{nameLockup(heroOnInk)}</div>
          </div>
          <div className="hidden shrink-0 items-end sm:flex">{identityActions(heroOnInk)}</div>
        </div>
      </div>
    </div>
  )

  // HEADER cover node: the compact image band, with the logo chip hanging HALF-OFF the cover bottom-left
  // (the LinkedIn / Facebook business-profile pattern). The chip is ABSOLUTELY positioned against the
  // cover (not a fragile negative margin across the template's hero/band gap), so it deterministically
  // sits half on the image, half below it. The name + actions live in the infoBand, cleared below it.
  const headerCoverNode = (
    <div className="relative w-full">
      <div className={cn('relative w-full overflow-hidden rounded-xl bg-surface-elevated', coverH)}>
        {coverImage}
      </div>
      <div className="absolute -bottom-10 left-5 sm:-bottom-12 sm:left-6">
        <BrandAnchor name={brandName} logoUrl={space.brandLogoUrl} />
      </div>
    </div>
  )

  const coverNode = isHero ? heroCoverNode : headerCoverNode

  // ── THE PROFILE INFO AREA (band slot) ──────────────────────────────────────────────────────────
  // HEADER size: ONE identity row — the logo chip overlapping the cover bottom + the name lockup on the
  // left, the action buttons pushed RIGHT on the same line (wrapping below only when the row runs out
  // of room). HERO size: the identity is already overlaid on the cover, so the info area is just the
  // menu row. The client tab bar closes the band in both, above the divider.
  const infoBand = (
    <div>
      {!isHero && (
        // HEADER identity: the logo chip is owned by the cover (hanging half-off it), so this row is the
        // name lockup + actions, cleared BELOW the hanging chip with top padding. Name on the left, actions
        // pushed right on desktop; on mobile the name lockup stays and the actions drop to the white card
        // below (mobileActionBand).
        <div className="flex flex-col gap-4 pt-14 sm:flex-row sm:items-end sm:justify-between sm:gap-x-6 sm:pt-16">
          <div className="min-w-0">
            {/* Mobile only: Follow above the identity (matches the Hero size). Desktop shows it inside the
                lockup instead. */}
            {viewerProfileId && <div className="mb-2 sm:hidden">{followButton(false)}</div>}
            {nameLockup(false)}
          </div>
          <div className="hidden shrink-0 sm:block">{identityActions(false)}</div>
        </div>
      )}
      {/* Mobile-only white action card under the cover (both Hero and Header sizes). */}
      {mobileActionBand}
    </div>
  )

  // The menu row is handed to the template's STICKY slot (not the band), so it detaches on scroll and
  // pins directly under the global header, staying in view for the whole page (and for anchor jumps —
  // the section targets carry scroll-margin that clears the header + this pinned bar). The band above
  // holds only the identity; on the Hero size the identity is already on the cover, so the band is bare.
  //
  // Manage / CRM are OWNER-only toggles that slide open a compact, in-place panel UNDER the menu on the
  // same page (no navigation): the manager console + a CRM snapshot, server-rendered here and handed to
  // the client menu, gated on the same adminTabs the nav computes (a visitor gets neither). The CRM
  // snapshot streams behind Suspense so it never blocks the profile paint. The panels are intentionally
  // cramped, a quick in-place view that points to the full workspace / the operator's own website.
  const hasManage = adminTabs.some((t) => t.label === 'Manage')
  const hasCrm = adminTabs.some((t) => t.label === 'CRM')
  const stickyNav = (
    <SpaceProfileMenu
      tabs={tabs}
      manageNode={hasManage ? <SpaceManageBoard slug={space.slug} /> : null}
      crmNode={
        hasCrm ? (
          <Suspense fallback={<p className="px-4 py-6 text-sm text-muted">Loading your CRM…</p>}>
            <SpaceCrmSnapshot slug={space.slug} />
          </Suspense>
        ) : null
      }
    />
  )

  return (
    <AccentScope vars={accentVars} theme={spaceTheme}>
      {/* Per-type structured data for the PUBLIC profile plus a Breadcrumb back to the directory.
          Network spaces only, never on a private one. */}
      {isNetwork && (
        <JsonLd
          data={[
            spaceSchema({
              slug: space.slug,
              type: space.type,
              name: brandName,
              tagline,
              logoUrl: space.brandLogoUrl,
              aggregateRating,
            }),
            breadcrumbSchema([
              { name: 'Spaces', path: '/spaces' },
              { name: brandName, path: `/spaces/${space.slug}` },
            ]),
          ]}
        />
      )}
      <DetailTemplate title={brandName} hero={coverNode} band={infoBand} stickyNav={stickyNav}>
        {/* Owner guardrail: a private Space is hidden from the directory, search, and shared links, so a
            manager viewing their own private page gets a one-click Make public assist (server re-gates). */}
        {manage.canManage && !isNetwork && <SpacePrivateNotice spaceId={space.id} />}
        {children}
      </DetailTemplate>
      {/* The owner Customize rail is now the STANDARDIZED admin bar (mounted site-wide by the shell), opened
          by the owner-gated Customize button in the identity row via openAdminBar — no per-profile drawer to
          mount here anymore (ENTITY-MANAGEMENT / PR C). */}
    </AccentScope>
  )
}

// The brand LOGO chip in the profile info lockup: the operator's logo, or a neutral initials chip.
// Decorative (alt=""): the <h1> carries the name.
function BrandAnchor({ name, logoUrl }: { name: string; logoUrl: string | null }) {
  if (logoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- operator-supplied Space logo URL, not a build-time asset (matches BrandMark / SpaceCard)
      <img
        src={logoUrl}
        alt=""
        className="h-20 w-20 shrink-0 rounded-2xl border-4 border-surface bg-surface object-contain shadow-md lg:h-28 lg:w-28"
      />
    )
  }
  return (
    <span
      className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl border-4 border-surface bg-surface-elevated text-2xl font-bold text-subtle shadow-md lg:h-28 lg:w-28 lg:text-3xl"
      aria-hidden
    >
      {getInitials(name)}
    </span>
  )
}
