import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { Render } from '@measured/puck/rsc'
import { getCallerProfile } from '@/lib/auth'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
import { setActiveSpace } from '@/lib/spaces/active-space'
import { resolveSpaceManageAccess } from '@/lib/spaces/entitlements'
import { config } from '@/lib/page-editor/config'
import { withVisibleBlocks } from '@/lib/page-editor/templates/space-blocks'
import { resolveSpacePageDoc, readPageDoc, hasPage, HOME_SLUG } from '@/lib/spaces/profile-pages'
import { readProfileData } from '@/lib/spaces/profile-data'
import { defaultPrimaryCtaLabel } from '@/lib/spaces/profile-config'
import { getSpaceContentData } from '@/lib/spaces/content-data'
import { StaffPreviewBanner } from '@/components/spaces/staff-preview-banner'
import { SpaceLandingEditor } from '@/components/spaces/space-landing-editor'

// THE SPACE PAGE EDITOR ROUTE (multi-page model). An owner / admin / editor edits ONE profile
// page through Puck here; the page is chosen with `?page=<slug>` (default Home). The published
// doc is stored to spaces.preferences.pageDocs[pageSlug] and the matching public route renders
// it. A platform janitor previewing a Space they do not manage gets a READ-ONLY preview (no
// editor runtime, no write affordances); everyone else 404s so the route never leaks. A `?page`
// that is not a real page 404s too, so the editor never opens onto a page that does not exist.
//
// CHROME: this is an IN-PAGE editor surface with its own Puck header, so the profile
// layout escapes its hero + tab chrome for the `edit-page` segment. It is NOT a
// full-viewport takeover: it keeps the GLOBAL community right rail like the rest of the
// app (page-chrome.ts), and the Puck side panels are shrunk (puck-theme.css) so the canvas
// still breathes beside the rail. The editor runtime ships ONLY here; the public landing
// renders <Render> with no editor code.

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

  const brandName = space.brandName?.trim() || space.name
  // The doc the editor loads: this page's stored doc when present + valid, else the universal
  // default page (so a first-time operator opens onto a designed start point). Drop any block the
  // Page quick-panel hid (and strip the flag), so the full editor never shows a parked block;
  // hiding lives only in the compact Page panel.
  const data = withVisibleBlocks(resolveSpacePageDoc(space.preferences, brandName, pageSlug))
  const customized = readPageDoc(space.preferences, pageSlug) !== null

  // STAFF PREVIEW: read-only. No editor runtime; render the resolved landing with the
  // staff banner so the read-only mode is unmistakable (every write also re-gates
  // server-side, so a staff viewer could never publish even if they reached the editor).
  // Inject the live Space content (updates/reviews/faqs) so the preview matches the public
  // landing exactly (the same metadata.space the public renderer passes).
  if (!canManage && staffViewing) {
    const spaceContent = await getSpaceContentData(space.id)
    return (
      <div className="mx-auto max-w-5xl px-6 py-8">
        <StaffPreviewBanner spaceName={brandName} />
        <Render config={config} data={data} metadata={{ space: spaceContent }} />
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
