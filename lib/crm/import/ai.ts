// ─────────────────────────────────────────────────────────────────────────────
// AI MAPPING ASSIST (CRM Master Build Plan Phase 2) — Vera proposes a column mapping
// for the columns the deterministic auto-mapper (lib/crm/import/map.ts) left low-
// confidence. Reuses the AI kernel doctrine (lib/ai/*): getAnthropic via completeRaw,
// a FORCED structured-output tool constrained to the CLOSED target-field enum (the
// model can NEVER invent a field), the ai_usage ledger, and the kill switch + budget
// cap gate at the call site. Human approves; the AI only SUGGESTS.
//
// PRIVACY: the model sees ONLY the headers + a SMALL sample of rows, never the whole
// file (the full file stays server-side, committed without a model in the loop).
// FAIL-SAFE: returns [] when AI is off / over budget / the call fails, so the wizard
// falls back to the deterministic guesses (the product never depends on the model).
// ─────────────────────────────────────────────────────────────────────────────

import type Anthropic from '@anthropic-ai/sdk'
import { completeRaw } from '@/lib/ai/complete'
import { type ModelTier } from '@/lib/ai/models'

import { withVoice } from '@/lib/ai/voice'
import { lenientList, textOrEmpty, validateModelValue, z } from '@/lib/ai/schema'
import { TARGET_FIELDS, type MappingChoice } from './types'

/** One AI suggestion: a source header, the target it proposes, and its confidence. */
export interface AiSuggestion {
  header: string
  target: MappingChoice
  confidence: number
  /** An optional short normalization hint ("split 'First Last' into names"). */
  note?: string
}

const TOOL_NAME = 'propose_import_mapping'

// The closed enum the model may choose from: every canonical field, plus 'custom'
// (keep the column as a custom field) and 'ignore' (drop it). It CANNOT return anything
// else, so it can never invent a target field.
const TARGET_ENUM = [...TARGET_FIELDS, 'custom', 'ignore'] as const

const MAPPING_TOOL: Anthropic.Tool = {
  name: TOOL_NAME,
  description:
    'Return the best target field for EACH source column of a contact CSV. Choose only from the allowed enum. Never invent a field: if a column does not fit a known field, return "custom" (keep it as a custom field) or "ignore" (drop it).',
  input_schema: {
    type: 'object',
    properties: {
      columns: {
        type: 'array',
        description: 'One entry per source column, in any order.',
        items: {
          type: 'object',
          properties: {
            header: { type: 'string', description: 'The source column header, verbatim.' },
            target: {
              type: 'string',
              enum: TARGET_ENUM as unknown as string[],
              description: 'The canonical field this column maps onto, or custom / ignore.',
            },
            confidence: { type: 'number', description: 'Your confidence 0..1.' },
            note: {
              type: 'string',
              description: 'Optional short normalization hint. No em dashes, no emojis.',
            },
          },
          required: ['header', 'target', 'confidence'],
        },
      },
    },
    required: ['columns'],
  },
}

const SYSTEM = `You are Vera, Frequency's assistant. An operator is importing a contacts CSV and needs each column matched to a contact field.

You are given the column headers and a few sample rows. For EACH header, choose the single best target from the allowed set and call ${TOOL_NAME}. Rules:
- Choose ONLY from the allowed enum. Never invent a field name.
- If a column clearly holds a name, email, phone, job title, company, city, website, an Instagram / LinkedIn / X handle, tags, or notes, map it to that field.
- If a column is real data that does not fit any field (for example a lead source, a deal value, a birthday), return "custom" so it is kept as a custom field.
- If a column is empty, an internal id, or noise, return "ignore".
- Read the SAMPLE VALUES, not just the header: a column named "Column 3" full of email addresses is an email.
- Set confidence honestly (1 = certain, 0.5 = a guess).
- note: only when a column needs splitting or cleaning (for example a single "Full Name" that a human might want split). Keep it short and plain. No em dashes.`

/** A confidence the model may send as a number or a numeric string: clamped to 0..1, a guess (0.5) when unreadable. */
function confidenceOf(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? Math.min(Math.max(n, 0), 1) : 0.5
}

/** The propose_import_mapping reply (PROG-E8B, the ADR-1287 pattern). A row needs a header and a target from the
 *  closed enum; a row that has neither is dropped and the others are kept. */
const MAPPING_REPLY = z.object({
  columns: lenientList(
    z.object({
      header: z.string().transform((v) => v.trim()).pipe(z.string().min(1)),
      target: z.string().transform((v) => v.trim()).pipe(z.enum(TARGET_ENUM)),
      confidence: z.unknown().optional().transform(confidenceOf),
      note: textOrEmpty(160),
    }),
  ),
})

/** Read the model's tool output into safe suggestions through the schema, dropping anything off-enum. A reply that
 *  is not the declared shape yields no suggestions. */
function coerceSuggestions(raw: unknown): AiSuggestion[] {
  const res = validateModelValue(raw, MAPPING_REPLY)
  if (!res.ok) return []
  return res.data.columns.map(({ header, target, confidence, note }) => {
    const suggestion: AiSuggestion = { header, target: target as MappingChoice, confidence }
    if (note) suggestion.note = note
    return suggestion
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// UNSTRUCTURED-TEXT EXTRACTION — pull contacts out of arbitrary text (a pasted
// signature block, a note, an email dump, a .txt file that is not a table). The
// deterministic parser only understands delimited files; anything else routes here.
// Same kernel doctrine as proposeMapping: forced structured output constrained to a
// CLOSED contact schema (the model can only fill name/email/phone/company/notes), a
// SAMPLE only (the text is capped before it reaches the model), usage on the ledger,
// FAIL-SAFE to [] so a file the model cannot read is skipped, never fatal.
// ─────────────────────────────────────────────────────────────────────────────

/** One contact the model lifted out of free text. Every field optional; the caller
 *  keeps any row with at least a name, an email, or a phone. */
export interface ExtractedContact {
  name?: string
  email?: string
  phone?: string
  company?: string
  notes?: string
}

const EXTRACT_TOOL_NAME = 'extract_contacts'

/** Cap the text that reaches the model (privacy + cost). ~12k chars is a generous page. */
const MAX_EXTRACT_CHARS = 12000

const EXTRACT_TOOL: Anthropic.Tool = {
  name: EXTRACT_TOOL_NAME,
  description:
    'Return every distinct person you can find in the text as a contact. Only fill fields you actually see. If the text holds no people, return an empty list.',
  input_schema: {
    type: 'object',
    properties: {
      contacts: {
        type: 'array',
        description: 'One entry per distinct person found. Empty if none.',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'The person’s full name, if present.' },
            email: { type: 'string', description: 'Their email address, if present.' },
            phone: { type: 'string', description: 'Their phone number, if present.' },
            company: { type: 'string', description: 'Their company or organization, if present.' },
            notes: { type: 'string', description: 'A short plain note of any other detail. No em dashes.' },
          },
        },
      },
    },
    required: ['contacts'],
  },
}

const EXTRACT_SYSTEM = `You are Vera, Frequency's assistant. An operator pasted or uploaded some text and wants the PEOPLE in it turned into contacts.

Read the text and call ${EXTRACT_TOOL_NAME} with one entry per distinct person. Rules:
- Only include fields you can actually see in the text. Never guess or invent an email, a phone, or a name.
- Do not duplicate a person. If the same person appears twice, return them once.
- Keep notes short and plain. No em dashes, no emojis.
- If the text has no people (it is a receipt, a login, random noise), return an empty contacts list.`

/** The extract_contacts reply (PROG-E8B, the ADR-1287 pattern). Every field is optional and a wrong-typed one reads
 *  as empty; a row that is not an object is dropped. */
const EXTRACT_REPLY = z.object({
  contacts: lenientList(
    z.object({
      name: textOrEmpty(200),
      email: textOrEmpty(200),
      phone: textOrEmpty(60),
      company: textOrEmpty(200),
      notes: textOrEmpty(500),
    }),
  ),
})

/** Read the model's extraction into safe contacts through the schema. Drops empty rows; trims + caps fields. A reply
 *  that is not the declared shape yields no contacts.
 *  Exported for the unit tests (the AI kernel itself is never called in a test). */
export function coerceExtracted(raw: unknown): ExtractedContact[] {
  const res = validateModelValue(raw, EXTRACT_REPLY)
  if (!res.ok) return []
  const out: ExtractedContact[] = []
  for (const row of res.data.contacts) {
    const contact: ExtractedContact = {}
    if (row.name) contact.name = row.name
    if (row.email) contact.email = row.email.toLowerCase()
    if (row.phone) contact.phone = row.phone
    if (row.company) contact.company = row.company
    if (row.notes) contact.notes = row.notes
    // Keep only a row with some identity (a name, an email, or a phone).
    if (contact.name || contact.email || contact.phone) out.push(contact)
  }
  return out
}

/**
 * Extract contacts from arbitrary text. Bounded: Haiku, the text capped to a sample, a
 * forced structured tool call constrained to the contact schema. Records usage on the
 * ledger. FAIL-SAFE: returns [] on any failure (an unreadable file is simply skipped).
 * The kill switch + budget cap are checked by the caller (the server action) before this
 * runs, mirroring proposeMapping.
 */
export async function extractContactsFromText(input: {
  text: string
  profileId?: string | null
  spaceId?: string | null
}): Promise<{ contacts: ExtractedContact[]; truncated: boolean }> {
  const full = (input.text ?? '').trim()
  if (!full) return { contacts: [], truncated: false }
  const truncated = full.length > MAX_EXTRACT_CHARS
  const text = truncated ? full.slice(0, MAX_EXTRACT_CHARS) : full

  const tier: ModelTier = 'haiku'
  try {
    const res = await completeRaw({
      accounting: { feature: 'crm-import-extract', profileId: input.profileId ?? null, spaceId: input.spaceId ?? null },
      tier,
      maxTokens: 2048,
      thinking: { type: 'disabled' },
      system: withVoice(EXTRACT_SYSTEM),
      tools: [EXTRACT_TOOL],
      toolChoice: { type: 'tool', name: EXTRACT_TOOL_NAME },
      messages: [
        {
          role: 'user',
          content: `Text:\n"""\n${text}\n"""\n\nExtract every person. Call ${EXTRACT_TOOL_NAME}.`,
        },
      ],
    })

    const block = res.content.find(
      (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use' && b.name === EXTRACT_TOOL_NAME,
    )
    if (!block) return { contacts: [], truncated }
    return { contacts: coerceExtracted(block.input), truncated }
  } catch {
    return { contacts: [], truncated }
  }
}

/**
 * Ask Vera to propose a mapping for the given headers + sample rows. Bounded: Haiku,
 * a small sample only, a forced structured tool call. Records usage on the ledger.
 * FAIL-SAFE: returns [] on any failure (the caller keeps the deterministic guesses).
 * The kill switch + budget cap are checked by the caller (the server action) before
 * this runs, mirroring lib/ai/connections-ai.ts.
 */
export async function proposeMapping(input: {
  headers: string[]
  sampleRows: Record<string, string>[]
  profileId?: string | null
  spaceId?: string | null
}): Promise<AiSuggestion[]> {
  const headers = input.headers.filter(Boolean).slice(0, 60)
  if (!headers.length) return []
  // Only a small, redacted-by-omission sample ever reaches the model.
  const sample = input.sampleRows.slice(0, 5).map((r) => {
    const picked: Record<string, string> = {}
    for (const h of headers) picked[h] = (r?.[h] ?? '').slice(0, 80)
    return picked
  })

  const tier: ModelTier = 'haiku'
  try {
    const res = await completeRaw({
      accounting: { feature: 'crm-import-mapping', profileId: input.profileId ?? null, spaceId: input.spaceId ?? null },
      tier,
      maxTokens: 1024,
      thinking: { type: 'disabled' },
      system: withVoice(SYSTEM),
      tools: [MAPPING_TOOL],
      toolChoice: { type: 'tool', name: TOOL_NAME },
      messages: [
        {
          role: 'user',
          content: `Headers:\n${JSON.stringify(headers)}\n\nSample rows:\n${JSON.stringify(sample)}\n\nMap every header. Call ${TOOL_NAME}.`,
        },
      ],
    })

    const block = res.content.find(
      (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use' && b.name === TOOL_NAME,
    )
    if (!block) return []
    return coerceSuggestions(block.input)
  } catch {
    return []
  }
}
