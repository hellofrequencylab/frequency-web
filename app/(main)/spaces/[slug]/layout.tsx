import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Suspense } from 'react'
import { Building2, QrCode, Pencil } from 'lucide-react'
import { headers } from 'next/headers'
import { DetailTemplate, type DetailTab } from '@/components/templates'
import { buttonClasses } from '@/components/ui/button'
import { createAdminClient } from '@/lib/supabase/admin'
import { getMyProfileId } from '@/lib/auth'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
import { getSpaceCapabilities } from '@/lib/spaces/entitlements'
import { setActiveSpace } from '@/lib/spaces/active-space'
import { blueprintForType, tabForSegment } from '@/lib/spaces/blueprints'
import { spaceTypeLabel } from '@/components/spaces/space-type'
import { ProfileHeroStats } from '@/components/spaces/profile-hero-stats'
import { FollowSpaceButton } from '@/components/spaces/follow-space-button'

// ── THE NETWORKED ENTITY PROFILE (ENTITY-SPACES-BUILD §A.4 / §B.1) ──────────────────────────────
// A profile is NOT a new layout: it is the DETAIL template (context band + tabs) composed from
// registered entity modules, typed by `spaces.type` via a blueprint (§A.1). This layout resolves
// the Space, stamps it into the request-scoped active-space context (so every entity module reads
// THIS tenant's rows), and renders the context band:
//   logo + brand name (title) · tagline (subtitle) · type badge (badges) · live StatCards · the
//   dynamic primary CTA by type + Follow + Connect/QR (actions) · the blueprint's tab row (tabs).
// The tab BODY (children) is each tab page's <PageModules>. Server Components throughout; the hero
// paints instantly, the stats strip streams behind its own <Suspense> with a matched skeleton (D5).
//
// CHROME: /spaces/* is registered 'scoped' in lib/layout/page-chrome.ts (the band IS the in-body
// scope; the global rail is suppressed to avoid the double-rail trap, §B.5).

export default async function SpaceProfileLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const viewerProfileId = await getMyProfileId()

  // Resolve the Space, failing closed on a missing OR not-visible Space (no existence leak).
  const space = await getVisibleSpaceBySlug(slug, viewerProfileId)
  if (!space) notFound()

  // Stamp the active Space so every entity module (a parameterless RSC) reads this tenant's rows.
  setActiveSpace(space)

  const blueprint = blueprintForType(space.type)
  const brandName = space.brandName ?? space.name
  const typeLabel = spaceTypeLabel(space.type)

  // The active tab: the last path segment when it's a known tab id, else the index (About). The
  // shell reads the current path from the proxy header (x-pathname), the same seam PageModules uses.
  const pathname = (await headers()).get('x-pathname') ?? `/spaces/${space.slug}`
  const segs = pathname.split('/').filter(Boolean) // ['spaces', '<slug>', '<tab>'?]
  const activeSegment = segs.length >= 3 ? segs[2] : undefined

  // Capability gate for the operator-edit affordance (server-authoritative, §A.4 / Epic 1.7).
  const caps = await getSpaceCapabilities(space, viewerProfileId)

  // The one-line tagline shows as the band subtitle. It isn't on the mapped Space (not in the
  // generated DB types yet, ADR-246), so read it through the untyped client by id. Fail-safe to null.
  const tagline = await readTagline(space.id)

  const base = `/spaces/${space.slug}`
  const tabs: DetailTab[] = (blueprint?.tabs ?? [{ id: 'about', label: 'About', modules: [] }]).map((t) => ({
    href: t.id === 'about' ? base : `${base}/${t.id}`,
    label: t.label,
    active: t.id === 'about' ? !activeSegment : activeSegment === t.id,
  }))

  // The dynamic primary CTA by type (§A.4): a plain verb routing to the action tab. Accent-tinted
  // via the primary button token (the accent is a guest — it lands on the CTA, not the canvas, D4).
  const ctaTab = blueprint ? tabForSegment(blueprint, blueprint.primaryCta.tab) : null
  const ctaHref = ctaTab ? `${base}/${ctaTab.id}` : base
  const ctaLabel = blueprint?.primaryCta.label ?? 'Book'

  return (
    <DetailTemplate
      back={{ href: '/spaces', label: 'Spaces' }}
      hero={<ProfileBrandAnchor name={brandName} logoUrl={space.brandLogoUrl} />}
      title={<span className="min-w-0 break-words">{brandName}</span>}
      badges={
        <span className="inline-flex items-center gap-1.5 rounded-full bg-primary-bg px-2.5 py-0.5 text-2xs font-semibold text-primary-strong">
          {typeLabel}
        </span>
      }
      subtitle={
        <ProfileSubtitle>
          {tagline && <p className="max-w-2xl text-sm text-muted">{tagline}</p>}
          <Suspense fallback={<HeroStatsSkeleton />}>
            <ProfileHeroStats spaceId={space.id} type={space.type} />
          </Suspense>
        </ProfileSubtitle>
      }
      actions={
        <>
          <Link href={ctaHref} className={buttonClasses('primary', 'md')}>
            {ctaLabel}
          </Link>
          {viewerProfileId && <FollowSpaceButton spaceId={space.id} spaceName={brandName} />}
          <Link
            href="/codes"
            aria-label={`Connect with ${brandName}`}
            title="Connect"
            className={buttonClasses('secondary', 'md', 'px-2.5')}
          >
            <QrCode className="h-4 w-4" aria-hidden />
          </Link>
          {caps.canEditProfile && (
            <Link
              href={`${base}/settings`}
              className={buttonClasses('secondary', 'md')}
            >
              <Pencil className="h-3.5 w-3.5" aria-hidden />
              Edit profile
            </Link>
          )}
        </>
      }
      tabs={tabs}
    >
      {children}
    </DetailTemplate>
  )
}

// Read the not-yet-typed `tagline` column for a Space id (ADR-246). Fail-safe to null so the band
// renders without a subtitle line rather than throwing.
async function readTagline(spaceId: string): Promise<string | null> {
  try {
    const { data } = (await createAdminClient()
      .from('spaces')
      .select('tagline')
      .eq('id', spaceId)
      .maybeSingle()) as { data: { tagline?: string | null } | null }
    const tagline = data?.tagline?.trim()
    return tagline ? tagline : null
  } catch {
    return null
  }
}

// The brand anchor in the Detail hero: the operator's logo (a plain <img>, an arbitrary operator
// URL like BrandMark), or a neutral icon chip. Decorative (alt=""): the title carries the name.
function ProfileBrandAnchor({ name, logoUrl }: { name: string; logoUrl: string | null }) {
  void name
  return (
    <div className="flex items-center">
      {logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- operator-supplied Space logo URL, not a build-time asset (matches BrandMark / SpaceCard)
        <img
          src={logoUrl}
          alt=""
          className="h-16 w-16 rounded-2xl border border-border bg-surface object-contain sm:h-20 sm:w-20"
        />
      ) : (
        <span
          className="flex h-16 w-16 items-center justify-center rounded-2xl bg-surface-elevated text-subtle sm:h-20 sm:w-20"
          aria-hidden
        >
          <Building2 className="h-7 w-7" />
        </span>
      )}
    </div>
  )
}

function ProfileSubtitle({ children }: { children: React.ReactNode }) {
  return <div className="mt-2 space-y-2">{children}</div>
}

// Dimension-matched skeleton for the streamed hero stats strip (no CLS, PAGE-FRAMEWORK §5.4).
function HeroStatsSkeleton() {
  return (
    <div className="grid max-w-xl grid-cols-2 gap-3 sm:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="h-[58px] animate-pulse rounded-2xl bg-surface-elevated/60" />
      ))}
    </div>
  )
}
