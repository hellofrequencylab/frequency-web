import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { SlidersHorizontal, ArrowUpRight } from 'lucide-react'
import { getMyProfileId, getCallerProfile } from '@/lib/auth'
import { getVisibleSpaceBySlug, getSpaceVisibility } from '@/lib/spaces/store'
import { getSpaceClaimToken } from '@/lib/spaces/claim'
import { resolveSpaceManageAccess, getSpaceCapabilities } from '@/lib/spaces/entitlements'
import { spaceFunctionAccess, usableSpaceFunctions, type SpaceFunctionKey } from '@/lib/spaces/functions'
import { getActiveSpace } from '@/lib/spaces/active-space'
import { trackSpaceProfileViewOnce } from '@/lib/spaces/analytics'
import { buildSpaceProfileNav } from '@/lib/spaces/profile-nav'
import { readHeaderLogo } from '@/lib/spaces/site-menu'
import { defaultPrimaryCtaLabel } from '@/lib/spaces/profile-config'
import { readHeroConfig, resolveHero } from '@/lib/spaces/hero-config'
import { coverPlaceholderFor } from '@/lib/spaces/cover-placeholder'
import { BrandAnchor } from '@/components/spaces/brand-anchor'
import { readCoverSize, readCoverFocus, readLogoBackdrop } from '@/app/(main)/spaces/[slug]/manage/layout/preferences'
import { readTagline } from '@/lib/spaces/tagline'
import { readProfileData } from '@/lib/spaces/profile-data'
import { FollowSpaceButton } from '@/components/spaces/follow-space-button'
import { BoostButton } from '@/components/crew/boost-button'
import { BoostedBadge } from '@/components/crew/boosted-badge'
import { activeBoostIds } from '@/lib/crew/boost'
import { OpenAdminBarButton } from '@/components/admin/open-admin-bar-button'
import { readModuleMenuPrefs } from '@/lib/spaces/module-menu'
import { SpaceProfileMenu } from '@/components/spaces/space-profile-menu'
import { RegularsNote } from '@/components/spaces/regulars-note'
import { BadgeNote } from '@/components/spaces/badge-note'
import { CardholderPerkNote } from '@/components/spaces/cardholder-perk-note'
import { FeaturedCheckin } from '@/components/spaces/featured-checkin'
import { isFollowing } from '@/lib/spaces/follows'
import { SpaceShareButton } from '@/components/spaces/space-share-button'
import { SpacePrivateNotice } from '@/components/spaces/space-private-notice'
import { JsonLd } from '@/components/json-ld'
import { spaceSchema, breadcrumbSchema, parseOpeningHours, spaceOfferingsSchema } from '@/lib/jsonld'
import { spaceSchemaLocation } from '@/lib/spaces/schema-location'
import { isServiceListed } from '@/lib/spaces/profile-data'
import { getSpaceReviews } from '@/lib/spaces/content-data'
import { foundingBadgeForSpace } from '@/lib/founding/status'
import { FqSpaceChrome } from '@/components/frequency/members/space/space-chrome'
import { FqSpaceFacts } from '@/components/frequency/members/space/space-facts'
import { FounderMark } from '@/components/frequency/members/space/founder-mark'
import { readPublicSpaceFacts } from '@/lib/spaces/public-facts'
import { BETA_CTA_HREF, BETA_CTA_LABEL } from '@/lib/site'

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
// client-side (SpaceProfileMenu → usePathname), the only signal that stays correct across soft nav.
//
// The Space itself is resolved + stamped once by the parent [slug]/layout.tsx; we read it back from the
// request-scoped active-space context (getActiveSpace), falling back to a re-resolve defensively.

// The cover PLACEHOLDER (a Space with no uploaded cover) is the SHARED deterministic pick from
// lib/spaces/cover-placeholder — the OG share card (opengraph-image.tsx) draws from the same source,
// so a shared link previews the SAME photo this hero shows.

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

  // The brand accent (§1 KEYSTONE) and the page THEME (ADR-578) are NOT resolved here any more. They
  // are properties of the Space, not of the profile group, and this layout was the reason every
  // sibling subtree — manage, settings, crm, marketing, the public podcasts tabs, the editors, and the
  // sibling `loading.tsx` — rendered unscoped (LIVE-196, ADR-1192). The single AccentScope now sits in
  // the parent `[slug]/layout.tsx` and wraps this subtree along with all of them.

  // The hero's remaining inputs are independent, so resolve them in ONE round-trip (site-audit PERF-4).
  // `visibility` gates the JSON-LD (a private Space is noindex; fail-safe private). `presence` (which
  // live sections have real rows) rides the same round-trip and is request-cached, SHARED with the page
  // body's own content read, so the anchor menu costs no extra queries on the Home render.
  // The FOUNDING BUSINESS mark rides the same round-trip (one bounded read, no extra waterfall). It is
  // PUBLIC by design: a Founding Business shows its badge to every visitor, signed in or not. Only the
  // boolean crosses into the header; the row's locked rate is a private commercial term and stays here.
  // The Boosted mark (LIVE-756) is public too, read in the same batch (fail-safe to unboosted).
  const [caller, tagline, visibility, viewerFollows, foundingBadge, boostedIds] = await Promise.all([
    getCallerProfile(),
    readTagline(space.id),
    getSpaceVisibility(slug),
    viewerProfileId ? isFollowing(space.id, viewerProfileId) : Promise.resolve(false),
    foundingBadgeForSpace(space.id),
    activeBoostIds('space', [space.id]),
  ])
  const isFoundingBusiness = foundingBadge?.isFounding === true
  const isBoosted = boostedIds.has(space.id)
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
  // The Space's public business facts (address / phone / website / socials), read from the SAME preferences
  // source the Contact + Business blocks render, so the LocalBusiness JSON-LD below carries real NAP + sameAs.
  // Pure sync read; only needed for the network schema.
  const spaceProfile = isNetwork ? readProfileData(space.preferences) : {}
  const schemaLocation = spaceSchemaLocation(space, spaceProfile.address)
  // The PUBLIC (listed) offerings only — a private service never renders publicly, so it must never leak
  // into the structured data either. Fed to the Product/Offer ItemList below (network schema only).
  const listedOfferings = (spaceProfile.offerings ?? []).filter(isServiceListed)

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
  // (SpaceProfileMenu → usePathname), so nothing here goes stale across soft navigation.
  const { tabs, adminTabs } = await buildSpaceProfileNav(space)

  // THE HEADER LOGO (lib/spaces/site-menu.ts, shared with the website): the round image beside the name
  // by default, the name alone with the image off, or an uploaded logo (a wordmark) in the chip.
  const headerLogo = readHeaderLogo(space.preferences)
  const showLogoChip = headerLogo.mode !== 'name'
  const logoChipUrl = headerLogo.mode === 'logo' && headerLogo.logoUrl ? headerLogo.logoUrl : space.brandLogoUrl

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
  // The operator's chosen cover FOCAL POINT (where the cropped cover sits in its window), set with the shared
  // ImageFocalPicker in the Branding rail. A CSS object-position applied to the cover <Image> below; unset
  // reads as centered ("50% 50%"), so a Space that never touched it crops exactly as before. Repositions
  // the photo only — the header height is untouched (coverH is unchanged).
  const coverFocus = readCoverFocus(space.preferences)
  // Whether the brand logo chip keeps its plate. Default 'plate' = today's look; an operator picks 'none'
  // for a mark drawn with a transparent background (Identity & Branding -> Logo backdrop).
  const logoBackdrop = readLogoBackdrop(space.preferences)

  // ── THE COVER + IDENTITY ─────────────────────────────────────────────────────────────────────────
  // A real uploaded cover always wins; a Space with NONE falls back to a calm SITE stock photo. The
  // image is a next/image with `fill` + `preload` (not a plain <img>) so it paints on the FIRST
  // navigation instead of blank-until-refresh.
  const coverSrc = space.coverImageUrl || coverPlaceholderFor(space.id)
  const isHero = coverSize === 'hero'

  // The menu row is handed to the template's STICKY slot (not the band), so it detaches on scroll and
  // pins directly under the global header, staying in view for the whole page (and for anchor jumps —
  // the section targets carry scroll-margin that clears the header + this pinned bar). The band above
  // holds only the identity; on the Hero size the identity is already on the cover, so the band is bare.
  //
  // "Manage" is an OWNER-only soft-nav to `?panel=manage`: it swaps the profile body to the Manage
  // dashboard (quick stats + link cards to the five management areas) with the hero + menu pinned, no
  // reload. It is no longer a fold-out dropdown, and there is no separate CRM item (the CRM lives inside
  // the dashboard's Community area). A visitor never sees it (canManage false).
  const canManage = adminTabs.some((t) => t.label === 'Manage')

  // Per-type structured data for the PUBLIC profile plus a Breadcrumb back to the directory. Network
  // spaces only, never on a private one. Both designs emit the same node.
  const structuredData = isNetwork ? (
    <JsonLd
      data={[
        spaceSchema({
          slug: space.slug,
          type: space.type,
          name: brandName,
          tagline,
          logoUrl: space.brandLogoUrl,
          aggregateRating,
          // NAP + sameAs for a LocalBusiness node (the "<category> near you" / AIO local signal). All
          // already rendered on this page by the Contact / Business blocks; read the same source here so
          // the schema carries the address, phone, website + socials instead of a name-only stub.
          telephone: spaceProfile.phone,
          // The place half (street, addressLocality, addressRegion, postalCode, addressCountry and geo) is
          // built once in lib/spaces/schema-location.ts, which also applies the owner's location precision.
          address: schemaLocation.address,
          geo: schemaLocation.geo,
          sameAs: [spaceProfile.website, ...(spaceProfile.socials ?? []).map((s) => s.url)],
          // The operator's relative price indicator ('$'..'$$$$'), captured on the Business Info form.
          priceRange: spaceProfile.priceRange,
          // Free-text hours parsed best-effort into schema.org openingHours; unparseable lines drop out,
          // so the node stays valid (the free-text field remains the source for display).
          openingHours: parseOpeningHours(spaceProfile.hours),
        }),
        // The listed offerings as an ItemList of Product/Offer nodes (what the Space offers + what it
        // costs), so answer engines can cite the services. Omitted entirely when there are none.
        ...(listedOfferings.length
          ? [spaceOfferingsSchema(listedOfferings, { slug: space.slug, sellerName: brandName, listName: `${brandName} offerings` })]
          : []),
        breadcrumbSchema([
          { name: 'Spaces', path: '/spaces' },
          { name: brandName, path: `/spaces/${space.slug}` },
        ]),
      ]}
    />
  ) : null
  const frost = 'btn fqs-frost'
  const checkinOn = spaceFunctionAccess(space, 'checkin', 'admin')
  // SIGNED OUT (SCAN-883): a visitor on a Space tab reads this chrome under the public site shell
  // (app/(main)/layout.tsx publicChrome), which has no centred column and no right rail. `public` opens
  // the same frame the share root (app/(public)/spaces/[slug]/page.tsx) does, and the side column
  // carries the same viewer-free key facts. A signed-in member keeps the shell's column and rail.
  const signedOut = !viewerProfileId
  const facts = signedOut && isNetwork ? await readPublicSpaceFacts(space, { tagline }) : null
  return (
    <>
      {structuredData}
      <FqSpaceChrome
        public={signedOut}
        aside={
          facts ? (
            <FqSpaceFacts
              facts={facts}
              brandName={brandName}
              joinHref={BETA_CTA_HREF}
              joinLabel={BETA_CTA_LABEL}
              calendarHref={tabs.find((t) => t.href === `${base}/calendar`)?.href ?? null}
            />
          ) : undefined
        }
        coverImage={coverSrc}
        coverFocus={coverFocus}
        tall={isHero}
        logo={showLogoChip ? <BrandAnchor name={brandName} logoUrl={logoChipUrl} backdrop={logoBackdrop} /> : null}
        eyebrow={heroEyebrow}
        name={heroHeading}
        // The Founding mark rides INSIDE the cover photo (LIVE-1019); Boosted stays beside the name.
        coverBadge={isFoundingBusiness ? <FounderMark /> : null}
        // The Check In button (LIVE-1180): top right of the cover; greyed out until the Space turns badge check-in on.
        coverAction={
          <Suspense fallback={null}>
            <BadgeNote spaceId={space.id} slug={space.slug} viewerProfileId={viewerProfileId} variant="cover" checkinOn={checkinOn} />
          </Suspense>
        }
        badges={
          isBoosted ? (
            <div className="fqs-badges">
              <BoostedBadge boosted={isBoosted} className="text-3xs leading-tight" />
            </div>
          ) : null
        }
        tagline={
          heroTagline ? (
            <p className="fqs-tagline">{heroTagline}</p>
          ) : canSeeAsOwner ? (
            <p className="fqs-tagline">
              <Link href={`${base}/manage?section=settings`}>Add a tagline. Say what you do.</Link>
            </p>
          ) : null
        }
        actions={
          <>
            <SpaceShareButton
              slug={space.slug}
              brandName={brandName}
              brandLogoUrl={space.brandLogoUrl}
              sharerProfileId={viewerProfileId}
              hasContactCard
              claimUrl={claimUrl}
              className={frost}
            />
            {canSeeAsOwner && (
              <OpenAdminBarButton
                scope={{ kind: 'space', id: space.id }}
                spaceType={space.type}
                spaceFns={spaceFns}
                moduleMenu={{ order: moduleMenu.order, hidden: moduleMenu.hidden, activated: moduleMenu.activated }}
                label={manage.staffViewing ? 'Edit (staff)' : 'Edit'}
                icon={<SlidersHorizontal aria-hidden />}
                className={frost}
              />
            )}
            <Link href={ctaHref} className="btn pa" {...ctaLinkProps}>
              {ctaLabel}
              <ArrowUpRight aria-hidden />
            </Link>
          </>
        }
        nav={
          <SpaceProfileMenu
            tabs={tabs}
            canManage={canManage}
            homeHref={base}
            tools={
              viewerProfileId ? (
                <>
                  <FollowSpaceButton
                    spaceId={space.id}
                    spaceName={brandName}
                    initialFollowing={viewerFollows}
                    className="btn sm"
                  />
                  {!canSeeAsOwner && <BoostButton kind="space" targetId={space.id} className="btn sm" />}
                </>
              ) : null
            }
          />
        }
        notices={manage.canManage && !isNetwork ? <SpacePrivateNotice spaceId={space.id} /> : null}
      >
        {/* A tapped placard lands here with ?checkin=: the check-in goes first. Empty otherwise. */}
        <Suspense fallback={null}>
          <FeaturedCheckin spaceName={brandName} />
        </Suspense>
        {/* The Regulars line (LIVE-944): what a full card here earns. Empty unless the program is on. */}
        <Suspense fallback={null}>
          <RegularsNote spaceId={space.id} />
        </Suspense>
        {/* The cardholder perk line (LIVE-1282): what this Space offers Frequency card holders. Empty unless set. */}
        <Suspense fallback={null}>
          <CardholderPerkNote spaceId={space.id} />
        </Suspense>
        {children}
      </FqSpaceChrome>
    </>
  )
}

// BrandAnchor (the logo chip) now lives in @/components/spaces/brand-anchor, shared with the public claim
// page so the two render the identical chip.
