// VERA'S QUESTIONS FOR A NEW BLOCK, THE MODEL HALF (PROG-E8, dark behind EDITOR_CANVAS). One forced tool call with
// the tool minted from the block's own word fields (lib/builder/vera-coach.ts coachTool): the model can only pick a
// field and a reviewed question id, so what the owner reads is the catalog's wording, tied to a real field. She
// never writes or rewrites copy (ADR-1939 §4).
//
// FAIL CLOSED, TWO WAYS. Switch off: null, nothing is said and nothing is spent. Switch on but AI off, over the
// daily cap, rate limited, a thrown call or a reply that does not parse: the fixed fallback questions, with no
// model words in them. It never throws. The prompt goes through withVoice (lib/ai/voice.ts) like every AI path.

import { envFlag } from '@/lib/env/string'
import { completeRaw } from '@/lib/ai/complete'
import { aiEnabled } from '@/lib/ai/client'
import { featureOverBudget } from '@/lib/ai/usage'
import { aiRateLimited } from '@/lib/ai/rate-limit'
import { withVoice } from '@/lib/ai/voice'
import { COACHING_SELECTION_RULES } from '@/lib/ai/coaching-question-catalog'
import { coachTool, coachableFields, fallbackBlockCoaching, parseBlockCoaching, type BlockQuestion, type CoachField } from '@/lib/builder/vera-coach'

/** The budget and ledger key. Quoted, not coined: it is the key reseedBlockCopy's per-section coaching already
 *  spends under, and this is the same work on the same sections. */
const FEATURE = 'seed-compose'

const SYSTEM = withVoice(
  'You are Vera, coaching a Space owner who just added a block to a page. Ask up to three questions that help the owner decide what to write in that block, each about one of its fields. Prefer the empty fields. You never write, suggest or rewrite their words. Use the coach_block tool.' +
    COACHING_SELECTION_RULES,
)

export interface BlockCoachInput {
  blockType: string
  fields: readonly CoachField[]
  /** The block's current values. Untrusted owner text: only which word fields are empty, and a capped excerpt. */
  values: Readonly<Record<string, unknown>>
  profileId?: string | null
  spaceId?: string | null
  /** Per-Space material (lib/ai/space-grounding.ts), already public. Untrusted; it only steers which question. */
  grounding?: { about: string | null; offerings: readonly string[] } | null
}

export interface BlockCoaching { questions: BlockQuestion[]; source: 'vera' | 'fallback' }

/** The user turn: facts about the block, never an instruction. Capped so a long paste cannot crowd the prompt. */
export function blockCoachContext(input: BlockCoachInput): string {
  const fields = coachableFields(input.fields).map((field) => {
    const value = input.values[field.key]
    const text = typeof value === 'string' ? value.trim().slice(0, 160) : ''
    return { key: field.key, label: field.label, empty: text.length === 0, ...(text ? { current: text } : {}) }
  })
  const grounding = input.grounding
    ? { about: (input.grounding.about ?? '').slice(0, 400), offerings: input.grounding.offerings.slice(0, 8) }
    : undefined
  return JSON.stringify({ block: input.blockType, fields, ...(grounding ? { space: grounding } : {}) }).slice(0, 2400)
}

export async function coachNewBlock(input: BlockCoachInput): Promise<BlockCoaching | null> {
  if (!envFlag('EDITOR_CANVAS')) return null
  const tool = coachTool(input.blockType, input.fields)
  if (!tool) return null
  const fallback: BlockCoaching = { questions: fallbackBlockCoaching(input.fields), source: 'fallback' }
  try {
    if (!aiEnabled()) return fallback
    if ((await featureOverBudget(FEATURE, input.spaceId)) || (await aiRateLimited(FEATURE, input.profileId))) return fallback
    const result = await completeRaw({
      accounting: { feature: FEATURE, profileId: input.profileId ?? null, spaceId: input.spaceId ?? null },
      tier: 'haiku',
      maxTokens: 300,
      system: SYSTEM,
      messages: [{ role: 'user', content: blockCoachContext(input) }],
      tools: [tool],
      toolChoice: { type: 'tool', name: tool.name },
    })
    const call = result.content.find((block) => block.type === 'tool_use' && block.name === tool.name)
    const questions = call && call.type === 'tool_use' ? parseBlockCoaching(call.input, input.fields) : null
    return questions && questions.length > 0 ? { questions, source: 'vera' } : fallback
  } catch {
    return fallback
  }
}
