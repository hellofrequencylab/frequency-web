// VERA COACHES A NEW BLOCK (PROG-E8, creation-time only; ADR-1939 §4: questions only, never copy). When a block is
// added to a page, Vera may ask the owner a few questions about the words that block needs, each tied to one of the
// block's own fields. She never writes the words.
//
// THE TOOL IS MINTED FROM THE BLOCK CONTRACT. `coachTool` builds one Anthropic tool per block from the fields the
// surface edits (the same list the inspector draws, lib/builder/inspector-model.ts inspectorFields). Every leaf of
// its schema is a closed enum: `field` is one of THIS block's word fields and `questionId` is one of the reviewed
// catalog's ids (lib/ai/coaching-question-catalog.ts). There is no string field at all, so there is no channel for a
// draft, a rewrite or an injected instruction to come back through. This is the reseedBlockCopy idea (a per-block
// schema from the block's real field keys) turned to coaching: the model can only point at a field and pick a
// reviewed question, and the words shown are the catalog's, never the model's.
//
// CREATION-TIME ONLY (ADR-976 D-4). She speaks first only when a block is created and its word fields are still
// empty; after that only when the owner asks. An edit, an idle canvas or a save never makes her speak.
//
// THE REPLY IS READ BY A SCHEMA (PROG-E8B, the ADR-1287 pattern from lib/ai/schema.ts). `parseBlockCoaching` builds a
// strict zod schema from the same two enums the tool was minted with and hands the tool_use input to
// `validateModelValue`. Anything the schema refuses rejects the whole reply, as the hand-written ladder it replaces did.
//
// PURE: no IO, no React. lib/ai/vera/block-coach.ts makes the call; the canvas draws the result.

import type Anthropic from '@anthropic-ai/sdk'
import { COACHING_QUESTION_CATALOG, COACHING_QUESTION_IDS } from '@/lib/ai/coaching-question-catalog'
import { validateModelValue, z } from '@/lib/ai/schema'
import type { FieldDef } from '@/lib/entity-blocks/block-content'

/** A field Vera may ask about: one the owner fills with their own words. */
export type CoachField = Pick<FieldDef, 'key' | 'label' | 'type'>

/** One question on the inspector: the field it is about, that field's label, the reviewed question's id and its
 *  wording. The id is what telemetry carries; the wording never leaves the page. */
export interface BlockQuestion { field: string; label: string; questionId: string; question: string }

/** At most this many questions per block, so a new block gets a nudge and not a form. */
const MAX_QUESTIONS = 3

/** The fields that carry the owner's words. URLs, toggles, enums, images and lists are not questions. */
export function coachableFields(fields: readonly CoachField[]): CoachField[] {
  return fields.filter((field) => field.type === 'text' || field.type === 'textarea')
}

/** What can make Vera speak about a block. Only creation and an explicit ask may. */
export type BlockCoachTrigger = 'block-created' | 'asked' | 'edit' | 'idle' | 'save'

const hasWords = (value: unknown) => typeof value === 'string' && value.trim().length > 0

/** Creation-time only: at creation she speaks while the word fields are still empty; afterwards only when asked. */
export function veraMayCoachBlock(trigger: BlockCoachTrigger, fields: readonly CoachField[], values: Readonly<Record<string, unknown>>): boolean {
  if (trigger === 'asked') return coachableFields(fields).length > 0
  if (trigger !== 'block-created') return false
  const words = coachableFields(fields)
  return words.length > 0 && words.every((field) => !hasWords(values[field.key]))
}

/** The tool for one block: closed enums only, minted from that block's word fields. Null when it has none. */
export function coachTool(blockType: string, fields: readonly CoachField[]): Anthropic.Tool | null {
  const keys = coachableFields(fields).map((field) => field.key)
  if (keys.length === 0) return null
  return {
    name: 'coach_block',
    description: `Ask the owner up to ${MAX_QUESTIONS} reviewed questions about the words the ${blockType} block still needs. Each question names one of the block's fields. Return no wording, drafts or edits.`,
    input_schema: {
      type: 'object',
      properties: {
        questions: {
          type: 'array',
          minItems: 1,
          maxItems: MAX_QUESTIONS,
          items: {
            type: 'object',
            properties: {
              field: { type: 'string', enum: keys },
              questionId: { type: 'string', enum: COACHING_QUESTION_IDS },
            },
            required: ['field', 'questionId'],
            additionalProperties: false,
          },
        },
      },
      required: ['questions'],
      additionalProperties: false,
    },
  }
}

type QuestionId = keyof typeof COACHING_QUESTION_CATALOG
const QUESTION_IDS = Object.keys(COACHING_QUESTION_CATALOG) as [QuestionId, ...QuestionId[]]

/** Read the tool's input against THIS block's fields, through one strict schema. Anything outside the enums, any
 *  extra key, or a count outside 1 to 3 rejects the whole reply (null), so a partial or creative answer never
 *  reaches the owner. Duplicates collapse. */
export function parseBlockCoaching(raw: unknown, fields: readonly CoachField[]): BlockQuestion[] | null {
  const words = new Map(coachableFields(fields).map((field) => [field.key, field.label]))
  const keys = [...words.keys()]
  if (keys.length === 0) return null
  const reply = z.strictObject({
    questions: z
      .array(z.strictObject({ field: z.enum(keys as [string, ...string[]]), questionId: z.enum(QUESTION_IDS) }))
      .min(1)
      .max(MAX_QUESTIONS),
  })
  const res = validateModelValue(raw, reply)
  if (!res.ok) return null
  const out: BlockQuestion[] = []
  const seen = new Set<string>()
  for (const { field, questionId } of res.data.questions) {
    const id = `${field}:${questionId}`
    if (seen.has(id)) continue
    seen.add(id)
    out.push({ field, label: words.get(field)!, questionId, question: COACHING_QUESTION_CATALOG[questionId] })
  }
  return out
}

/** The questions with no model at all: the first word fields, each with a reviewed question. What she asks when AI
 *  is off, over budget, rate limited, or the reply did not parse. */
const FALLBACK_ORDER: readonly QuestionId[] = ['audience', 'detail', 'next_step']
export function fallbackBlockCoaching(fields: readonly CoachField[]): BlockQuestion[] {
  return coachableFields(fields)
    .slice(0, MAX_QUESTIONS)
    .map((field, i) => ({ field: field.key, label: field.label, questionId: FALLBACK_ORDER[i]!, question: COACHING_QUESTION_CATALOG[FALLBACK_ORDER[i]!] }))
}

// ── Telemetry (PROG-E8B, EDITOR-ARCHITECTURE 8.1 item 8) ─────────────────────────────────────────────────────────
// What the owner did with one question. The two names are registered in lib/analytics/events.ts and are first-party
// only (lib/analytics/sanitize.ts FIRST_PARTY_ONLY_EVENTS): they are never mirrored to a pixel.

/** The registered event for each outcome: went to the field to answer, or put the question away. */
export const VERA_QUESTION_EVENT = {
  accepted: 'editor.vera_question_accepted',
  dismissed: 'editor.vera_question_dismissed',
} as const

export type VeraQuestionOutcome = keyof typeof VERA_QUESTION_EVENT

/** The whole payload: ids, the block type, where the question sat and how many were shown. It reads the question's
 *  two ids and nothing else, so the wording, the field's label and anything typed in a field cannot ride along. */
export function veraQuestionProps(
  question: Pick<BlockQuestion, 'field' | 'questionId'>,
  shown: { blockType: string; source: 'vera' | 'fallback'; position: number; count: number },
): { blockType: string; field: string; questionId: string; source: 'vera' | 'fallback'; position: number; shown: number } {
  return {
    blockType: shown.blockType,
    field: question.field,
    questionId: question.questionId,
    source: shown.source,
    position: shown.position,
    shown: shown.count,
  }
}
