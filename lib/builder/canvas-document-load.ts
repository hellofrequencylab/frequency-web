// THE CANVAS'S SERVER READ (PROG-E5B). Loads one Space page's node document for the staff canvas, behind the
// same door the Space page builder uses: resolveSpaceManageAccess. A manager of the Space (owner, admin, editor)
// may save; a staff member who is not one gets the read-only preview that helper already defines, and anyone
// else gets nothing. The canvas route has already checked the EDITOR_CANVAS switch and the staff role.
//
// It also answers the one question the client must not decide: may this viewer save. Saving needs a manager AND
// the node render path for Space pages (render_path_space_profile), because a node document written under a
// Space still on the older layout would lock its owner out of the editor they use today (LIVE-887).

import { getCallerProfile } from '@/lib/auth'
import { renderPathEnabled } from '@/lib/platform-flags'
import { resolveSpaceManageAccess } from '@/lib/spaces/entitlements'
import { getSpaceById } from '@/lib/spaces/store'
import type { Space } from '@/lib/spaces/types'
import { canvasLayers, canvasNodes, readCanvasDocument, type CanvasDocumentView } from './canvas-document'
import { canvasBlockTitle, canvasInspectorFor } from './canvas-inspector'

export const CANVAS_READ_ONLY = 'You can look at this page here, but only an editor of the Space can save it.'
export const CANVAS_OLDER_LAYOUT = 'This Space still saves the older page layout, so the canvas can show it but not save it yet.'

/** Who may do what with a Space's document on the canvas. `space` is null when the caller may not even read. */
export async function resolveCanvasAccess(spaceId: string): Promise<{ space: Space | null; canSave: boolean; notice: string | null }> {
  const none = { space: null, canSave: false, notice: null }
  const space = await getSpaceById(spaceId)
  if (!space) return none
  const caller = await getCallerProfile()
  const { canManage, staffViewing } = await resolveSpaceManageAccess(space, caller?.id ?? null, caller?.webRole)
  if (!canManage && !staffViewing) return none
  if (!canManage) return { space, canSave: false, notice: CANVAS_READ_ONLY }
  if (!(await renderPathEnabled('space_profile'))) return { space, canSave: false, notice: CANVAS_OLDER_LAYOUT }
  return { space, canSave: true, notice: null }
}

/** The document view for the canvas, or null when there is nothing to show (no access, no Space, no page). */
export async function loadCanvasDocument(spaceId: string): Promise<CanvasDocumentView | null> {
  const { space, canSave, notice } = await resolveCanvasAccess(spaceId)
  if (!space) return null
  const document = readCanvasDocument(space.preferences)
  if (!document.layout || document.source === 'none') return null
  return {
    spaceId: space.id,
    spaceName: space.name,
    source: document.source,
    canSave,
    notice,
    base: document.base,
    layers: canvasLayers(document.layout, canvasBlockTitle),
    nodes: canvasNodes(document.layout).map((node) => ({
      nid: node.nid,
      ...canvasInspectorFor(node.type),
      node: { nid: node.nid, type: node.type, ...(node.content ? { content: node.content } : {}), ...(node.responsive ? { responsive: node.responsive } : {}) },
    })),
  }
}
