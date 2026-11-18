'use server'

// VERA ON THE CANVAS'S BLOCK (PROG-E8, dark). The canvas asks this when its block is created (trigger
// 'block-created') or when the owner presses Ask Vera ('asked'). The block is fixed on the server, so the client can
// name neither the block's type nor its fields: on the demo it is the Banner contract on a Space site; on a real
// document the client names a node id, and the server reads that node's type from the stored page, behind the same
// access rule as the draft write (an editor of the Space), and coaches the fields its contract gives the inspector.
// Off, not staff, not an editor, or a node that is not on the page: null, and nothing is said or spent.

import { envFlag } from '@/lib/env/string'
import { getJanitor } from '@/lib/page-editor/guard'
import { inspectorFields } from '@/lib/builder/inspector-model'
import { veraMayCoachBlock, type BlockCoachTrigger } from '@/lib/builder/vera-coach'
import { coachNewBlock, type BlockCoaching } from '@/lib/ai/vera/block-coach'
import { loadSpaceGrounding } from '@/lib/ai/space-grounding'
import { photoHeroBlock } from '@/lib/entity-blocks/contract/photoHero'
import { getNode } from '@/lib/entity-blocks/node-ops'
import { NODE_ID_RE } from '@/lib/entity-blocks/node-tree'
import { readCanvasDocument } from '@/lib/builder/canvas-document'
import { resolveCanvasAccess } from '@/lib/builder/canvas-document-load'
import { canvasCoachFor } from '@/lib/builder/canvas-inspector'

const TRIGGERS: readonly BlockCoachTrigger[] = ['block-created', 'asked']

/** Only short strings cross from the client; anything else is dropped. */
function cleanValues(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(raw).slice(0, 40)) {
    if (typeof value === 'string') out[key.slice(0, 40)] = value.slice(0, 400)
  }
  return out
}

/** A block on a Space's stored page, for a caller who may edit that page. Null otherwise. */
async function documentBlock(spaceId: string, nid: string) {
  if (!NODE_ID_RE.test(nid)) return null
  const { space, canSave } = await resolveCanvasAccess(spaceId)
  if (!space || !canSave) return null
  const stored = readCanvasDocument(space.preferences)
  const node = stored.layout ? getNode(stored.layout, nid) : null
  return node ? canvasCoachFor(node.type) : null
}

export async function askVeraAboutCanvasBlock(input: { trigger: string; values: unknown; spaceId?: string; nid?: string }): Promise<BlockCoaching | null> {
  if (!envFlag('EDITOR_CANVAS')) return null
  const janitor = await getJanitor()
  if (!janitor) return null
  const trigger = TRIGGERS.find((t) => t === input?.trigger)
  if (!trigger) return null
  const spaceId = typeof input.spaceId === 'string' && /^[0-9a-f-]{8,64}$/i.test(input.spaceId) ? input.spaceId.toLowerCase() : null
  const target = input.nid === undefined
    ? { blockType: 'Banner', fields: inspectorFields(photoHeroBlock, 'space-site') }
    : spaceId && typeof input.nid === 'string' ? await documentBlock(spaceId, input.nid) : null
  if (!target) return null
  const { blockType, fields } = target
  const values = cleanValues(input.values)
  if (!veraMayCoachBlock(trigger, fields, values)) return null
  const grounding = spaceId ? await loadSpaceGrounding(spaceId).catch(() => null) : null
  return coachNewBlock({ blockType, fields, values, profileId: janitor.profileId, spaceId, grounding })
}
