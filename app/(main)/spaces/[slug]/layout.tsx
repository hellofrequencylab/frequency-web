import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { cache } from 'react'
import { QrCode, Pencil, LayoutTemplate } from 'lucide-react'
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
import { blueprintForSpace } from '@/lib/spaces/templates'
import { resolveAccentVars } from '@/lib/spaces/accent'
import { getInitials, cn } from '@/lib/utils'
import { readCoverSize } from '@/app/(main)/spaces/[slug]/manage/layout/preferences'
import { spaceTypeLabel } from '@/components/spaces/space-type'
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
// A profile is NOT a new layout: it is the DETAIL template (cover + info band + tabs) composed from
// registered entity modules, typed by `spaces.type` via a blueprint (§A.1). This layout resolves
// the Space, stamps it into the request-scoped active-space context (so every entity module reads
// THIS tenant's rows), paints the Space's brand ACCENT over the whole profile subtree, and OWNS the
// ONE cohesive header for every tab (Facebook/LinkedIn business-page grammar):
//   a full-width COVER band at the top (image or the neutral brand gradient, Header or Hero size read
//   off preferences.coverSize) → a PROFILE INFO area (the logo chip, the brand name as the single <h1>,
//   the type badge, the tagline, then a FULL-WIDTH action ROW on its own line below the name: the
//   primary CTA by type + Follow + Connect + the owner tools) → the tab menu + Settings → a hairline
//   rule → the content. In the Hero size the logo + name + action row sit OVERLAID on the bottom of the
//   cover image itself (LinkedIn/FB cover-hero grammar) over a gradient that fades to the page canvas.
// The tab BODY (children) is each tab page's <PageModules>; the landing body is the Puck content grid
// (identity is layout-owned now, never a Puck block). Server Components throughout; the identity paints
// instantly. The richer live stat set lives in the body/About, not this band (a lone member count read
// as noise here).
//
// ACCENT (D4 "the accent is a guest"): the Space's validated `brand_accent` token (or the blueprint's
// per-role default) is remapped onto the `--color-primary*` family by a SCOPED inline override on the
// AccentScope wrapper (lib/spaces/accent.ts), so the CTA, active tab, and type badge carry the Space's
// color while the canvas stays neutral. Tokens only — never a hex (D6). The five roles read distinct.
//
// CHROME: the profile (/spaces/<slug> + tabs) keeps the GLOBAL community rail (lib/layout/page-chrome.ts):
// the context band is an in-body hero CARD, not a shell rail, so it reads as a normal Detail page beside
// the site's Quest rail (operator request). The owner settings sub-surfaces stay Focus (no rail).

// A small curated set of calm, warm, neutral SITE stock photos used as the cover-band
// PLACEHOLDER when a Space has not uploaded its own cover, so the header always reads as an
// intentional identity band rather than a flat gradient. Hosted build-time assets under
// public/images/site (matching the marketing blocks). A real uploaded cover always wins.
const COVER_PLACEHOLDERS = [
  '/images/site/outdoor-group.jpg',
  '/images/site/sunset.jpg',
  '/images/site/lab-lounge.jpg',
  '/images/site/nature-viewing-sunset.jpg',
  '/images/site/community-dinner.jpg',
  '/images/site/meditation-circle-outdoor.jpg',
] as const

// Deterministically pick ONE placeholder from the curated set for a Space, keyed off its id, so
// the same Space always shows the same photo and different Spaces vary (no Math.random, stable
// across renders). A simple sum-of-char-codes hash over the id is enough spread for a 6-item list.
function coverPlaceholderFor(id: string): string {
  let hash = 0
  for (let i = 0; i < id.length; i++) hash = (hash + id.charCodeAt(i)) % COVER_PLACEHOLDERS.length
  return COVER_PLACEHOLDERS[hash]
}

// The lowercase, article-prefixed role phrase for the meta description ("a practitioner",
// "an event space"). spaceTypeLabel returns a title-cased badge ("Event Space"); the description
// reads as a plain sentence, so it is lowercased and given the right article. Sentence case, no
// em/en dashes (CONTENT-VOICE §5e).
function typePhrase(type: string): string {
  const noun = spaceTypeLabel(type).toLowerCase()
  const article = /^[aeiou]/.test(noun) ? 'an' : 'a'
  return `${article} ${noun}`
}

// The action-row button GEOMETRY, matched to `buttonClasses(_, 'md')` (BASE + SIZE.md) so the on-cover
// (Hero overlay) affordances share the exact height/radius/gap of the in-flow (Header) ones. Only the
// COLOR differs: on a photo, a bordered translucent-white chip over a backdrop blur reads legibly on
// any cover (the gradient scrim guarantees the ≥4.5:1 floor), while off-cover uses the canonical
// secondary token. Tokens only — no hardcoded hex; the translucent whites are legibility scrims.
const MD_BUTTON_GEOMETRY =
  'inline-flex items-center justify-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold transition-colors'
const onInkSecondaryClasses = cn(
  MD_BUTTON_GEOMETRY,
  'border border-white/40 bg-white/10 text-on-ink backdrop-blur-sm hover:bg-white/20',
)

// The owner tools' button tokens: the quietest affordance in the action row. Off-cover it is the
// canonical bordered secondary; on-cover (Hero) it is the translucent on-ink chip, so it still reads
// as the quietest of the on-photo row while sharing the row's height + radius.
function ownerToolClasses(onInk: boolean): string {
  return onInk ? onInkSecondaryClasses : buttonClasses('secondary', 'md')
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
  // `edit-page` is the full-viewport Puck LANDING editor (ADR-476/472): it owns its own header (the
  // Puck chrome) and must not be wrapped in the profile hero + tab row, exactly like the other owner
  // surfaces. Its rail is dropped in page-chrome.ts.
  if (
    activeSegment === 'manage' ||
    activeSegment === 'settings' ||
    activeSegment === 'crm' ||
    activeSegment === 'edit-page'
  ) {
    return children
  }

  // Profile telemetry (the first signal on /spaces profiles): record a profile-VIEW into the
  // existing engagement ledger, tagged with space_id, so operators can later see how a profile
  // performs. Non-blocking side effect — `void`-ed (never awaited, never throws) and deduped per
  // request via React.cache so tab navigation within one profile doesn't double-count (analytics.ts).
  // Owner surfaces returned above, so a manage / settings visit is never miscounted as a profile view.
  void trackSpaceProfileViewOnce(space.id, viewerProfileId)

  // The EFFECTIVE blueprint is the per-type composition RE-FRAMED by the resolved public-page TEMPLATE
  // (Book / Schedule / Storefront / Hub, ADR-472): the template forwards the primary CTA, the hero stat
  // set, the tab order, and the About body lead block, while the per-type blueprint still supplies the
  // tab labels + module sets + the default accent. So two Spaces of the same type but different Mode read
  // as visibly different sites, and an operator template override (preferences.template) wins on top. The
  // resolver is pure + total; a null blueprint (unknown type) still fails closed to About-only below.
  const baseBlueprint = blueprintForType(space.type)
  const templateInput = {
    type: space.type,
    variant: space.modeVariant,
    plan: space.plan,
    preferences: space.preferences,
  }
  const blueprint = blueprintForSpace(baseBlueprint, templateInput)
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

  // The operator's chosen cover size (Header vs Hero), read off preferences. Default-safe to the
  // compact Header band for an un-migrated Space (preferences.ts).
  const coverSize = readCoverSize(space.preferences)

  // The owner tools (Edit profile · Customize page): the quietest affordances in the action row for a
  // manager, never shown to a visitor. Same `md` height/radius as every other action so the row reads
  // as one aligned band; the `secondary` (bordered) variant keeps them visually quieter than the solid
  // primary CTA. `onInk` renders the on-cover variant used by the Hero overlay for legibility.
  const ownerTools = (onInk = false) =>
    canSeeAsOwner ? (
      <>
        <Link href={manageHref} className={ownerToolClasses(onInk)}>
          <Pencil className="h-4 w-4" aria-hidden />
          {manage.staffViewing ? 'Owner view (staff)' : 'Edit profile'}
        </Link>
        <Link href={`${base}/edit-page`} className={ownerToolClasses(onInk)}>
          <LayoutTemplate className="h-4 w-4" aria-hidden />
          Customize page
        </Link>
      </>
    ) : null

  // The identity ACTION ROW: one aligned, wrapping row of same-height (`md`) buttons — the emphasized
  // primary CTA (kept visually dominant, solid accent), then Follow + Connect (secondary/bordered),
  // then the owner tools (quietest). It sits on its OWN full-width line BELOW the name lockup at every
  // breakpoint, so the title never shares a line with the buttons. `onInk` swaps the secondary/owner
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
  // A full content-column cover at the very top. A real uploaded cover always wins; when a Space has
  // NONE, we fall back to a calm SITE stock photo (deterministically chosen per space id so different
  // Spaces vary but each is stable), so the header always reads as an intentional identity band rather
  // than a flat gradient. The image is a next/image with `fill` + `preload` (not a plain <img>): on a
  // soft client-side navigation a bare <img> inside an overflow-hidden box could paint BLANK until a
  // hard refresh (a paint/layout race); the optimizer element resolves with the RSC payload and preloads
  // for LCP, so the cover paints on the FIRST navigation. No back link here: the shell
  // breadcrumb (Spaces › <name>) is the single wayfinding affordance.
  const coverSrc = space.coverImageUrl || coverPlaceholderFor(space.id)
  const isHero = coverSize === 'hero'

  // Header: a compact band, image only. The logo chip + name + action row sit in normal flow BELOW it
  // (via infoBand). Hero: a taller band that also CARRIES the identity overlaid on its bottom edge over
  // a gradient that fades to the page canvas. Both bleed the cover to the content column and round it.
  const coverH = isHero ? 'h-72 sm:h-[22rem]' : 'h-40 sm:h-52'
  const coverImage = (
    <Image
      src={coverSrc}
      alt=""
      fill
      sizes="(max-width: 1024px) 100vw, 1024px"
      preload
      className="object-cover"
    />
  )

  // The name + type badge + tagline lockup. `onInk` paints it for legibility over a Hero cover photo
  // (on-ink tokens, over the canvas-fade gradient); otherwise it reads on the page surface. The <h1> is
  // the single page heading in both.
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

  // HERO cover node: the image + a gradient that fades from the PAGE CANVAS token at the bottom up to
  // transparent (so the photo blends seamlessly into the page and the overlaid text stays legible on
  // any photo, WCAG-safe), with the logo chip + name lockup + action row anchored to the bottom.
  const heroCoverNode = (
    <div className={cn('relative w-full overflow-hidden rounded-xl bg-surface-elevated', coverH)}>
      {coverImage}
      {/* Canvas-fade: opaque canvas at the floor → transparent at ~two-thirds up. Uses the --color-canvas
          token (the `from-canvas` / `via-canvas` utilities) so the fade matches whatever theme the page
          renders in, never a hardcoded black. This seats the overlaid identity legibly on any photo. */}
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
  // HEADER size: FB-business-page grammar — the logo chip overlaps the cover bottom, then the name +
  // type badge + tagline, then a FULL-WIDTH action ROW on its OWN line below the lockup (never sharing a
  // line with the name). The menu (tabs) + Settings sit under this area (rendered by DetailTemplate),
  // closed by the hairline rule. HERO size: the identity is already overlaid on the cover, so the band
  // is empty (a fragment, so DetailTemplate skips its default title lockup and renders straight to the
  // tabs). The stat row is gone from the band entirely (a lone member count read as noise); the richer
  // counts live in the body/About.
  const infoBand = isHero ? (
    <></>
  ) : (
    <div>
      <div className="flex items-end gap-4">
        {/* The logo chip overlaps the cover bottom (FB business page). */}
        <div className="-mt-12 shrink-0 sm:-mt-14">
          <BrandAnchor name={brandName} logoUrl={space.brandLogoUrl} />
        </div>
        <div className="min-w-0 pb-1">{nameLockup(false)}</div>
      </div>
      {/* The action row on its OWN full-width line below the name lockup, at every breakpoint. */}
      <div className="mt-5">{identityActions(false)}</div>
    </div>
  )

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
              // /spaces/directory (which the back link above uses for signed-in navigation).
              { name: 'Spaces', path: '/spaces' },
              { name: brandName, path: `/spaces/${space.slug}` },
            ]),
          ]}
        />
      )}
      <DetailTemplate
        // The cover is the custom `hero`; the profile info lockup is the `band` (owning the single
        // <h1>) for the Header size, or empty for the Hero size (identity overlaid on the cover). The
        // tab row + Settings follow below.
        title={brandName}
        hero={coverNode}
        band={infoBand}
        tabs={tabs}
      >
        {children}
      </DetailTemplate>
    </AccentScope>
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

// The brand LOGO chip in the profile info lockup: the operator's logo (a plain <img>, an arbitrary
// operator URL like BrandMark), or a neutral initials chip. Decorative (alt=""): the <h1> carries the
// name. Bordered in the surface color so it reads as a chip overlapping the cover (FB business page).
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
