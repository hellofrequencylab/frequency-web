import { notFound } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { QrCode } from 'lucide-react'
import { DetailTemplate } from '@/components/templates'
import { buttonClasses } from '@/components/ui/button'
import { getMyProfileId, getCallerProfile } from '@/lib/auth'
import { getVisibleSpaceBySlug, getSpaceVisibility } from '@/lib/spaces/store'
import { resolveSpaceManageAccess } from '@/lib/spaces/entitlements'
import { getActiveSpace } from '@/lib/spaces/active-space'
import { trackSpaceProfileViewOnce } from '@/lib/spaces/analytics'
import { isConsoleSpaceType } from '@/lib/spaces/types'
import { readProfilePages, resolveSpacePageDoc, HOME_SLUG, MAX_PROFILE_PAGES } from '@/lib/spaces/profile-pages'
import { readBlockRows } from '@/lib/page-editor/templates/space-blocks'
import { readProfileData } from '@/lib/spaces/profile-data'
import { deriveSectionNav } from '@/lib/spaces/section-anchors'
import { getSpaceSectionPresence } from '@/lib/spaces/content-data'
import { defaultAccentForType, defaultPrimaryCtaLabel } from '@/lib/spaces/profile-config'
import { resolveAccentVars } from '@/lib/spaces/accent'
import { getInitials, cn } from '@/lib/utils'
import { readCoverSize, readCoverScrim } from '@/app/(main)/spaces/[slug]/manage/layout/preferences'
import { readTagline } from '@/lib/spaces/tagline'
import { spaceTypeLabel } from '@/components/spaces/space-type'
import { FollowSpaceButton } from '@/components/spaces/follow-space-button'
import { SpaceCustomizeButton } from '@/components/spaces/space-customize-button'
import { SpaceCustomizeDrawer } from '@/components/spaces/space-customize-drawer'
import { SpaceProfileTabs, type SpaceProfileTab } from '@/components/spaces/space-profile-tabs'
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
  'bg-primary text-on-primary shadow-pop hover:bg-primary-hover',
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
  const [caller, tagline, visibility, viewerFollows, presence] = await Promise.all([
    getCallerProfile(),
    readTagline(space.id),
    getSpaceVisibility(slug),
    viewerProfileId ? isFollowing(space.id, viewerProfileId) : Promise.resolve(false),
    getSpaceSectionPresence(space.id, space.slug),
  ])
  const manage = await resolveSpaceManageAccess(space, caller?.id ?? null, caller?.webRole ?? null)
  const canSeeAsOwner = manage.canManage || manage.staffViewing
  const isNetwork = visibility !== 'private'

  const base = `/spaces/${space.slug}`
  // The owner-affordance target (ADR-441 EM1-3): practitioner + organization are served by the unified
  // /manage console, so point their Manage button straight at it; every other type opens /settings.
  const manageHref =
    space.type === 'practitioner' || space.type === 'organization' ? `${base}/manage` : `${base}/settings`

  // The nav is PRE-POPULATED from the page itself (feature-block model): Home, then one ANCHOR link
  // per Home section that will actually render (derived from the Home doc + the live presence flags,
  // so a link never scrolls to an empty spot), then any custom sub-pages the operator created. Active
  // state stays client-side via usePathname (see SpaceProfileTabs); anchor links are never "active".
  const pages = readProfilePages(space.preferences)
  const homeDoc = resolveSpacePageDoc(space.preferences, brandName, HOME_SLUG)
  const sections = deriveSectionNav(homeDoc, presence)
  const tabs: SpaceProfileTab[] = [
    { href: base, label: pages[0]?.label ?? 'Home' },
    ...sections.map((s) => ({ href: `${base}#${s.anchor}`, label: s.label })),
    ...pages
      .filter((p) => p.slug !== HOME_SLUG)
      .map((p) => ({ href: `${base}/${p.slug}`, label: p.label })),
  ]

  // The OPERATOR'S back-end quick links, right-aligned on the same menu row and never shown to a
  // visitor: the unified Manage console and (for console types) the CRM.
  const adminTabs: SpaceProfileTab[] = canSeeAsOwner
    ? [
        { href: manageHref, label: 'Manage' },
        ...(isConsoleSpaceType(space.type) ? [{ href: `${base}/crm`, label: 'CRM' }] : []),
      ]
    : []

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

  // The ONE owner affordance (Customize): the three old controls (Edit profile · Customize page · the
  // divider Settings cog) all opened the same shell settings rail, so they collapse to a single button
  // that opens it (SpaceCustomizeButton dispatches `open-settings`). Inside the rail the core page
  // settings live, plus an "Edit fullscreen" button into the Puck editor. Never shown to a visitor.
  const ownerTools = (onInk = false) =>
    canSeeAsOwner ? (
      <SpaceCustomizeButton
        className={ownerToolClasses(onInk)}
        label={manage.staffViewing ? 'Customize (staff)' : 'Customize'}
      />
    ) : null

  // The identity ACTION ROW: the emphasized primary CTA, then Connect, then the single Customize tool.
  // Follow is NOT here — it sits above the name in the lockup (nameLockup). This row sits RIGHT of the
  // avatar + name lockup on the SAME line (wrapping below only when the row runs out of room). `onInk`
  // swaps the secondary/owner affordances to on-cover styling for the Hero overlay while the primary
  // CTA stays the same accent.
  const identityActions = (onInk = false) => (
    <div className="flex flex-wrap items-center gap-2">
      <Link href={ctaHref} className={primaryCtaClasses}>
        {ctaLabel}
      </Link>
      <Link
        href="/codes"
        aria-label={`Connect with ${brandName}`}
        title="Connect"
        className={onInk ? cn(onInkSecondaryClasses, 'px-2.5') : buttonClasses('secondary', 'sm', 'px-2.5')}
      >
        <QrCode className="h-4 w-4" aria-hidden />
      </Link>
      {ownerTools(onInk)}
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
        <div className="mb-2">
          <FollowSpaceButton
            spaceId={space.id}
            spaceName={brandName}
            initialFollowing={viewerFollows}
            className={onInk ? onInkSecondaryClasses : buttonClasses('secondary', 'sm')}
          />
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
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
      {tagline && (
        <p className={cn('mt-1.5 max-w-2xl text-sm', onInk ? 'text-on-ink-muted' : 'text-muted')}>{tagline}</p>
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
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
          <div className="flex min-w-0 items-end gap-4">
            <div className="shrink-0">
              <BrandAnchor name={brandName} logoUrl={space.brandLogoUrl} />
            </div>
            <div className="min-w-0 pb-1">{nameLockup(heroOnInk)}</div>
          </div>
          <div className="pb-1">{identityActions(heroOnInk)}</div>
        </div>
      </div>
    </div>
  )

  // HEADER cover node: the compact image band alone (logo + name + actions live in the infoBand below).
  const headerCoverNode = (
    <div className={cn('relative w-full overflow-hidden rounded-xl bg-surface-elevated', coverH)}>
      {coverImage}
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
        // HEADER identity: the logo chip OVERLAPS the cover bottom (a single -mt lift on the chip
        // alone, so only the logo rides up onto the image while the name + tagline sit cleanly below
        // it). The name lockup sits to the chip's right, bottom-aligned to it; the action row sits on
        // the same line, pushed right, wrapping under only when the row runs out of room.
        <div className="mt-3 flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
          <div className="flex min-w-0 items-end gap-4 sm:gap-5">
            <div className="-mt-16 shrink-0 sm:-mt-20">
              <BrandAnchor name={brandName} logoUrl={space.brandLogoUrl} />
            </div>
            <div className="min-w-0">{nameLockup(false)}</div>
          </div>
          <div>{identityActions(false)}</div>
        </div>
      )}
      <SpaceProfileTabs tabs={tabs} adminTabs={adminTabs} />
    </div>
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
      <DetailTemplate title={brandName} hero={coverNode} band={infoBand}>
        {children}
      </DetailTemplate>
      {/* The owner-gated Customize rail — opened by the single Customize button in the identity row.
          Space-scoped + re-gated in every action; carries the core page settings + the fullscreen
          editor button. Rendered only for a manager, so a visitor never ships the drawer. */}
      {canSeeAsOwner && (
        <SpaceCustomizeDrawer
          slug={space.slug}
          brandName={brandName}
          pages={pages}
          maxPages={MAX_PROFILE_PAGES}
          coverSize={coverSize}
          coverScrim={coverScrim}
          accent={space.brandAccent ?? ''}
          blocks={readBlockRows(homeDoc)}
          businessInfo={readProfileData(space.preferences)}
          coverImageUrl={space.coverImageUrl}
          brandLogoUrl={space.brandLogoUrl}
        />
      )}
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
