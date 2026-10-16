import Link from 'next/link'
import { SlidersHorizontal, ArrowUpRight } from 'lucide-react'
import { getMyProfileId, getCallerProfile } from '@/lib/auth'
import { getVisibleSpaceBySlug, getSpaceVisibility } from '@/lib/spaces/store'
import { getSpaceClaimToken } from '@/lib/spaces/claim'
import { resolveSpaceManageAccess, getSpaceCapabilities } from '@/lib/spaces/entitlements'
import { usableSpaceFunctions, type SpaceFunctionKey } from '@/lib/spaces/functions'
import { buildSpaceProfileNav } from '@/lib/spaces/profile-nav'
import { readHeaderLogo } from '@/lib/spaces/site-menu'
import { defaultPrimaryCtaLabel, defaultAccentForType } from '@/lib/spaces/profile-config'
import { readHeroConfig, resolveHero } from '@/lib/spaces/hero-config'
import { coverPlaceholderFor } from '@/lib/spaces/cover-placeholder'
import { readTagline } from '@/lib/spaces/tagline'
import { readModuleMenuPrefs } from '@/lib/spaces/module-menu'
import { isFollowing } from '@/lib/spaces/follows'
import { frequencyAccentVars, resolveAccentVars } from '@/lib/spaces/accent'
import { spacePageDefaultAccent, spacePageFonts } from '@/lib/theme/site-style'
import { activeBoostIds } from '@/lib/crew/boost'
import { foundingBadgeForSpace } from '@/lib/founding/status'
import { FoundingBusinessBadge } from '@/lib/community-roles'
import { readCoverSize, readCoverFocus, readLogoBackdrop } from '@/app/(main)/spaces/[slug]/manage/layout/preferences'
import { AccentScope } from '@/components/spaces/accent-scope'
import { BrandAnchor } from '@/components/spaces/brand-anchor'
import { FollowSpaceButton } from '@/components/spaces/follow-space-button'
import { SpaceProfileMenu } from '@/components/spaces/space-profile-menu'
import { SpaceShareButton } from '@/components/spaces/space-share-button'
import { SpacePrivateNotice } from '@/components/spaces/space-private-notice'
import { BoostButton } from '@/components/crew/boost-button'
import { BoostedBadge } from '@/components/crew/boosted-badge'
import { OpenAdminBarButton } from '@/components/admin/open-admin-bar-button'
import { FqSpaceChrome } from './space-chrome'

// A SPACE-OWNED CIRCLE WEARS ITS SPACE'S HEADER (SCAN-881, owner 2026-10-14). Under Frequency a Circle
// whose space_id is a real Space (the platform root excluded, lib/circles/owning-space.ts) opens with the
// SAME header the Space's own pages wear: FqSpaceChrome, fed exactly as the Space's (profile) layout feeds
// it (app/(main)/spaces/[slug]/(profile)/layout.tsx, its Frequency branch): the cover with its focal point
// and size, the logo chip, eyebrow, name, Founding and Boosted marks, tagline, Share, the owner's Edit, the
// primary CTA, the Space's tab row with Follow and Boost, the private-Space notice, all inside the Space's
// AccentScope the way app/(main)/spaces/[slug]/layout.tsx scopes every Space route. The Circle's own cover,
// title, tabs and actions render below it as the header's body.
//
// It reads what the Space layout reads, with the viewer's own visibility: a Space this viewer may not see
// (a private Space they are not in) yields no header, and the Circle renders as it always did. The profile
// view counter is NOT fired here: a Circle page is not a visit to the Space's profile.
//
// KEEP IN STEP with the (profile) layout's Frequency branch. The header component itself is untouched.

export async function FqCircleSpaceHeader({ spaceSlug, children }: { spaceSlug: string; children: React.ReactNode }) {
  const viewerProfileId = await getMyProfileId()
  const space = await getVisibleSpaceBySlug(spaceSlug, viewerProfileId)
  if (!space || space.type === 'root') return <>{children}</>

  const brandName = space.brandName ?? space.name
  const [caller, tagline, visibility, viewerFollows, foundingBadge, boostedIds, nav] = await Promise.all([
    getCallerProfile(),
    readTagline(space.id),
    getSpaceVisibility(space.slug),
    viewerProfileId ? isFollowing(space.id, viewerProfileId) : Promise.resolve(false),
    foundingBadgeForSpace(space.id),
    activeBoostIds('space', [space.id]),
    buildSpaceProfileNav(space),
  ])
  const isFoundingBusiness = foundingBadge?.isFounding === true
  const isBoosted = boostedIds.has(space.id)
  const manage = await resolveSpaceManageAccess(space, caller?.id ?? null, caller?.webRole ?? null)
  const canSeeAsOwner = manage.canManage || manage.staffViewing
  const isNetwork = visibility !== 'private'

  const isPlatformStaffViewer = caller?.webRole === 'admin' || caller?.webRole === 'janitor'
  const spaceClaimToken = isPlatformStaffViewer ? await getSpaceClaimToken(space.id) : null
  const claimUrl = spaceClaimToken ? `/spaces/claim/${spaceClaimToken}` : undefined

  let spaceFns: SpaceFunctionKey[] = []
  if (canSeeAsOwner) {
    const spaceCaps = await getSpaceCapabilities(space, caller?.id ?? null)
    spaceFns = usableSpaceFunctions(space, spaceCaps.role, manage.staffViewing)
  }
  const moduleMenu = readModuleMenuPrefs(space.preferences)
  const base = `/spaces/${space.slug}`
  const { tabs, adminTabs } = nav
  const canManage = adminTabs.some((t) => t.label === 'Manage')

  const headerLogo = readHeaderLogo(space.preferences)
  const showLogoChip = headerLogo.mode !== 'name'
  const logoChipUrl = headerLogo.mode === 'logo' && headerLogo.logoUrl ? headerLogo.logoUrl : space.brandLogoUrl
  const hero = resolveHero({
    config: readHeroConfig(space.preferences),
    preferences: space.preferences,
    base,
    brandName,
    tagline,
    defaultCtaLabel: defaultPrimaryCtaLabel(space.type),
  })
  const ctaLinkProps = hero.cta.external ? { target: '_blank' as const, rel: 'noopener noreferrer' } : {}
  const coverSrc = space.coverImageUrl || coverPlaceholderFor(space.id)
  const isHero = readCoverSize(space.preferences) === 'hero'
  const coverFocus = readCoverFocus(space.preferences)
  const logoBackdrop = readLogoBackdrop(space.preferences)

  const accentVars = resolveAccentVars(space.brandAccent, spacePageDefaultAccent(space.preferences, defaultAccentForType(space.type)))
  const frost = 'btn fqs-frost'

  return (
    <>
    <AccentScope vars={accentVars} theme={spacePageFonts(space.preferences)} fqAccent={frequencyAccentVars(space.brandAccent)}>
      <FqSpaceChrome
        coverImage={coverSrc}
        coverFocus={coverFocus}
        tall={isHero}
        logo={showLogoChip ? <BrandAnchor name={brandName} logoUrl={logoChipUrl} backdrop={logoBackdrop} /> : null}
        eyebrow={hero.eyebrow}
        name={hero.heading}
        badges={
          isFoundingBusiness || isBoosted ? (
            <div className="fqs-badges">
              {isFoundingBusiness && <FoundingBusinessBadge founding className="text-3xs leading-tight" />}
              <BoostedBadge boosted={isBoosted} className="text-3xs leading-tight" />
            </div>
          ) : null
        }
        tagline={
          hero.tagline ? (
            <p className="fqs-tagline">{hero.tagline}</p>
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
            <Link href={hero.cta.href} className="btn pa" {...ctaLinkProps}>
              {hero.cta.label}
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
                  <FollowSpaceButton spaceId={space.id} spaceName={brandName} initialFollowing={viewerFollows} className="btn sm" />
                  {!canSeeAsOwner && <BoostButton kind="space" targetId={space.id} className="btn sm" />}
                </>
              ) : null
            }
          />
        }
        notices={manage.canManage && !isNetwork ? <SpacePrivateNotice spaceId={space.id} /> : null}
      >
        {null}
      </FqSpaceChrome>
    </AccentScope>
    {/* The Circle renders BESIDE the Space header, not inside its body (SCAN-900): inside, it took the
        Space page's data-space-page dress and the Space's own fonts (serif cards, a beige lower page,
        overlapping stat labels), and its own cover stacked under the Space cover. Out here it is an
        ordinary member page under the Space's header. */}
    {children}
    </>
  )
}
