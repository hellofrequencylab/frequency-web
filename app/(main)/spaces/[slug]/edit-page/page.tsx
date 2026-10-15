import { notFound, redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { BlockRender } from '@/lib/page-editor/block-render'
import { getCallerProfile } from '@/lib/auth'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
import { setActiveSpace } from '@/lib/spaces/active-space'
import { resolveSpaceManageAccess } from '@/lib/spaces/entitlements'
import { config } from '@/lib/page-editor/config'
import { withVisibleBlocks } from '@/lib/page-editor/templates/space-blocks'
import { readPageDoc, hasPage, HOME_SLUG } from '@/lib/spaces/profile-pages'
import { loadSpacePageDoc } from '@/lib/spaces/page-doc'
import { readProfileData } from '@/lib/spaces/profile-data'
import { defaultPrimaryCtaLabel } from '@/lib/spaces/profile-config'
import { getSpaceContentData } from '@/lib/spaces/content-data'
import { resolveTeamPicksForDoc } from '@/lib/spaces/team-picks'
import { StaffPreviewBanner } from '@/components/spaces/staff-preview-banner'
import { SpaceLandingEditor } from '@/components/spaces/space-landing-editor'

// COMPATIBILITY ENTRY for existing Space page links. Home opens the canonical
// profile sidebar, which edits profileLayout. An explicit custom ?page= still
// edits its pageDocs document here until that schema has sidebar parity. These
// documents also feed website fallbacks, so retiring the old Home surface must
// never delete them or silently send a custom-page edit to Home.
// Resolve visibility, page identity and edit/staff-preview access BEFORE either
// redirect or render. Staff custom-page previews remain read-only.

export const dynamic = 'force-dynamic'
export const metadata: Metadata = {
  title: 'Customize page',
  robots: { index: false, follow: false },
}

export default async function SpaceEditLandingPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ page?: string }>
}) {
  const { slug } = await params
  const { page } = await searchParams
  const caller = await getCallerProfile()
  const viewerProfileId = caller?.id ?? null

  // Resolve the Space, failing closed on a missing / not-visible Space (no existence leak).
  const space = await getVisibleSpaceBySlug(slug, viewerProfileId)
  if (!space) notFound()
  setActiveSpace(space)

  // Which PAGE this editor targets: `?page=<slug>` (default Home). A page that is not in the nav
  // 404s, so the editor never opens onto a page that does not exist.
  const pageSlug = (page ?? HOME_SLUG).trim().toLowerCase() || HOME_SLUG
  if (!hasPage(space.preferences, pageSlug)) notFound()

  // GATE: only a manager (owner / admin / editor) edits; a platform janitor previews
  // read-only. notFound (not a redirect) for everyone else: we never reveal the route.
  const { canManage, staffViewing } = await resolveSpaceManageAccess(
    space,
    viewerProfileId,
    caller?.webRole,
  )
  if (!canManage && !staffViewing) notFound()

  // Home's actual profile uses the entity layout and its sidebar builder. The older
  // document editor writes pageDocs.home, which does not arrange that profile.
  // Keep the gated custom-page editor until those documents have sidebar parity.
  if (pageSlug === HOME_SLUG) redirect(`/spaces/${space.slug}?edit=page`)

  const brandName = space.brandName?.trim() || space.name
  // The doc the editor loads: this page's stored doc when present + valid, else the universal
  // default page (so a first-time operator opens onto a designed start point). Drop any block the
  // Page quick-panel hid (and strip the flag), so the full editor never shows a parked block;
  // hiding lives only in the compact Page panel.
  // Loaded through the same seam the public render uses (lib/spaces/page-doc.ts), so the operator
  // edits against the asset's CURRENT file rather than a stale cached url — and the next publish
  // writes the refreshed cache back, healing the stored document one save at a time (PROG-D2).
  const data = withVisibleBlocks(await loadSpacePageDoc(space.preferences, brandName, pageSlug))
  const customized = readPageDoc(space.preferences, pageSlug) !== null

  // STAFF PREVIEW: read-only. No editor runtime; render the resolved landing with the
  // staff banner so the read-only mode is unmistakable (every write also re-gates
  // server-side, so a staff viewer could never publish even if they reached the editor).
  // Inject the live Space content (updates/reviews/faqs) so the preview matches the public
  // landing exactly (the same metadata.space the public renderer passes).
  if (!canManage && staffViewing) {
    const spaceContent = await getSpaceContentData(space.id)
    spaceContent.teamPicks = await resolveTeamPicksForDoc(data)
    return (
      <div className="mx-auto max-w-5xl px-6 py-8">
        <StaffPreviewBanner spaceName={brandName} />
        <BlockRender config={config} data={data} metadata={{ space: spaceContent }} />
      </div>
    )
  }

  // The SAME central content the public landing injects (identity + business profile + live rows), so
  // the Puck editor renders blocks with the operator's REAL data (WYSIWYG), not the empty placeholders.
  const spaceContent = await getSpaceContentData(space.id, {
    name: brandName,
    type: space.type,
    logoUrl: space.brandLogoUrl,
    coverUrl: space.coverImageUrl,
    tagline: space.tagline,
    primaryCta: { label: defaultPrimaryCtaLabel(space.type), href: `/spaces/${space.slug}/book` },
    slug: space.slug,
    profile: readProfileData(space.preferences),
  })
  // WYSIWYG in the editor: resolve any Team-block network picks to live cards so the canvas shows the
  // linked member tiles, not just the manual fallbacks.
  spaceContent.teamPicks = await resolveTeamPicksForDoc(data)

  return (
    <SpaceLandingEditor
      slug={slug}
      title={brandName}
      data={data}
      customized={customized}
      pageSlug={pageSlug}
      spaceContent={spaceContent}
    />
  )
}
