'use server'

// VERA ON THE CANVAS'S DEMO BLOCK (PROG-E8, dark). The canvas asks this when its block is created (trigger
// 'block-created') or when the owner presses Ask Vera ('asked'). The block is fixed on the server (the Banner
// contract on a Space site, the same one the inspector draws), so the client can name neither the block nor its
// fields. Off, or not staff: null, and nothing is said or spent.

import { envFlag } from '@/lib/env/string'
import { getJanitor } from '@/lib/page-editor/guard'
import { inspectorFields } from '@/lib/builder/inspector-model'
import { veraMayCoachBlock, type BlockCoachTrigger } from '@/lib/builder/vera-coach'
import { coachNewBlock, type BlockCoaching } from '@/lib/ai/vera/block-coach'
import { loadSpaceGrounding } from '@/lib/ai/space-grounding'
import { photoHeroBlock } from '@/lib/entity-blocks/contract/photoHero'

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

export async function askVeraAboutCanvasBlock(input: { trigger: string; values: unknown; spaceId?: string }): Promise<BlockCoaching | null> {
  if (!envFlag('EDITOR_CANVAS')) return null
  const janitor = await getJanitor()
  if (!janitor) return null
  const trigger = TRIGGERS.find((t) => t === input?.trigger)
  if (!trigger) return null
  const fields = inspectorFields(photoHeroBlock, 'space-site')
  const values = cleanValues(input.values)
  if (!veraMayCoachBlock(trigger, fields, values)) return null
  const spaceId = typeof input.spaceId === 'string' && /^[0-9a-f-]{8,64}$/i.test(input.spaceId) ? input.spaceId.toLowerCase() : null
  const grounding = spaceId ? await loadSpaceGrounding(spaceId).catch(() => null) : null
  return coachNewBlock({ blockType: 'Banner', fields, values, profileId: janitor.profileId, spaceId, grounding })
}
