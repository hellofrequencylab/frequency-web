import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { BlockRender } from '@/lib/page-editor/block-render'
import type { Data } from '@/lib/page-editor/types'
import { config } from '@/lib/page-editor/config'
import { getVisibleSpaceBySlug, getSpaceVisibility } from '@/lib/spaces/store'
import type { Space } from '@/lib/spaces/types'
import { setActiveSpace } from '@/lib/spaces/active-space'
import { withVisibleBlocks } from '@/lib/page-editor/templates/space-blocks'
import { resolveSpacePageDoc, HOME_SLUG } from '@/lib/spaces/profile-pages'
import { readProfileData } from '@/lib/spaces/profile-data'
import { readWebsitePublished } from '@/lib/spaces/website'
import { filterDocForSurface } from '@/lib/spaces/surface-visibility'
import { defaultPrimaryCtaLabel, defaultAccentForType } from '@/lib/spaces/profile-config'
import { getSpaceContentData } from '@/lib/spaces/content-data'
import { resolveTeamPicksForDoc } from '@/lib/spaces/team-picks'
import { resolveAccentVars } from '@/lib/spaces/accent'
import { AccentScope } from '@/components/spaces/accent-scope'
import { SpaceWebsiteShell } from '@/components/spaces/space-website-shell'
import { JsonLd } from '@/components/json-ld'
import { spaceSchema, breadcrumbSchema } from '@/lib/jsonld'

// THE EXTERNAL SPACE WEBSITE (ADR-508 U4-B). A Space's PUBLIC micro-site at a top-level, app-shell-free
// route (outside the auth-gated (main) group), so a signed-out visitor can open a shared link. It proves
// "one data model, per-surface display": it renders the Space's EXISTING Home Puck doc through the SAME
// shared BlockRender the in-app profile uses, reading the SAME live rows (getSpaceContentData), filtered
// by the per-surface visibility model for the 'website' surface. No new editor: content is authored in
// the existing Space editors and synced here by show/hide.
//
// FAIL-CLOSED (the #1 correctness requirement): the page 404s unless BOTH the Space is `network`
// (never a Private Space) AND the operator has explicitly published the website
// (preferences.websitePublished === true). The viewer is resolved as ANONYMOUS (null), so a Private
// Space never even resolves; the explicit visibility + published re-checks are belt-and-suspenders. A
// not-published / private site 404s with NO descriptive copy and emits noindex.
export const dynamic = 'force-dynamic'

// The single fail-closed resolve, SHARED by the page and generateMetadata so both agree: returns the
// Space ONLY when it is network-visible AND its website is published, else null (the caller 404s /
// noindexes). Resolving with a null viewer means a Private Space is walled off at getVisibleSpaceBySlug
// before the explicit gate even runs.
async function resolvePublishedSite(slug: string): Promise<Space | null> {
  const space = await getVisibleSpaceBySlug(slug, null)
  if (!space) return null
  const visibility = await getSpaceVisibility(slug)
  if (visibility !== 'network') return null
  if (!readWebsitePublished(space.preferences)) return null
  return space
}

// The profile LAYOUT owns the identity header (cover + logo + name + CTA) in-app, so a stored doc must
// never render a SpaceIdentityHeader here or it would duplicate the shell. Strip it from the top-level
// content AND from any SpaceLayout main / side slot. Replicated locally (a tiny pure helper) rather than
// imported from the server-adjacent space-landing so this public route stays dependency-light. PURE +
// tolerant: unknown shapes pass through untouched.
function stripIdentityHeader(data: Data): Data {
  const isIdentity = (b: unknown): boolean =>
    typeof (b as { type?: unknown })?.type === 'string' && (b as { type: string }).type === 'SpaceIdentityHeader'
  const cleanSlot = (arr: unknown): unknown =>
    Array.isArray(arr) ? arr.filter((b) => !isIdentity(b)) : arr
  if (!Array.isArray(data.content)) return { ...data }
  const content = data.content
    .filter((b) => !isIdentity(b))
    .map((b) => {
      if (b.type !== 'SpaceLayout') return b
      const props = b.props as Record<string, unknown>
      return { ...b, props: { ...props, main: cleanSlot(props.main), side: cleanSlot(props.side) } }
    })
  return { ...data, content }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const space = await resolvePublishedSite(slug)
  // Fail-closed SEO: a private / unpublished site is noindex (and 404s in the page render).
  if (!space) return { title: 'Site', robots: { index: false } }

  const brandName = space.brandName?.trim() || space.name
  const description = space.tagline?.trim() || `${brandName} on Frequency`
  const path = `/sites/${space.slug}`
  const ogImage = space.coverImageUrl || space.brandLogoUrl
  return {
    title: brandName,
    description,
    alternates: { canonical: path },
    openGraph: {
      type: 'website',
      url: path,
      title: brandName,
      description,
      images: ogImage ? [ogImage] : undefined,
    },
  }
}

export default async function SpaceWebsiteRoute({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const space = await resolvePublishedSite(slug)
  if (!space) notFound()

  // Stamp the active Space so any dynamic block reads THIS tenant's rows (mirrors SpaceLanding).
  setActiveSpace(space)

  const brandName = space.brandName?.trim() || space.name

  // The single primary CTA routes to the reserved /book action page (the live transactional surface).
  const primaryCta = {
    label: defaultPrimaryCtaLabel(space.type),
    href: `/spaces/${space.slug}/book`,
  }

  // BUILD THE DOC (one data model, filtered for the website surface): the stored-or-default Home doc,
  // with the quick-panel hidden blocks stripped, then the per-surface hidden TYPES removed for 'website',
  // then the legacy identity header stripped (the shell owns identity).
  const doc = stripIdentityHeader(
    filterDocForSurface(
      withVisibleBlocks(resolveSpacePageDoc(space.preferences, brandName, HOME_SLUG)),
      'website',
      space.preferences,
    ),
  )

  // The SAME live rows the in-app profile reads (getSpaceContentData), so the external site shows real
  // content from the one database. FAIL-SAFE: any miss yields empty, so a brand-new Space renders quietly.
  const spaceContent = await getSpaceContentData(space.id, {
    name: brandName,
    type: space.type,
    logoUrl: space.brandLogoUrl,
    coverUrl: space.coverImageUrl,
    tagline: space.tagline,
    primaryCta,
    slug: space.slug,
    profile: readProfileData(space.preferences),
  })
  // Pre-resolve any Team-block network member picks to live cards, so each card links to
  // `/people/<handle>` (mirrors SpaceLanding). FAIL-SAFE: undefined when the doc picks no members.
  spaceContent.teamPicks = await resolveTeamPicksForDoc(doc)

  // Paint the Space's brand accent (white-label), mirroring the (profile) layout: its own brand_accent
  // wins, else the per-type default; tokens only, never a hex.
  const accentVars = resolveAccentVars(space.brandAccent, defaultAccentForType(space.type))
  const path = `/sites/${space.slug}`

  return (
    <AccentScope vars={accentVars}>
      {/* Structured data (network + published only — a private / unpublished site never reaches here). */}
      <JsonLd
        data={[
          spaceSchema({
            slug: space.slug,
            type: space.type,
            name: brandName,
            tagline: space.tagline,
            logoUrl: space.brandLogoUrl,
          }),
          breadcrumbSchema([{ name: brandName, path }]),
        ]}
      />
      <SpaceWebsiteShell brandName={brandName} type={space.type} logoUrl={space.brandLogoUrl} slug={space.slug}>
        <BlockRender config={config} data={doc} metadata={{ space: spaceContent }} />
      </SpaceWebsiteShell>
    </AccentScope>
  )
}
