import { notFound } from 'next/navigation'
import { Suspense } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { QrCode, SlidersHorizontal } from 'lucide-react'
import { DetailTemplate } from '@/components/templates'
import { buttonClasses } from '@/components/ui/button'
import { getMyProfileId, getCallerProfile } from '@/lib/auth'
import { getVisibleSpaceBySlug, getSpaceVisibility } from '@/lib/spaces/store'
import { resolveSpaceManageAccess, getSpaceCapabilities } from '@/lib/spaces/entitlements'
import { spaceFunctionAccess, SPACE_FUNCTIONS, type SpaceFunctionKey } from '@/lib/spaces/functions'
import { getActiveSpace } from '@/lib/spaces/active-space'
import { trackSpaceProfileViewOnce } from '@/lib/spaces/analytics'
import { buildSpaceProfileNav } from '@/lib/spaces/profile-nav'
import { defaultAccentForType, defaultPrimaryCtaLabel } from '@/lib/spaces/profile-config'
import { resolveAccentVars } from '@/lib/spaces/accent'
import { getInitials, cn } from '@/lib/utils'
import { readCoverSize, readCoverScrim } from '@/app/(main)/spaces/[slug]/manage/layout/preferences'
import { readTagline } from '@/lib/spaces/tagline'
import { spaceTypeLabel } from '@/components/spaces/space-type'
import { FollowSpaceButton } from '@/components/spaces/follow-space-button'
import { OpenAdminBarButton } from '@/components/admin/open-admin-bar-button'
import { readModuleMenuPrefs } from '@/lib/spaces/module-menu'
import { SpaceProfileMenu } from '@/components/spaces/space-profile-menu'
import { SpaceManageBoard } from '@/app/(main)/spaces/[slug]/manage/manage-board'
import { SpaceCrmSnapshot } from '@/app/(main)/spaces/[slug]/crm/crm-snapshot'
import { isFollowing } from '@/lib/spaces/follows'
import { AccentScope } from '@/components/spaces/accent-scope'
import { JsonLd } from '@/components/json-ld'
import { spaceSchema, breadcrumbSchema } from '@/lib/jsonld'

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

// A small curated set of calm, warm, neutral SITE stock photos used as the cover PLACEHOLDER when a
// Space has not uploaded its own cover, so the header always reads as an intentional identity band
// rather than a flat gradient. Hosted build-time assets under public/images/site. A real cover wins.
const COVER_PLACEHOLDERS = [
  '/images/site/outdoor-group.jpg',
  '/images/site/sunset.jpg',
  '/images/site/lab-lounge.jpg',
  '/images/site/nature-viewing-sunset.jpg',
  '/images/site/community-dinner.jpg',
  '/images/site/meditation-circle-outdoor.jpg',
] as const

// Deterministically pick ONE placeholder for a Space, keyed off its id, so the same Space always shows
// the same photo and different Spaces vary (no Math.random, stable across renders).
function coverPlaceholderFor(id: string): string {
  let hash = 0
  for (let i = 0; i < id.length; i++) hash = (hash + id.charCodeAt(i)) % COVER_PLACEHOLDERS.length
  return COVER_PLACEHOLDERS[hash]
}

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

// The ONE dominant primary CTA (best practice: a single, visually superior primary action). It stays a
// touch taller/bolder than the secondary affordances beside it and carries `shadow-pop`, so it reads as
// the clear hero action while Connect / Customize stay subordinate. The accent stays the same over a
// photo (Hero) or in flow (Header); only the secondary chips swap to on-ink. Tokens only, no hex.
const primaryCtaClasses = cn(
  'inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-bold transition-colors',
  // The accent-filled dominant action, with only a soft shadow (not the heavy shadow-pop, which read
  // as a raised cream chip rather than a clean accent button).
  'bg-primary text-on-primary shadow-sm hover:bg-primary-hover',
)

function ownerToolClasses(onInk: boolean): string {
  return onInk ? onInkSecondaryClasses : buttonClasses('secondary', 'sm')
}

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
  const typeLabel = spaceTypeLabel(space.type)

  // The brand accent override (§1 KEYSTONE): the Space's own validated `brand_accent` token wins, else
  // the per-type default (profile-config, re-homed off the retired blueprint). Only tokens, never a hex.
  const accentVars = resolveAccentVars(space.brandAccent, defaultAccentForType(space.type))

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

  // The per-Space FUNCTIONS this viewer may use — resolved the SAME way the /manage console does
  // (spaceFunctionAccess over the viewer's space role; a staff previewer sees them all), so the
  // standardized admin rail gates the Space's surfaces exactly as the console does. Only computed for a
  // manager (the Customize trigger is owner-gated), so a visitor never pays the space-capabilities read.
  let spaceFns: SpaceFunctionKey[] = []
  if (canSeeAsOwner) {
    const spaceCaps = await getSpaceCapabilities(space, caller?.id ?? null)
    spaceFns = SPACE_FUNCTIONS.filter(
      (fn) => manage.staffViewing || spaceFunctionAccess(space, fn.key, spaceCaps.role),
    ).map((fn) => fn.key)
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

  // The single primary CTA (best practice: one dominant action) routes to the reserved /book action
  // page, which renders the Space's live transactional surface (booking / join / donate / enroll /
  // tickets, branched by type). The label is the per-type default (profile-config), operator-overridable.
  const ctaHref = `${base}/book`
  const ctaLabel = defaultPrimaryCtaLabel(space.type)

  // The operator's chosen cover size (Header vs Hero), read off preferences. Default-safe to Header.
  const coverSize = readCoverSize(space.preferences)
  // The Hero scrim treatment (only relevant to the Hero size): 'shade' = a dark ink scrim under the
  // overlaid identity (WCAG-safe on any photo, on-ink text); 'blend' = the photo fades to the page
  // canvas and the identity uses the theme's own text tokens. Default-safe to 'shade'.
  const coverScrim = readCoverScrim(space.preferences)
  const heroOnInk = coverScrim === 'shade'

  // The ONE owner affordance (Customize): opens the STANDARDIZED admin rail (openAdminBar) pointed at this
  // Space's scope — the SAME rail chrome circles / events / hubs / nexuses use (ENTITY-MANAGEMENT / PR C),
  // replacing the bespoke SpaceCustomizeDrawer. It resolves the Space's 9-spine surfaces as browse-first
  // link-rows into the existing /settings/* sub-pages, gated on the viewer's per-Space functions (spaceFns)
  // + the always-on floor. Owner-gated (canSeeAsOwner), so a visitor never sees it and never triggers it.
  const ownerTools = (onInk = false, extra = '') =>
    canSeeAsOwner ? (
      <OpenAdminBarButton
        scope={{ kind: 'space', id: space.id }}
        spaceType={space.type}
        spaceFns={spaceFns}
        moduleMenu={{ order: moduleMenu.order, hidden: moduleMenu.hidden }}
        label={manage.staffViewing ? 'Edit Space (staff)' : 'Edit Space'}
        icon={<SlidersHorizontal className="h-4 w-4" aria-hidden />}
        className={cn(ownerToolClasses(onInk), extra)}
      />
    ) : null

  // The quiet social FOLLOW chip, factored out so it can sit ABOVE the name on desktop (in the lockup) and
  // move into the mobile action card below the cover (where every button lives on a phone). Null for a
  // signed-out visitor. `onInk` paints it for legibility over a Hero cover photo.
  const followButton = (onInk = false) =>
    viewerProfileId ? (
      <FollowSpaceButton
        spaceId={space.id}
        spaceName={brandName}
        initialFollowing={viewerFollows}
        className={onInk ? onInkSecondaryClasses : buttonClasses('secondary', 'sm')}
      />
    ) : null

  // The dominant primary CTA + the Connect (QR) affordance, factored out so both the desktop action row and
  // the mobile action card render the identical buttons. `onInk` swaps Connect to on-cover styling; the
  // primary CTA keeps its accent everywhere.
  const primaryCta = () => (
    <Link href={ctaHref} className={primaryCtaClasses}>
      {ctaLabel}
    </Link>
  )
  const connectLink = (onInk = false) => (
    <Link
      href="/codes"
      aria-label={`Connect with ${brandName}`}
      title="Connect"
      className={onInk ? cn(onInkSecondaryClasses, 'px-2.5') : buttonClasses('secondary', 'sm', 'px-2.5')}
    >
      <QrCode className="h-4 w-4" aria-hidden />
    </Link>
  )

  // The identity ACTION ROW (desktop, ≥sm): the emphasized primary CTA, then Connect, then the single
  // Customize tool. Follow is NOT here on desktop — it sits above the name in the lockup (nameLockup). This
  // row sits RIGHT of the avatar + name lockup on the SAME line (wrapping below only when the row runs out
  // of room). `onInk` swaps the secondary/owner affordances to on-cover styling for the Hero overlay while
  // the primary CTA stays the same accent. Hidden on mobile — the buttons move to `mobileActionBand`.
  const identityActions = (onInk = false) => (
    <div className="flex flex-wrap items-center gap-2">
      {primaryCta()}
      {connectLink(onInk)}
      {ownerTools(onInk)}
    </div>
  )

  // MOBILE action card (<sm): the three primary actions — Book, QR (Connect), and Edit Space — on ONE row,
  // each `flex-1` so they share the width evenly, and `items-stretch` so they are all the SAME height and
  // fill the card. Follow is NOT here: it sits above the identity on the cover (mobileFollow). Always
  // on-surface styling (a white card, not a photo overlay). `sm:hidden` — desktop keeps the overlaid row.
  const mobileActionBand = (
    <div className="mt-4 rounded-xl border border-border bg-surface p-4 sm:hidden">
      <div className="flex items-stretch gap-2">
        <Link href={ctaHref} className={cn(primaryCtaClasses, 'flex-1')}>
          {ctaLabel}
        </Link>
        <Link
          href="/codes"
          aria-label={`Connect with ${brandName}`}
          title="Connect"
          className={cn(buttonClasses('secondary', 'sm'), 'flex-1 justify-center gap-1.5')}
        >
          <QrCode className="h-4 w-4" aria-hidden /> QR
        </Link>
        {ownerTools(false, 'flex-1 justify-center')}
      </div>
    </div>
  )

  // ── THE COVER + IDENTITY ─────────────────────────────────────────────────────────────────────────
  // A real uploaded cover always wins; a Space with NONE falls back to a calm SITE stock photo. The
  // image is a next/image with `fill` + `preload` (not a plain <img>) so it paints on the FIRST
  // navigation instead of blank-until-refresh.
  const coverSrc = space.coverImageUrl || coverPlaceholderFor(space.id)
  const isHero = coverSize === 'hero'
  const coverH = isHero ? 'h-72 sm:h-[22rem]' : 'h-40 sm:h-52'
  const coverImage = (
    <Image src={coverSrc} alt="" fill sizes="(max-width: 1024px) 100vw, 1024px" preload className="object-cover" />
  )

  // The name + type badge + tagline lockup, with FOLLOW sitting ABOVE the name (a compact chip, the
  // quiet social action that belongs with the identity rather than in the primary action row). `onInk`
  // paints the whole lockup for legibility over a Hero cover photo.
  const nameLockup = (onInk = false) => (
    <div className="min-w-0">
      {viewerProfileId && (
        // Desktop only: Follow sits above the name. On mobile it moves to the white action card under the
        // cover (mobileActionBand), so the phone hero reads as a clean identity band.
        <div className="mb-2 hidden sm:block">{followButton(onInk)}</div>
      )}
      {/* Tight vertical rhythm so the type badge sits close to the name and tagline (gap-y-1), keeping the
          lockup balanced rather than spread out. */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <h1
          className={cn(
            'min-w-0 break-words text-2xl font-bold leading-tight sm:text-3xl',
            onInk ? 'text-on-ink [text-shadow:0_1px_3px_rgb(0_0_0/0.35)]' : 'text-text',
          )}
        >
          {brandName}
        </h1>
        <span
          className={cn(
            'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-2xs font-semibold',
            onInk ? 'bg-white/15 text-on-ink backdrop-blur-sm' : 'bg-primary-bg text-primary-strong',
          )}
        >
          {typeLabel}
        </span>
      </div>
      {/* The tagline is the "say what you do" line, given a touch more presence (text-base, medium) so it
          reads as part of the identity, not fine print. When it is empty and you are the owner, a gentle
          prompt invites you to add one (links to the Basics editor); a visitor sees nothing. */}
      {tagline ? (
        <p className={cn('mt-1.5 max-w-2xl text-base font-medium', onInk ? 'text-on-ink' : 'text-muted')}>
          {tagline}
        </p>
      ) : (
        canSeeAsOwner && (
          <Link
            href={`${base}/settings/basics`}
            className={cn(
              'mt-1.5 inline-block max-w-2xl text-sm font-medium underline decoration-dashed underline-offset-4 transition-colors',
              onInk ? 'text-on-ink-muted hover:text-on-ink' : 'text-muted hover:text-text',
            )}
          >
            Add a tagline. Say what you do.
          </Link>
        )
      )}
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
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
          <div className="flex min-w-0 items-end gap-4">
            <div className="shrink-0">
              <BrandAnchor name={brandName} logoUrl={space.brandLogoUrl} />
            </div>
            <div className="min-w-0 pb-1">{nameLockup(heroOnInk)}</div>
          </div>
          {/* Desktop only: the action row overlays the cover bottom-right. On mobile it moves to the white
              action card under the cover, so the phone hero holds only the identity. */}
          <div className="hidden pb-1 sm:block">{identityActions(heroOnInk)}</div>
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
        <div className="flex flex-col gap-4 pt-14 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between sm:gap-x-6 sm:pt-16">
          <div className="min-w-0">
            {/* Mobile only: Follow above the identity (matches the Hero size). Desktop shows it inside the
                lockup instead. */}
            {viewerProfileId && <div className="mb-2 sm:hidden">{followButton(false)}</div>}
            {nameLockup(false)}
          </div>
          <div className="hidden sm:block">{identityActions(false)}</div>
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
    <AccentScope vars={accentVars}>
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
            }),
            breadcrumbSchema([
              { name: 'Spaces', path: '/spaces' },
              { name: brandName, path: `/spaces/${space.slug}` },
            ]),
          ]}
        />
      )}
      <DetailTemplate title={brandName} hero={coverNode} band={infoBand} stickyNav={stickyNav}>
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
        className="h-20 w-20 shrink-0 rounded-2xl border-4 border-surface bg-surface object-contain shadow-md sm:h-24 sm:w-24"
      />
    )
  }
  return (
    <span
      className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl border-4 border-surface bg-surface-elevated text-2xl font-bold text-subtle shadow-md sm:h-24 sm:w-24"
      aria-hidden
    >
      {getInitials(name)}
    </span>
  )
}
