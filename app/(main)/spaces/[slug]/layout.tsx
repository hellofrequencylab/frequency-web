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
import { resolveAccentVars } from '@/lib/spaces/accent'
import { spaceTypeLabel } from '@/components/spaces/space-type'
import { ProfileHeroStats } from '@/components/spaces/profile-hero-stats'
import { FollowSpaceButton } from '@/components/spaces/follow-space-button'
import { AccentScope } from '@/components/spaces/accent-scope'

// ── THE NETWORKED ENTITY PROFILE (ENTITY-SPACES-BUILD §A.4 / §B.1) ──────────────────────────────
// A profile is NOT a new layout: it is the DETAIL template (context band + tabs) composed from
// registered entity modules, typed by `spaces.type` via a blueprint (§A.1). This layout resolves
// the Space, stamps it into the request-scoped active-space context (so every entity module reads
// THIS tenant's rows), paints the Space's brand ACCENT over the whole profile subtree, and renders
// the context band as a real HERO CARD (the My Quest hero quality bar, §A.3):
//   logo chip + brand name (h1) + type badge · tagline · live StatCard row · the dynamic primary
//   CTA by type + Follow + Connect/QR. The blueprint's tab row sits on the plain canvas below.
// The tab BODY (children) is each tab page's <PageModules>. Server Components throughout; the hero
// identity paints instantly, the stats row streams behind its own <Suspense> with a matched skeleton (D5).
//
// ACCENT (D4 "the accent is a guest"): the Space's validated `brand_accent` token (or the blueprint's
// per-role default) is remapped onto the `--color-primary*` family by a SCOPED inline override on the
// AccentScope wrapper (lib/spaces/accent.ts), so the CTA, active tab, and type badge carry the Space's
// color while the canvas stays neutral. Tokens only — never a hex (D6). The five roles read distinct.
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

  // The brand accent override (§1 KEYSTONE): the Space's own validated `brand_accent` token wins,
  // else the blueprint's per-role default, else null (the host amber). Only validated allowlisted
  // tokens build the override — never a hex (lib/spaces/accent.ts, D4/D6).
  const accentVars = resolveAccentVars(space.brandAccent, blueprint?.defaultAccent)

  // The active tab: the last path segment when it's a known tab id, else the index (About). The
  // shell reads the current path from the proxy header (x-pathname), the same seam PageModules uses.
  const pathname = (await headers()).get('x-pathname') ?? `/spaces/${space.slug}`
  const segs = pathname.split('/').filter(Boolean) // ['spaces', '<slug>', '<tab>'?]
  const activeSegment = segs.length >= 3 ? segs[2] : undefined

  // Capability gate for the operator-edit affordance (server-authoritative, §A.4 / Epic 1.7).
  const caps = await getSpaceCapabilities(space, viewerProfileId)

  // The one-line tagline shows under the name. It isn't on the mapped Space (not in the generated DB
  // types yet, ADR-246), so read it through the untyped client by id. Fail-safe to null.
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
    <AccentScope vars={accentVars}>
      <DetailTemplate
        back={{ href: '/spaces', label: 'Spaces' }}
        title={brandName}
        band={
          <ProfileHeroCard
            name={brandName}
            logoUrl={space.brandLogoUrl}
            typeLabel={typeLabel}
            tagline={tagline}
            stats={
              <Suspense fallback={<HeroStatsSkeleton />}>
                <ProfileHeroStats spaceId={space.id} type={space.type} />
              </Suspense>
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
                  <Link href={`${base}/settings`} className={buttonClasses('secondary', 'md')}>
                    <Pencil className="h-3.5 w-3.5" aria-hidden />
                    Edit profile
                  </Link>
                )}
              </>
            }
          />
        }
        tabs={tabs}
      >
        {children}
      </DetailTemplate>
    </AccentScope>
  )
}

// ── The hero CARD — the entity context band, lifted to the My Quest hero quality bar (§2, §A.3) ──
// A self-contained `rounded-3xl` card on a soft accent gradient: the identity lockup (logo chip
// inline beside the name + type badge), the tagline, a full-width live stats row, then the CTAs.
// It owns the single page <h1>. The gradient + badge read the (accent-overridden) `--color-primary*`
// family, so the card tints to the Space's brand without a hex (D4/D6). Stays calm: a tinted card on
// the neutral canvas, never a full-page repaint.
function ProfileHeroCard({
  name,
  logoUrl,
  typeLabel,
  tagline,
  stats,
  actions,
}: {
  name: string
  logoUrl: string | null
  typeLabel: string
  tagline: string | null
  stats: React.ReactNode
  actions: React.ReactNode
}) {
  return (
    <section className="rounded-3xl border border-border bg-gradient-to-br from-primary-bg/25 via-surface to-surface p-6 shadow-sm">
      {/* Identity row: the logo anchor chip inline in the title lockup (§A.4), the name as the page
          <h1>, the accent-tinted type badge, and the CTAs (which wrap below on mobile). */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-center gap-4">
          <BrandAnchor name={name} logoUrl={logoUrl} />
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="min-w-0 break-words text-xl font-bold leading-tight text-text sm:text-2xl">
                {name}
              </h1>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-primary-bg px-2.5 py-0.5 text-2xs font-semibold text-primary-strong">
                {typeLabel}
              </span>
            </div>
            {tagline && <p className="mt-1 max-w-2xl text-sm text-muted">{tagline}</p>}
          </div>
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2 sm:shrink-0">{actions}</div>}
      </div>

      {/* The live numbers band, promoted to its own full-width row (§2). Empty for a brand-new Space
          (renders nothing), so the card stays tidy without it. */}
      <div className="mt-5 empty:mt-0">{stats}</div>
    </section>
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

// The brand anchor chip in the hero lockup: the operator's logo (a plain <img>, an arbitrary
// operator URL like BrandMark), or a neutral icon chip. Decorative (alt=""): the <h1> carries the
// name. Sized as an inline chip beside the title (§A.4), not a loose floating block.
function BrandAnchor({ name, logoUrl }: { name: string; logoUrl: string | null }) {
  void name
  if (logoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- operator-supplied Space logo URL, not a build-time asset (matches BrandMark / SpaceCard)
      <img
        src={logoUrl}
        alt=""
        className="h-14 w-14 shrink-0 rounded-2xl border border-border bg-surface object-contain sm:h-16 sm:w-16"
      />
    )
  }
  return (
    <span
      className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-surface-elevated text-subtle sm:h-16 sm:w-16"
      aria-hidden
    >
      <Building2 className="h-7 w-7" />
    </span>
  )
}

// Dimension-matched skeleton for the streamed hero stats row (no CLS, PAGE-FRAMEWORK §5.4).
function HeroStatsSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="h-[58px] animate-pulse rounded-2xl bg-surface-elevated/60" />
      ))}
    </div>
  )
}
