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
import type { NodeLayout } from '@/lib/entity-blocks/node-tree'
import { canvasLayers, canvasNodes, canvasStoredNode, readCanvasDocument, type CanvasDocumentView } from './canvas-document'
import { canvasBlockTitle, canvasInspectorFor } from './canvas-inspector'
import { canvasInserterView } from './canvas-presets'
import { canvasLiveBlockIds } from './canvas-live-blocks'
import { canvasTree } from './canvas-tree'

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
    // Only an editor sees the live sections it may add; a read-only viewer adds nothing, so skip the data check.
    ...canvasDocumentParts(document.layout, canSave ? await canvasLiveBlockIds(space) : []),
  }
}

/** Everything about a document that changes when its structure does: the layer list, the same blocks as a tree,
 *  each block with its controls, and what can be added. The route reads it once; a move or an insert hands the
 *  tab a fresh one (PROG-E6B), so the tab never rebuilds a block's controls itself. */
export function canvasDocumentParts(layout: NodeLayout, liveIds: readonly string[] = []): Required<Pick<CanvasDocumentView, 'layers' | 'tree' | 'nodes' | 'inserter'>> {
  const layers = canvasLayers(layout, canvasBlockTitle)
  return {
    layers,
    tree: canvasTree(layout, layers),
    nodes: canvasNodes(layout).map((node) => ({ nid: node.nid, ...canvasInspectorFor(node.type), node: canvasStoredNode(node) })),
    inserter: canvasInserterView(layout, liveIds),
  }
}
