import { getCallerProfile } from '@/lib/auth'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
import { resolveSpaceManageAccess } from '@/lib/spaces/entitlements'
import { getSpaceContentData } from '@/lib/spaces/content-data'
import { defaultPrimaryCtaLabel } from '@/lib/spaces/profile-config'
import { resolveSpaceAuthoredContent } from '@/lib/spaces/authored-content'
import { withEffectiveDataContent } from '@/lib/spaces/effective-block-content'
import { toProfileContext } from '@/lib/spaces/profile-modules'
import { parseEntityLayout, resolveRows } from '@/lib/entity-blocks/layout'
import { renderSpaceBlockNodes } from '@/components/widgets/space-profile/space-profile-modules'
import { LiveProfileGrid } from '@/components/entity-blocks/live-profile-grid'
import { uploadSpaceBlockImage } from '@/app/(main)/spaces/[slug]/manage/layout/actions'

// THE OWNER'S LIVE SPACE PAGE PREVIEW (ADR-516 Phase D — the space mirror of OwnerProfileLayoutPreview).
// On a Space profile ROOT, for a viewer who can manage it, this renders the space's entity-grid layout
// through the LiveProfileGrid, seeded from the persisted rows. Every candidate space block is rendered
// ONCE here, server-side, into a keyed node map; the client grid arranges those nodes by the shared
// space-layout store, so the in-rail Space builder's edits repaint this region INSTANTLY (no round-trip)
// and, on the next visit, the debounced save has reconciled the server truth.
//
// This is the WYSIWYG surface the builder edits (the same-route slide-over sits over it). FAIL-SAFE: a
// non-manager gets nothing here (the visitor render stays the plain SpaceProfileModules), and with no
// space-layout store mounted the grid falls straight back to the persisted server layout.

export async function OwnerSpaceLayoutPreview({ slug }: { slug: string }) {
  const caller = await getCallerProfile()
  const space = await getVisibleSpaceBySlug(slug, caller?.id ?? null)
  if (!space) return null

  const { canManage, staffViewing } = await resolveSpaceManageAccess(
    space,
    caller?.id ?? null,
    caller?.webRole ?? null,
  )
  if (!canManage && !staffViewing) return null

  const context = toProfileContext(space)

  // The SAME identity/profile inputs the live render feeds getSpaceContentData, so the preview shows the
  // operator's real content (not editor placeholders). One request-cached pass, no N+1.
  const data = await getSpaceContentData(context.id, {
    name: context.brandName,
    type: context.type,
    logoUrl: context.logoUrl,
    coverUrl: context.coverUrl,
    tagline: context.tagline,
    primaryCta: { label: defaultPrimaryCtaLabel(context.type), href: `/spaces/${context.slug}/book` },
    slug: context.slug,
    profile: context.profile,
  })
  const authored = resolveSpaceAuthoredContent(context.preferences, context.brandName)

  // DRAFT / PUBLISH SPLIT: the owner's live-page EDITOR seeds from the DRAFT node when one exists, else the
  // PUBLISHED node (`profileLayoutDraft ?? profileLayout`) — so the owner resumes an in-progress draft while
  // editing, and autosave writes only the draft. The PUBLIC visitor render (the non-owner branch of
  // (profile)/page.tsx) still reads `profileLayout`, so what the network sees does not change until publish.
  const prefs = space.preferences
  const prefsObj =
    prefs && typeof prefs === 'object' && !Array.isArray(prefs) ? (prefs as Record<string, unknown>) : null
  const rawLayout = prefsObj ? (prefsObj.profileLayoutDraft ?? prefsObj.profileLayout) : null
  const saved = parseEntityLayout(rawLayout)

  // The draft/published VISIBILITY flag (preferences.profilePublished) seeds the publish bar's "Visible on
  // network" toggle. Defaults TRUE when absent, so a Space that predates the flag is never shown as hidden.
  const profilePublished = !prefsObj || prefsObj.profilePublished !== false

  const nodes = renderSpaceBlockNodes(context, data, authored, saved)
  const rows = resolveRows(saved, 'space')
  const hidden = saved?.hidden ?? []

  // BUG FIX (empty editor fields): seed the shared store with the EFFECTIVE data-block content, not the raw
  // authored bag. The About / Story editors bind to this bag, so pre-filling each block's eyebrow / title /
  // body from the same central data the live render falls back to (data.aboutShort / data.profile.about, plus
  // the block's default header) makes every editor open showing the section's CURRENT content. This changes
  // only what the FIELDS show: the live DATA-block render reads its server node, and seeding schedules no
  // save, so nothing is written until the operator actually edits (effective-block-content.ts).
  const seedContent = withEffectiveDataContent(saved?.content, data)

  // The on-page photo popup uploads through the SAME owner-gated, service-role path the /manage/layout rail
  // editor uses (uploadSpaceBlockImage -> the public event-media bucket under a space-scoped path), so the
  // popup can UPLOAD a file, not only paste a URL. Wrapped as an inline server action bound to THIS space's
  // slug so it passes cleanly from this Server Component to the client grid as a prop; the action re-gates
  // canEditProfile server-side, so a non-owner can never reach it. Only mounted here (a viewer who can
  // manage), so the visitor render never carries it.
  async function uploadImage(file: File): Promise<{ url: string } | { error: string }> {
    'use server'
    const fd = new FormData()
    fd.append('file', file)
    return uploadSpaceBlockImage(context.slug, fd)
  }

  // The page is the LIVE RESULT only (ADR-542 revised): no editing chrome here. The owner arranges the page
  // in the sidebar (SpacePageBuilder) and this preview repaints through the shared store.
  // NOTE: no extra right gutter here. The shell already spaces the content from the community/admin rail
  // (app-shell `lg:gap-10` + the rail column's `lg:ml-3`); an added `pr-*` here DOUBLE-counted it and left a
  // dead vertical strip between the arranged page and the rail (owner report). The owner preview now fills the
  // same width the visitor render does, so no content-less margin. `@container/profile` stays (grid queries).
  return (
    <div className="@container/profile">
      <LiveProfileGrid
        nodes={nodes}
        initialRows={rows}
        initialHidden={hidden}
        initialContent={seedContent}
        initialStyle={saved?.style ?? {}}
        spaceSlug={context.slug}
        profilePublished={profilePublished}
        uploadImage={uploadImage}
      />
    </div>
  )
}
