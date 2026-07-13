import { getCallerProfile } from '@/lib/auth'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
import { resolveSpaceManageAccess } from '@/lib/spaces/entitlements'
import { parseEntityLayout, resolveRows } from '@/lib/entity-blocks/layout'
import { SpaceCanvasEditorMount } from './space-canvas-editor-mount'

// THE SERVER SECTION that gates + seeds the on-canvas WYSIWYG Space editor. Mirrors OwnerSpaceLayoutPreview's
// read: it resolves the Space, gates on resolveSpaceManageAccess (a non-manager gets nothing, the fail-safe),
// reads the persisted layout off spaces.preferences.profileLayout, resolves it to the freeform rows for the
// space kind, and hands the rows + hidden + authored content + style to the client mount to seed the shared
// store. Additive + reversible: it reads the SAME persisted blob the rail arranger writes, so both editors
// stay in lockstep and nothing about persistence changes.

export async function SpaceCanvasEditorSection({ slug }: { slug: string }) {
  const caller = await getCallerProfile()
  const space = await getVisibleSpaceBySlug(slug, caller?.id ?? null)
  if (!space) return null

  const { canManage, staffViewing } = await resolveSpaceManageAccess(
    space,
    caller?.id ?? null,
    caller?.webRole ?? null,
  )
  // A staff previewer sees the canvas but every write re-gates in its own action (owner-gated by slug); this
  // render gate is UX. A non-manager, non-staff viewer gets nothing.
  if (!canManage && !staffViewing) return null

  const prefs = space.preferences
  const rawLayout =
    prefs && typeof prefs === 'object' && !Array.isArray(prefs)
      ? (prefs as Record<string, unknown>).profileLayout
      : null
  const saved = parseEntityLayout(rawLayout)

  const rows = resolveRows(saved, 'space')

  return (
    <SpaceCanvasEditorMount
      slug={slug}
      rows={rows}
      hidden={saved?.hidden ?? []}
      content={saved?.content ?? {}}
      style={saved?.style ?? {}}
    />
  )
}
