// WHICH FIELDS THE CANVAS INSPECTOR EDITS ON A NODE (PROG-E5B). Server side: it reads the block contracts
// (defineBlock, the E1 registry of adopted blocks), which never ship to the client. A Space page document is the
// `space-profile` surface, so a node's controls are that surface's fields from the node's own contract. The route
// uses this to draw the inspector and the save action uses the same answer to decide which keys a client may
// write, so the two cannot disagree. A type with no adopted contract gets no controls and no writable keys.

import { ADOPTED_BLOCKS } from '@/lib/entity-blocks/contract'
import { entityBlockById } from '@/lib/entity-blocks/registry'
import { inspectorFieldViews, withRichText, type InspectorFieldView } from './inspector-fields'

const SURFACE = 'space-profile'

interface CanvasInspectorSpec {
  /** The block's name in the catalog, the inspector's heading. */
  title: string
  fields: InspectorFieldView[]
  /** How many of the surface's fields other editors own (lists, images, cards, pickers). */
  elsewhere: number
}

export function canvasBlockTitle(type: string): string {
  return entityBlockById(type)?.label ?? 'Block'
}

export function canvasInspectorFor(type: string): CanvasInspectorSpec {
  const block = ADOPTED_BLOCKS.find((candidate) => candidate.type === type)
  const title = canvasBlockTitle(type)
  if (!block) return { title, fields: [], elsewhere: 0 }
  const { fields, elsewhere } = inspectorFieldViews(block, SURFACE)
  // A content block stores its long text as inline markup on every save (sanitizeBlockContent), so the inspector
  // reads those fields as rich text.
  return { title, fields: entityBlockById(type)?.category === 'content' ? withRichText(fields) : fields, elsewhere }
}
