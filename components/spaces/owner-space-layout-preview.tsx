import { getCallerProfile } from '@/lib/auth'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
import { resolveSpaceManageAccess } from '@/lib/spaces/entitlements'
import { getSpaceContentData } from '@/lib/spaces/content-data'
import { defaultPrimaryCtaLabel } from '@/lib/spaces/profile-config'
import { resolveSpaceAuthoredContent } from '@/lib/spaces/authored-content'
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

  const nodes = renderSpaceBlockNodes(context, data, authored)
  const rows = resolveRows(saved, 'space')
  const hidden = saved?.hidden ?? []

  return (
    <div className="@container/profile">
      <LiveProfileGrid nodes={nodes} initialRows={rows} initialHidden={hidden} />
    </div>
  )
}
