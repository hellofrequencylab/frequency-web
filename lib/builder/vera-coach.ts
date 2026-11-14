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
// PURE: no IO, no React. lib/ai/vera/block-coach.ts makes the call; the canvas draws the result.

import type Anthropic from '@anthropic-ai/sdk'
import { COACHING_QUESTION_CATALOG, COACHING_QUESTION_IDS } from '@/lib/ai/coaching-question-catalog'
import type { FieldDef } from '@/lib/entity-blocks/block-content'

/** A field Vera may ask about: one the owner fills with their own words. */
export type CoachField = Pick<FieldDef, 'key' | 'label' | 'type'>

/** One question on the inspector: the field it is about, that field's label, and the reviewed wording. */
export interface BlockQuestion { field: string; label: string; question: string }

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

/** Read the tool's input against THIS block's fields. Anything outside the enums, or any extra key, rejects the
 *  whole reply (null), so a partial or creative answer never reaches the owner. Duplicates collapse. */
export function parseBlockCoaching(raw: unknown, fields: readonly CoachField[]): BlockQuestion[] | null {
  const words = new Map(coachableFields(fields).map((field) => [field.key, field.label]))
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  if (Object.keys(raw).length !== 1 || !Object.hasOwn(raw, 'questions')) return null
  const list = (raw as { questions?: unknown }).questions
  if (!Array.isArray(list) || list.length < 1 || list.length > MAX_QUESTIONS) return null
  const out: BlockQuestion[] = []
  const seen = new Set<string>()
  for (const item of list) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return null
    const keys = Object.keys(item)
    if (keys.length !== 2 || !keys.includes('field') || !keys.includes('questionId')) return null
    const { field, questionId } = item as { field: unknown; questionId: unknown }
    if (typeof field !== 'string' || !words.has(field)) return null
    if (typeof questionId !== 'string' || !Object.hasOwn(COACHING_QUESTION_CATALOG, questionId)) return null
    const id = `${field}:${questionId}`
    if (seen.has(id)) continue
    seen.add(id)
    out.push({ field, label: words.get(field)!, question: COACHING_QUESTION_CATALOG[questionId as QuestionId] })
  }
  return out
}

/** The questions with no model at all: the first word fields, each with a reviewed question. What she asks when AI
 *  is off, over budget, rate limited, or the reply did not parse. */
const FALLBACK_ORDER: readonly QuestionId[] = ['audience', 'detail', 'next_step']
export function fallbackBlockCoaching(fields: readonly CoachField[]): BlockQuestion[] {
  return coachableFields(fields)
    .slice(0, MAX_QUESTIONS)
    .map((field, i) => ({ field: field.key, label: field.label, question: COACHING_QUESTION_CATALOG[FALLBACK_ORDER[i]!] }))
}
