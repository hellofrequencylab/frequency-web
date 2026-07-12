// ─────────────────────────────────────────────────────────────────────────────
// CLASSIFIEDS & HOUSING SEEDER — the AI EXTRACT stage (Phase 0). Mirrors
// lib/importer/extract/run.ts: feed ONE pasted block to Claude (SONNET) with a
// forced structured-output tool, per-kind, and turn it into a cited raw extraction
// the PURE coercer (./coerce.ts) then grounds against the paste.
//
// Reuses the app's single AI chokepoint (completeRaw with a forced tool_choice) +
// withVoice + the aiEnabled / budget gates. FAIL-SAFE: AI off, over budget, or a
// thrown call returns null so the orchestrator degrades to a name-only manual draft
// rather than crashing or fabricating. Every field is a CITED_FIELD: a 'fact' MUST
// carry a snippet copied verbatim from the paste, or it is not a fact.
// ─────────────────────────────────────────────────────────────────────────────

import type Anthropic from '@anthropic-ai/sdk'
import { completeRaw } from '@/lib/ai/complete'
import { aiEnabled } from '@/lib/ai/client'
import { MODELS } from '@/lib/ai/models'
import { estimateCostUsd } from '@/lib/ai/budget'
import { recordAiUsage, featureOverBudget } from '@/lib/ai/usage'
import { withVoice } from '@/lib/ai/voice'
import { PROPERTY_TYPES, AMENITIES } from '@/lib/listings/types'
import type {
  ClassifiedsExtraction,
  HousingExtraction,
  ListingExtraction,
  ListingHints,
  ListingSeedKind,
} from './types'

export const EXTRACT_FEATURE = 'listing-seed-extract'
const TOOL_NAME = 'save_listing'

/** A per-field citation shape reused across every tool schema field. Value + the verbatim snippet
 *  from the paste that supports it. Mirrors the importer CITED_FIELD (minus sourceUrl: one source). */
const CITED_FIELD = {
  type: 'object' as const,
  properties: {
    value: { type: 'string', description: 'The extracted value.' },
    snippet: {
      type: 'string',
      description:
        'The exact text from the pasted listing that supports this value, copied verbatim. Required for a fact. Omit for generated copy.',
    },
    kind: {
      type: 'string',
      enum: ['fact', 'inferred', 'generated'],
      description:
        'fact = copied from the paste with a snippet; inferred = deduced from the paste; generated = you wrote it with no support.',
    },
    confidence: { type: 'number', description: '0..1 confidence this value is correct.' },
  },
}

const CLASSIFIEDS_TOOL: Anthropic.Tool = {
  name: TOOL_NAME,
  description: 'Save the structured classifieds listing extracted from the pasted copy.',
  input_schema: {
    type: 'object',
    properties: {
      title: CITED_FIELD,
      description: CITED_FIELD,
      listingKind: {
        ...CITED_FIELD,
        description: 'The intent: offer (selling/handing on), free (giving away), lend (borrow+return), or request (looking for).',
      },
      category: CITED_FIELD,
      priceNote: CITED_FIELD,
      neighborhood: CITED_FIELD,
      city: CITED_FIELD,
      contact: CITED_FIELD,
    },
    required: [],
  },
}

const HOUSING_TOOL: Anthropic.Tool = {
  name: TOOL_NAME,
  description: 'Save the structured housing listing extracted from the pasted copy.',
  input_schema: {
    type: 'object',
    properties: {
      title: CITED_FIELD,
      description: CITED_FIELD,
      propertyType: {
        ...CITED_FIELD,
        description: `The property type, one of: ${PROPERTY_TYPES.map((p) => p.slug).join(', ')}.`,
      },
      amenities: {
        type: 'array',
        description: `Amenities the paste states, each as a cited field. Use only these slugs: ${AMENITIES.map((a) => a.slug).join(', ')}.`,
        items: CITED_FIELD,
      },
      rentDollars: { ...CITED_FIELD, description: 'Monthly rent in whole dollars (number only).' },
      deposit: { ...CITED_FIELD, description: 'Security deposit in whole dollars (number only).' },
      bedrooms: CITED_FIELD,
      bathrooms: CITED_FIELD,
      sqft: CITED_FIELD,
      availableFrom: { ...CITED_FIELD, description: 'The move-in / available date as written.' },
      furnished: { ...CITED_FIELD, description: 'yes or no.' },
      petsOk: { ...CITED_FIELD, description: 'yes or no.' },
      utilitiesIncluded: { ...CITED_FIELD, description: 'yes or no.' },
      smokingOk: { ...CITED_FIELD, description: 'yes or no.' },
      cannabisOk: { ...CITED_FIELD, description: 'yes or no.' },
      neighborhood: CITED_FIELD,
      city: CITED_FIELD,
      contact: CITED_FIELD,
    },
    required: [],
  },
}

const TOOLS: Record<ListingSeedKind, Anthropic.Tool> = {
  classifieds: CLASSIFIEDS_TOOL,
  housing: HOUSING_TOOL,
}

const EXTRACT_SYSTEM = `You extract ONE structured local listing from a block of copy an operator pasted (a classified ad, or a housing / rental post). The paste is the ONLY source. Extract only what it actually says.

Hard rules:
- Never invent a fact. If the paste does not state a price, a rent, a deposit, a contact, a date, or an attribute, leave that field out entirely. A blank field is better than a wrong one.
- For every field set kind honestly: "fact" ONLY when you copy the value from the paste AND provide the exact snippet you copied it from; "inferred" when you deduce it from the paste; "generated" when you wrote it yourself.
- A "fact" MUST carry a snippet copied verbatim from the paste. If you cannot quote it, mark it "inferred" or leave it out. Do not claim a citation you do not have.
- The PRICE / RENT / DEPOSIT and the CONTACT are the facts that matter most: only mark them "fact" with a real verbatim snippet, otherwise omit them.
- title and description may be lightly cleaned prose (mark them "generated" or "inferred"), but keep them grounded in what the paste says. Do not add features, guarantees, or claims the paste does not make.
- Preserve the poster's own contact details exactly as written (do not normalize a phone or email into a new format).

Call save_listing once with everything the paste supports.`

/** Build the compact prompt from the paste + optional hints. Bounds the paste length (cost guard). PURE. */
export function buildExtractPrompt(pastedText: string, hints?: ListingHints): string {
  const parts: string[] = []
  if (hints) {
    const bits = [
      hints.city && `city hint: ${hints.city}`,
      hints.neighborhood && `neighborhood hint: ${hints.neighborhood}`,
      hints.category && `category hint: ${hints.category}`,
    ].filter(Boolean)
    if (bits.length) parts.push(`OPERATOR HINTS: ${bits.join('; ')}`)
  }
  parts.push('PASTED LISTING:')
  parts.push((pastedText ?? '').slice(0, 12_000))
  parts.push('\nExtract the listing and call save_listing.')
  return parts.join('\n\n')
}

export interface ExtractListingInput {
  kind: ListingSeedKind
  pastedText: string
  hints?: ListingHints
  /** Optional actor id for the usage ledger attribution. */
  profileId?: string | null
}

/**
 * Extract a cited ListingExtraction from one pasted block (SONNET, forced tool). Gated on aiEnabled +
 * the per-feature budget cap; returns null when off / over-budget / failed / empty so the caller
 * degrades to a manual draft. The returned shape is UNTRUSTED — coerceListingExtraction grounds it.
 */
export async function extractListing(input: ExtractListingInput): Promise<ListingExtraction | null> {
  if (!aiEnabled()) return null
  if (!input.pastedText || !input.pastedText.trim()) return null
  if (await featureOverBudget(EXTRACT_FEATURE)) return null

  try {
    const res = await completeRaw({
      tier: 'sonnet',
      maxTokens: 2048,
      thinking: { type: 'disabled' },
      system: withVoice(EXTRACT_SYSTEM),
      tools: [TOOLS[input.kind]],
      toolChoice: { type: 'tool', name: TOOL_NAME },
      messages: [{ role: 'user', content: buildExtractPrompt(input.pastedText, input.hints) }],
    })

    void recordAiUsage({
      feature: EXTRACT_FEATURE,
      model: MODELS.sonnet,
      usage: res.usage,
      costUsd: estimateCostUsd('sonnet', res.usage),
      profileId: input.profileId ?? null,
    })

    const block = res.content.find(
      (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use' && b.name === TOOL_NAME,
    )
    if (!block) return null
    const fields = block.input as Record<string, unknown>
    return input.kind === 'classifieds'
      ? ({ kind: 'classifieds', ...(fields as Omit<ClassifiedsExtraction, 'kind'>) } as ClassifiedsExtraction)
      : ({ kind: 'housing', ...(fields as Omit<HousingExtraction, 'kind'>) } as HousingExtraction)
  } catch {
    return null
  }
}
