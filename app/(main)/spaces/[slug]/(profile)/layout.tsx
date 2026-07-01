import { notFound } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { QrCode, Pencil, LayoutTemplate } from 'lucide-react'
import { DetailTemplate } from '@/components/templates'
import { buttonClasses } from '@/components/ui/button'
import { getMyProfileId, getCallerProfile } from '@/lib/auth'
import { getVisibleSpaceBySlug, getSpaceVisibility } from '@/lib/spaces/store'
import { resolveSpaceManageAccess } from '@/lib/spaces/entitlements'
import { getActiveSpace } from '@/lib/spaces/active-space'
import { trackSpaceProfileViewOnce } from '@/lib/spaces/analytics'
import { isConsoleSpaceType } from '@/lib/spaces/types'
import { readProfilePages, HOME_SLUG } from '@/lib/spaces/profile-pages'
import { defaultAccentForType, defaultPrimaryCtaLabel } from '@/lib/spaces/profile-config'
import { resolveAccentVars } from '@/lib/spaces/accent'
import { getInitials, cn } from '@/lib/utils'
import { readCoverSize } from '@/app/(main)/spaces/[slug]/manage/layout/preferences'
import { readTagline } from '@/lib/spaces/tagline'
import { spaceTypeLabel } from '@/components/spaces/space-type'
import { FollowSpaceButton } from '@/components/spaces/follow-space-button'
import { SpaceProfileTabs, type SpaceProfileTab } from '@/components/spaces/space-profile-tabs'
import { isFollowing } from '@/lib/spaces/follows'
import { AccentScope } from '@/components/spaces/accent-scope'
import { JsonLd } from '@/components/json-ld'
import { spaceSchema, breadcrumbSchema } from '@/lib/jsonld'

// ── THE NETWORKED ENTITY PROFILE CHROME (ENTITY-SPACES-BUILD §A.4 / §B.1) ────────────────────────
// This is the profile's ONE cohesive header for every public tab (Facebook/LinkedIn business-page
// grammar): a full-width COVER at the top (Header or Hero size, off preferences.coverSize) → a PROFILE
// INFO area (logo chip, the brand name as the single <h1>, type badge, tagline, then a full-width action
// row on its own line: the primary CTA by type + Follow + Connect + owner tools) → the tab menu → a
// hairline rule → the tab body (children). In the Hero size the identity is overlaid on the bottom of
// the cover over a gradient that fades to the page canvas.
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

// The action-row button GEOMETRY, matched to `buttonClasses(_, 'md')` so the on-cover (Hero overlay)
// affordances share the exact height/radius/gap of the in-flow (Header) ones. Only the COLOR differs:
// on a photo, a bordered translucent-white chip over a backdrop blur reads legibly on any cover (the
// gradient scrim guarantees the ≥4.5:1 floor); off-cover uses the canonical secondary token. Tokens
// only — no hardcoded hex; the translucent whites are legibility scrims.
const MD_BUTTON_GEOMETRY =
  'inline-flex items-center justify-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold transition-colors'
const onInkSecondaryClasses = cn(
  MD_BUTTON_GEOMETRY,
  'border border-white/40 bg-white/10 text-on-ink backdrop-blur-sm hover:bg-white/20',
)

function ownerToolClasses(onInk: boolean): string {
  return onInk ? onInkSecondaryClasses : buttonClasses('secondary', 'md')
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
  // `visibility` gates the JSON-LD (a private Space is noindex; fail-safe private).
  const [caller, tagline, visibility, viewerFollows] = await Promise.all([
    getCallerProfile(),
    readTagline(space.id),
    getSpaceVisibility(slug),
    viewerProfileId ? isFollowing(space.id, viewerProfileId) : Promise.resolve(false),
  ])
  const manage = await resolveSpaceManageAccess(space, caller?.id ?? null, caller?.webRole ?? null)
  const canSeeAsOwner = manage.canManage || manage.staffViewing
  const isNetwork = visibility !== 'private'

  const base = `/spaces/${space.slug}`
  // The owner-affordance target (ADR-441 EM1-3): practitioner + organization are served by the unified
  // /manage console, so point their Manage button straight at it; every other type opens /settings.
  const manageHref =
    space.type === 'practitioner' || space.type === 'organization' ? `${base}/manage` : `${base}/settings`

  // The nav is now OPERATOR-DEFINED (feature-block model): the ordered pages off preferences (Home +
  // any custom pages the operator created), as {href, label} for the client tab bar (active state via
  // usePathname, never a server signal — see SpaceProfileTabs). Home targets the profile index.
  const tabs: SpaceProfileTab[] = readProfilePages(space.preferences).map((p) => ({
    href: p.slug === HOME_SLUG ? base : `${base}/${p.slug}`,
    label: p.label,
  }))

  // The single primary CTA (best practice: one dominant action) routes to the reserved /book action
  // page, which renders the Space's live transactional surface (booking / join / donate / enroll /
  // tickets, branched by type). The label is the per-type default (profile-config), operator-overridable.
  const ctaHref = `${base}/book`
  const ctaLabel = defaultPrimaryCtaLabel(space.type)

  // The operator's chosen cover size (Header vs Hero), read off preferences. Default-safe to Header.
  const coverSize = readCoverSize(space.preferences)

  // The owner tools (Edit profile · Customize page): the quietest affordances in the action row, never
  // shown to a visitor. "Customize page" leads to the Manage > Page quick-edit panel for console types;
  // the never-provisioned `root` host keeps the standalone /edit-page route.
  const customizeHref = isConsoleSpaceType(space.type) ? `${base}/manage/layout` : `${base}/edit-page`
  const ownerTools = (onInk = false) =>
    canSeeAsOwner ? (
      <>
        <Link href={manageHref} className={ownerToolClasses(onInk)}>
          <Pencil className="h-4 w-4" aria-hidden />
          {manage.staffViewing ? 'Owner view (staff)' : 'Edit profile'}
        </Link>
        <Link href={customizeHref} className={ownerToolClasses(onInk)}>
          <LayoutTemplate className="h-4 w-4" aria-hidden />
          Customize page
        </Link>
      </>
    ) : null

  // The identity ACTION ROW: one aligned, wrapping row of same-height (`md`) buttons — the emphasized
  // primary CTA, then Follow + Connect (secondary), then the owner tools (quietest). It sits on its OWN
  // full-width line BELOW the name lockup at every breakpoint. `onInk` swaps the secondary/owner
  // affordances to on-cover styling for the Hero overlay while the primary CTA stays the same accent.
  const identityActions = (onInk = false) => (
    <div className="flex flex-wrap items-center gap-2">
      <Link href={ctaHref} className={buttonClasses('primary', 'md')}>
        {ctaLabel}
      </Link>
      {viewerProfileId &&
        (onInk ? (
          <FollowSpaceButton
            spaceId={space.id}
            spaceName={brandName}
            initialFollowing={viewerFollows}
            className={onInkSecondaryClasses}
          />
        ) : (
          <FollowSpaceButton spaceId={space.id} spaceName={brandName} initialFollowing={viewerFollows} />
        ))}
      <Link
        href="/codes"
        aria-label={`Connect with ${brandName}`}
        title="Connect"
        className={onInk ? cn(onInkSecondaryClasses, 'px-2.5') : buttonClasses('secondary', 'md', 'px-2.5')}
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

  // The name + type badge + tagline lockup. `onInk` paints it for legibility over a Hero cover photo.
  const nameLockup = (onInk = false) => (
    <div className="min-w-0">
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

  // HERO cover node: image + a gradient fading from the PAGE CANVAS token up to transparent (blends the
  // photo into the page + keeps overlaid text WCAG-legible on any photo), with the logo chip + name +
  // action row anchored to the bottom.
  const heroCoverNode = (
    <div className={cn('relative w-full overflow-hidden rounded-xl bg-surface-elevated', coverH)}>
      {coverImage}
      <div className="absolute inset-0 bg-gradient-to-t from-canvas via-canvas/40 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 p-5 sm:p-6">
        <div className="flex items-end gap-4">
          <div className="shrink-0">
            <BrandAnchor name={brandName} logoUrl={space.brandLogoUrl} />
          </div>
          <div className="min-w-0 pb-1">{nameLockup(true)}</div>
        </div>
        <div className="mt-4">{identityActions(true)}</div>
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
  // HEADER size: the logo chip overlaps the cover bottom, then the name + type badge + tagline, then a
  // FULL-WIDTH action ROW on its own line. HERO size: the identity is already overlaid on the cover, so
  // the info area is just the tab row. The client tab bar closes the band in both, above the divider.
  const infoBand = (
    <div>
      {!isHero && (
        <>
          <div className="flex items-end gap-4">
            <div className="-mt-12 shrink-0 sm:-mt-14">
              <BrandAnchor name={brandName} logoUrl={space.brandLogoUrl} />
            </div>
            <div className="min-w-0 pb-1">{nameLockup(false)}</div>
          </div>
          <div className="mt-5">{identityActions(false)}</div>
        </>
      )}
      <SpaceProfileTabs tabs={tabs} />
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
