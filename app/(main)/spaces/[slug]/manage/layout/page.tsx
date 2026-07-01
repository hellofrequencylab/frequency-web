import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { getCallerProfile } from '@/lib/auth'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
import { resolveSpaceManageAccess } from '@/lib/spaces/entitlements'
import { isConsoleSpaceType } from '@/lib/spaces/types'
import {
  resolveMode,
  listVariantsForType,
  modeHasFocusChoice,
} from '@/lib/spaces/modes'
import { readBlockRows, withVisibleBlocks } from '@/lib/page-editor/templates/space-blocks'
import {
  readProfilePages,
  resolveSpacePageDoc,
  readPageDoc,
  hasPage,
  HOME_SLUG,
  MAX_PROFILE_PAGES,
} from '@/lib/spaces/profile-pages'
import { readCoverSize, readCoverScrim } from '@/app/(main)/spaces/[slug]/manage/layout/preferences'
import { FocusTemplate } from '@/components/templates'
import { StaffPreviewBanner } from '@/components/spaces/staff-preview-banner'
import {
  SpacePagePanel,
  type FocusChoiceLike,
} from '@/components/spaces/space-page-panel'

// SPACE PAGE SETTINGS (multi-page model). The "Page" quick-edit surface in the unified console: a
// compact panel that manages the operator-defined PAGES (create / rename / reorder / delete + pick the
// page you are editing), then for the SELECTED page offers cover size, theme/accent, block order +
// show/hide, and a "Full page editor" button that opens the COMPLETE Puck editor as a fullscreen overlay
// (lazy-loaded, so this page ships no editor code). The page being edited comes from `?page=<slug>`
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
  const coverSize = readCoverSize(space.preferences)
  const coverScrim = readCoverScrim(space.preferences)

  // The operator's ordered nav pages, and which one is being edited (`?page=`, default Home). A stale /
  // unknown slug (e.g. a just-deleted page) clamps to Home rather than erroring.
  const pages = readProfilePages(space.preferences)
  const requested = (page ?? HOME_SLUG).trim().toLowerCase()
  const activePageSlug = hasPage(space.preferences, requested) ? requested : HOME_SLUG

  // The ACTIVE page's current doc (stored-or-default). The Blocks list reads its TOP-LEVEL blocks WITH
  // the hidden flag intact (so the panel shows a hidden block as toggle-able); the Full page editor opens
  // on the same doc with hidden blocks stripped (hiding lives only in the compact panel).
  const currentDoc = resolveSpacePageDoc(space.preferences, brandName, activePageSlug)
  const blocks = readBlockRows(currentDoc)
  const editorData = withVisibleBlocks(currentDoc)
  const customized = readPageDoc(space.preferences, activePageSlug) !== null

  // The Focus echo: reuse the mode page's model (the type's variants, default first). Only when the Mode
  // has more than one Focus; otherwise omit the section.
  const mode = resolveMode(space.type, space.modeVariant)
  const focusChoices: FocusChoiceLike[] =
    mode && modeHasFocusChoice(space.type)
      ? listVariantsForType(space.type).map((m) => ({
          variant: m.variant,
          label: m.focusLabel,
          tagline: m.tagline,
          active: m.variant === mode.variant,
        }))
      : []

  return (
    <FocusTemplate
      eyebrow="Manage space"
      title="Page"
      description="Manage your profile pages, size your cover, choose your accent, and reorder or hide blocks. Open the full editor to add and edit any block."
      back={{ href: `/spaces/${slug}/manage`, label: brandName }}
      width="wide"
    >
      {staffViewing && !canManage && (
        <div className="mb-6">
          <StaffPreviewBanner spaceName={brandName} />
        </div>
      )}
      <SpacePagePanel
        slug={slug}
        brandName={brandName}
        pages={pages}
        activePageSlug={activePageSlug}
        maxPages={MAX_PROFILE_PAGES}
        coverSize={coverSize}
        coverScrim={coverScrim}
        accent={space.brandAccent ?? ''}
        blocks={blocks}
        editorData={editorData}
        customized={customized}
        focus={focusChoices.length > 0 ? { choices: focusChoices } : null}
        readOnly={staffViewing && !canManage}
      />
    </FocusTemplate>
  )
}
