import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { getCallerProfile } from '@/lib/auth'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
import { resolveSpaceManageAccess, spaceCanUseFullWebsite } from '@/lib/spaces/entitlements'
import { isConsoleSpaceType } from '@/lib/spaces/types'
import {
  readProfilePages,
  hasPage,
  HOME_SLUG,
  MAX_PROFILE_PAGES,
} from '@/lib/spaces/profile-pages'
import { readCoverScrim } from '@/app/(main)/spaces/[slug]/manage/layout/preferences'
import { readProfileData } from '@/lib/spaces/profile-data'
import { readWebsitePublished } from '@/lib/spaces/website'
import { FocusTemplate } from '@/components/templates'
import { StaffPreviewBanner } from '@/components/spaces/staff-preview-banner'
import { SpacePagePanel } from '@/components/spaces/space-page-panel'

// SPACE PAGE SETTINGS (multi-page model). The "Page" quick-edit surface in the unified console: a
// compact panel that manages the operator-defined PAGES (create / rename / reorder / delete + pick the
// page you are editing), then for the SELECTED page offers cover size, theme/accent, block order +
// show/hide, and a "Full page editor" button that NAVIGATES to the standalone /edit-page route (the
// server-rendered, full-page Puck editor, so this page ships no editor code). The page being edited comes from `?page=<slug>`
// (default Home). A Server Component, gated server-side exactly like the console + mode pages: it
// resolves the Space, gates on resolveSpaceManageAccess, and notFound()s otherwise so a non-manager
// cannot tell the route exists. A staff previewer sees the panel read-only (every write re-gates in its
// server action; this render gate is UX).

export const metadata: Metadata = {
  title: 'Page',
  description: 'Manage your profile pages, cover, accent, and block order, or open the full editor.',
  robots: { index: false, follow: false },
}

export default async function SpacePageSettingsPage({
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

  const space = await getVisibleSpaceBySlug(slug, viewerProfileId)
  if (!space) notFound()

  const { canManage, staffViewing } = await resolveSpaceManageAccess(
    space,
    viewerProfileId,
    caller?.webRole,
  )
  if (!canManage && !staffViewing) notFound()
  if (!isConsoleSpaceType(space.type)) notFound()

  const brandName = space.brandName?.trim() || space.name
  const coverScrim = readCoverScrim(space.preferences)

  // The operator's ordered nav pages, and which one is being edited (`?page=`, default Home). A stale /
  // unknown slug (e.g. a just-deleted page) clamps to Home rather than erroring.
  const pages = readProfilePages(space.preferences)
  const requested = (page ?? HOME_SLUG).trim().toLowerCase()
  const activePageSlug = hasPage(space.preferences, requested) ? requested : HOME_SLUG

  return (
    <FocusTemplate
      eyebrow="Manage space"
      title="Page"
      description="Manage your profile pages, size your cover, choose your accent, and reorder or hide blocks. Open the full editor to add and edit any block."
      width="wide"
    >
      {staffViewing && !canManage && (
        <div className="mb-6">
          <StaffPreviewBanner spaceName={brandName} />
        </div>
      )}
      <SpacePagePanel
        slug={slug}
        pages={pages}
        activePageSlug={activePageSlug}
        maxPages={MAX_PROFILE_PAGES}
        coverScrim={coverScrim}
        accent={space.brandAccent ?? ''}
        businessInfo={readProfileData(space.preferences)}
        coverImageUrl={space.coverImageUrl}
        brandLogoUrl={space.brandLogoUrl}
        websitePublished={readWebsitePublished(space.preferences)}
        canManagePages={spaceCanUseFullWebsite(space)}
        readOnly={staffViewing && !canManage}
      />
    </FocusTemplate>
  )
}
