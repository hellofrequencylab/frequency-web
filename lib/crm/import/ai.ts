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
import { MODELS, type ModelTier } from '@/lib/ai/models'
import { estimateCostUsd } from '@/lib/ai/budget'
import { recordAiUsage } from '@/lib/ai/usage'
import { withVoice } from '@/lib/ai/voice'
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

/** Coerce the model's tool output into safe suggestions, dropping anything off-enum. */
function coerceSuggestions(raw: unknown): AiSuggestion[] {
  const cols = (raw as { columns?: unknown })?.columns
  if (!Array.isArray(cols)) return []
  const allowed = new Set<string>(TARGET_ENUM as unknown as string[])
  const out: AiSuggestion[] = []
  for (const c of cols) {
    if (!c || typeof c !== 'object') continue
    const o = c as Record<string, unknown>
    const header = typeof o.header === 'string' ? o.header.trim() : ''
    const target = typeof o.target === 'string' ? o.target.trim() : ''
    if (!header || !allowed.has(target)) continue
    const rawConf = typeof o.confidence === 'number' ? o.confidence : Number(o.confidence)
    const confidence = Number.isFinite(rawConf) ? Math.min(Math.max(rawConf, 0), 1) : 0.5
    const suggestion: AiSuggestion = { header, target: target as MappingChoice, confidence }
    const note = typeof o.note === 'string' ? o.note.trim().slice(0, 160) : ''
    if (note) suggestion.note = note
    out.push(suggestion)
  }
  return out
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

    void recordAiUsage({
      feature: 'crm-import-mapping',
      model: MODELS[tier],
      usage: res.usage,
      costUsd: estimateCostUsd(tier, res.usage),
      profileId: input.profileId ?? null,
      spaceId: input.spaceId ?? null,
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
