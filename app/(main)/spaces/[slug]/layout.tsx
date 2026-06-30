import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Suspense, cache } from 'react'
import { Building2, QrCode, Pencil } from 'lucide-react'
import { headers } from 'next/headers'
import { DetailTemplate, type DetailTab } from '@/components/templates'
import { buttonClasses } from '@/components/ui/button'
import { createAdminClient } from '@/lib/supabase/admin'
import { getMyProfileId, getCallerProfile } from '@/lib/auth'
import { getVisibleSpaceBySlug, getSpaceBySlug, getSpaceVisibility } from '@/lib/spaces/store'
import { resolveSpaceManageAccess } from '@/lib/spaces/entitlements'
import { setActiveSpace } from '@/lib/spaces/active-space'
import { trackSpaceProfileViewOnce } from '@/lib/spaces/analytics'
import { blueprintForType, tabForSegment } from '@/lib/spaces/blueprints'
import { resolveAccentVars } from '@/lib/spaces/accent'
import { spaceTypeLabel } from '@/components/spaces/space-type'
import { ProfileHeroStats } from '@/components/spaces/profile-hero-stats'
import { FollowSpaceButton } from '@/components/spaces/follow-space-button'
import { isFollowing } from '@/lib/spaces/follows'
import { AccentScope } from '@/components/spaces/accent-scope'
import { JsonLd } from '@/components/json-ld'
import { spaceSchema, breadcrumbSchema } from '@/lib/jsonld'
import { SITE_NAME } from '@/lib/site'

// React.cache the two reads that BOTH generateMetadata and the layout body make (site-audit
// PERF-5), so a single request resolves each once instead of twice. readTagline is cached at its
// own definition below.
const spaceVisibility = cache(getSpaceVisibility)

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
// CHROME: the profile (/spaces/<slug> + tabs) keeps the GLOBAL community rail (lib/layout/page-chrome.ts):
// the context band is an in-body hero CARD, not a shell rail, so it reads as a normal Detail page beside
// the site's Quest rail (operator request). The owner settings sub-surfaces stay Focus (no rail).

// The lowercase, article-prefixed role phrase for the meta description ("a practitioner",
// "an event space"). spaceTypeLabel returns a title-cased badge ("Event Space"); the description
// reads as a plain sentence, so it is lowercased and given the right article. Sentence case, no
// em/en dashes (CONTENT-VOICE §5e).
function typePhrase(type: string): string {
  const noun = spaceTypeLabel(type).toLowerCase()
  const article = /^[aeiou]/.test(noun) ? 'an' : 'a'
  return `${article} ${noun}`
}

// ── PROFILE METADATA + INDEXABILITY (SEO/AIO flagship) ──────────────────────────────────────────
// generateMetadata resolves the Space ANONYMOUSLY (getSpaceBySlug, no viewer) so a crawler gets the
// right title/description/canonical without an auth round-trip. The single most important rule here:
// a NETWORK (public) Space is fully indexable; a PRIVATE Space emits noindex,nofollow so it can never
// leak into a search index or an answer engine, even if a member shares the link. A missing Space
// gets a plain "not found" title (no existence signal beyond the 404 the page itself returns).
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const space = await getSpaceBySlug(slug)
  if (!space || space.status !== 'active') return { title: 'Space not found' }

  const visibility = await spaceVisibility(slug)
  const isPrivate = visibility === 'private'

  const brandName = space.brandName?.trim() || space.name
  const tagline = await readTagline(space.id)

  // "{name}: a {type} on Frequency. {tagline}", trimmed under ~155 chars for the search snippet.
  const base = `${brandName}: ${typePhrase(space.type)} on ${SITE_NAME}.`
  const full = tagline ? `${base} ${tagline}` : base
  const description = full.length > 155 ? `${full.slice(0, 152).trimEnd()}...` : full
  const ogTitle = `${brandName} · ${SITE_NAME}`
  const canonical = `/spaces/${space.slug}`

  // PRIVATE: never index or follow (no leak). NETWORK: full canonical + OG (profile) + Twitter.
  if (isPrivate) {
    return {
      title: brandName,
      description,
      robots: { index: false, follow: false },
    }
  }

  return {
    title: brandName,
    description,
    alternates: { canonical },
    openGraph: { title: ogTitle, description, url: canonical, type: 'profile' },
    twitter: { card: 'summary_large_image', title: ogTitle, description },
  }
}

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

  // The current path, off the proxy-stamped x-pathname (the same seam PageModules uses). No third
  // segment = the profile index. We read it FIRST so an owner surface can escape the profile chrome
  // before any profile-only work runs below.
  const pathname = (await headers()).get('x-pathname') ?? `/spaces/${space.slug}`
  const segs = pathname.split('/').filter(Boolean) // ['spaces', '<slug>', '<segment>'?]
  const activeSegment = segs.length >= 3 ? segs[2] : undefined

  // OWNER SURFACES ESCAPE THE PROFILE CHROME. The /manage console, the legacy /settings cockpit, and
  // the /crm board are operator workspaces, NOT the public profile: each owns its own header
  // (DashboardTemplate / FocusTemplate) and must not be wrapped in the profile hero + tab row. This
  // layout sits above all three (they are segments under [slug]), and a child layout cannot un-wrap its
  // parent, so the ONLY place to drop the profile chrome for them is here: when the current path is an
  // owner surface, return the children directly with no profile band/tabs. The rail is handled
  // separately in lib/layout/page-chrome.ts (/manage and /crm are full-width 'none' Dashboards like the
  // other owner consoles; /settings keeps the global rail beside its centered Focus body).
  //
  // /crm IS an owner surface (the paid per-Space CRM board, a full-width 'none' Dashboard in
  // page-chrome.ts) that the manage console links to. Without this escape it rendered DOUBLE-wrapped:
  // the public profile hero + tab row stapled on top of the board's own DashboardTemplate, with two
  // <h1>s and a back-stack that pointed at the profile, not the console. That is the "clicking the CRM
  // section breaks" report. Escaping it here makes the board read as the standalone operator workspace
  // it already declares itself to be (and skips the profile-view telemetry below, which never belonged
  // on an operator board).
  if (activeSegment === 'manage' || activeSegment === 'settings' || activeSegment === 'crm') {
    return children
  }

  // Profile telemetry (the first signal on /spaces profiles): record a profile-VIEW into the
  // existing engagement ledger, tagged with space_id, so operators can later see how a profile
  // performs. Non-blocking side effect — `void`-ed (never awaited, never throws) and deduped per
  // request via React.cache so tab navigation within one profile doesn't double-count (analytics.ts).
  // Owner surfaces returned above, so a manage / settings visit is never miscounted as a profile view.
  void trackSpaceProfileViewOnce(space.id, viewerProfileId)

  const blueprint = blueprintForType(space.type)
  const brandName = space.brandName ?? space.name
  const typeLabel = spaceTypeLabel(space.type)

  // The brand accent override (§1 KEYSTONE): the Space's own validated `brand_accent` token wins,
  // else the blueprint's per-role default, else null (the host amber). Only validated allowlisted
  // tokens build the override — never a hex (lib/spaces/accent.ts, D4/D6).
  const accentVars = resolveAccentVars(space.brandAccent, blueprint?.defaultAccent)

  // The hero's remaining inputs are independent of each other (only `manage` derives from `caller`),
  // so resolve them in ONE round-trip instead of a serial chain (site-audit PERF-4). readTagline +
  // spaceVisibility are React.cache'd (PERF-5), so this shares generateMetadata's fetch:
  //  - caller → the owner-affordance gate below (§A.4 / Epic 1.7): owner/admin/editor → canManage,
  //    a platform janitor previewing a Space they don't manage → staffViewing (read-only). No WRITE
  //    gate changes — every owner write still re-checks canEditProfile server-side independently.
  //  - tagline → the one-line under the name (untyped read by id, ADR-246; fail-safe null).
  //  - visibility → only a networked Space emits JSON-LD (a private one is noindex; fail-safe private).
  //  - viewerFollows → the Follow button's server-resolved state (fail-safe false for an anon viewer).
  const [caller, tagline, visibility, viewerFollows] = await Promise.all([
    getCallerProfile(),
    readTagline(space.id),
    spaceVisibility(slug),
    viewerProfileId ? isFollowing(space.id, viewerProfileId) : Promise.resolve(false),
  ])
  const manage = await resolveSpaceManageAccess(space, caller?.id ?? null, caller?.webRole ?? null)
  const canSeeAsOwner = manage.canManage || manage.staffViewing
  const isNetwork = visibility !== 'private'

  const base = `/spaces/${space.slug}`
  // The owner-affordance target (ADR-441 EM1-3): the `practitioner` and `organization` types are
  // served by the unified /manage console, so point their Manage button straight at it. The legacy
  // /settings hub redirects those two types to /manage anyway, so this just skips the bounce; every
  // other type still opens the working /settings hub.
  const manageHref =
    space.type === 'practitioner' || space.type === 'organization' ? `${base}/manage` : `${base}/settings`
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
      {/* Per-type structured data for the PUBLIC profile (Person / LocalBusiness / Organization by
          role) plus a Breadcrumb back to the directory. Network spaces only, never on a private one. */}
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
              // The crawlable breadcrumb parent is the PUBLIC /spaces page, not the in-app
              // /spaces/directory (which the back link below uses for signed-in navigation).
              { name: 'Spaces', path: '/spaces' },
              { name: brandName, path: `/spaces/${space.slug}` },
            ]),
          ]}
        />
      )}
      <DetailTemplate
        // A signed-in member returns to the in-app directory; a logged-out visitor (the public
        // crawlable view) returns to the public /spaces page, which they can actually reach.
        back={{ href: viewerProfileId ? '/spaces/directory' : '/spaces', label: 'Spaces' }}
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
                {viewerProfileId && (
                  <FollowSpaceButton
                    spaceId={space.id}
                    spaceName={brandName}
                    initialFollowing={viewerFollows}
                  />
                )}
                <Link
                  href="/codes"
                  aria-label={`Connect with ${brandName}`}
                  title="Connect"
                  className={buttonClasses('secondary', 'md', 'px-2.5')}
                >
                  <QrCode className="h-4 w-4" aria-hidden />
                </Link>
                {canSeeAsOwner && (
                  <Link href={manageHref} className={buttonClasses('secondary', 'md')}>
                    <Pencil className="h-3.5 w-3.5" aria-hidden />
                    {manage.staffViewing ? 'Owner view (staff)' : 'Edit profile'}
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
// renders without a subtitle line rather than throwing. React.cache'd (PERF-5) so generateMetadata
// and the layout body share one fetch per request.
const readTagline = cache(async (spaceId: string): Promise<string | null> => {
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
})

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
        <div key={i} className="h-hero-stat animate-pulse rounded-2xl bg-surface-elevated/60" />
      ))}
    </div>
  )
}
