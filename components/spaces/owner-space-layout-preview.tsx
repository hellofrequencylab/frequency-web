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

  const prefs = space.preferences
  const rawLayout =
    prefs && typeof prefs === 'object' && !Array.isArray(prefs)
      ? (prefs as Record<string, unknown>).profileLayout
      : null
  const saved = parseEntityLayout(rawLayout)

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
      />
    </div>
  )
}
