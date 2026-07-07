// ─────────────────────────────────────────────────────────────────────────────
// SMART BUSINESS IMPORTER — the EXTRACT stage (P1, docs/BUSINESS-IMPORTER.md §6.1 stage 3).
// Feed the harvested sources to Claude (SONNET) with a forced structured-output tool and
// turn them into a BusinessProfile draft + a first-pass ProvenanceLedger. Every field the
// model emits carries the sourceUrl + snippet it used (docs §4.1); the PURE coercer
// (./coerce.ts) grounds each citation and downgrades any un-cited "fact".
//
// Reuses the app's single AI chokepoint (lib/ai/complete completeRaw with a forced
// tool_choice, the exact lib/ai/events-ai.ts pattern) + withVoice + the budget/kill gates.
// FAIL-SAFE: AI off, over budget, or a thrown call returns a null result; the orchestrator
// then degrades to a name-only flagged draft rather than crashing or fabricating.
// ─────────────────────────────────────────────────────────────────────────────

import type Anthropic from '@anthropic-ai/sdk'
import { completeRaw } from '@/lib/ai/complete'
import { aiEnabled } from '@/lib/ai/client'
import { MODELS } from '@/lib/ai/models'
import { estimateCostUsd } from '@/lib/ai/budget'
import { recordAiUsage, featureOverBudget } from '@/lib/ai/usage'
import { withVoice } from '@/lib/ai/voice'
import type { HarvestedSource, IntakeInputs } from '../intake'
import { coerceExtraction, type ExtractionResult, type RawExtraction } from './coerce'

export const EXTRACT_FEATURE = 'business-import-extract'
const TOOL_NAME = 'save_business_profile'

/** A per-field citation shape reused across the tool schema: the value plus where it came from. */
const CITED_FIELD = {
  type: 'object' as const,
  properties: {
    value: { type: 'string', description: 'The extracted value.' },
    sourceUrl: {
      type: 'string',
      description: 'The exact source url (from the SOURCES list) this value came from. Omit for generated copy.',
    },
    snippet: {
      type: 'string',
      description:
        'The exact text from that source that supports this value, copied verbatim. Required for a fact. Omit for generated copy.',
    },
    kind: {
      type: 'string',
      enum: ['fact', 'inferred', 'generated'],
      description:
        'fact = copied from a source with a snippet; inferred = deduced from sources; generated = you wrote it with no source.',
    },
    confidence: { type: 'number', description: '0..1 confidence this value is correct.' },
  },
}

// The forced structured-output tool. Every commercial field is a CITED_FIELD so the model must
// declare its source. Nothing is trusted raw: coerceExtraction re-validates + grounds every field.
const EXTRACTION_TOOL: Anthropic.Tool = {
  name: TOOL_NAME,
  description: 'Save the structured business profile extracted from the harvested sources.',
  input_schema: {
    type: 'object',
    properties: {
      name: CITED_FIELD,
      brandName: CITED_FIELD,
      type: { type: 'string', enum: ['business', 'nonprofit'] },
      tagline: CITED_FIELD,
      category: CITED_FIELD,
      about: CITED_FIELD,
      story: CITED_FIELD,
      contact: {
        type: 'object',
        properties: {
          address: CITED_FIELD,
          phone: CITED_FIELD,
          email: CITED_FIELD,
          website: CITED_FIELD,
          hours: CITED_FIELD,
          socials: {
            type: 'array',
            items: {
              type: 'object',
              properties: { platform: { type: 'string' }, url: { type: 'string' } },
            },
          },
        },
      },
      rating: {
        type: 'object',
        properties: { value: CITED_FIELD, count: CITED_FIELD },
      },
      offerings: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            title: CITED_FIELD,
            blurb: CITED_FIELD,
            price: CITED_FIELD,
            priceModel: { type: 'string', enum: ['fixed', 'from', 'free', 'contact'] },
            currency: { type: 'string', description: 'ISO 4217 code, e.g. USD.' },
            durationMinutes: { type: 'number' },
          },
        },
      },
      faq: {
        type: 'array',
        items: { type: 'object', properties: { q: { type: 'string' }, a: { type: 'string' } } },
      },
      events: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            startsAt: { type: 'string', description: 'ISO 8601.' },
            endsAt: { type: 'string', description: 'ISO 8601.' },
            location: { type: 'string' },
            blurb: { type: 'string' },
          },
        },
      },
      links: {
        type: 'array',
        items: { type: 'object', properties: { platform: { type: 'string' }, url: { type: 'string' } } },
      },
    },
    required: [],
  },
}

const EXTRACT_SYSTEM = `You extract a structured business profile from harvested web sources for the Frequency business importer.

You are given a SOURCES list: each source has an id, a url, and its readable text (a crawled page, a search snippet, or an operator paste). Extract ONLY what those sources actually support.

Hard rules:
- Never invent a fact. If the sources do not state an address, phone, price, hours, or rating, leave that field out entirely.
- For every field, set kind honestly: "fact" ONLY when you copy a value from a source AND provide the exact snippet you copied it from plus that source's url; "inferred" when you deduce it from the sources; "generated" when you wrote it yourself with no source.
- A "fact" MUST carry a snippet copied verbatim from a source and that source's url. If you cannot cite it, mark it "inferred" or leave it out. Do not claim a citation you do not have.
- Commercial facts (address, phone, email, hours, every offering price, rating) are the ones that matter most: only mark them "fact" with a real snippet + url, otherwise omit them. A blank field is better than a wrong one.
- about and story may be "generated" prose, but keep them grounded in what the sources say. Do not fabricate history, awards, or claims.
- Prefer the operator paste and the business's own website over search snippets when they disagree.

Call save_business_profile once with everything you can support.`

/** Render the harvested sources into a compact, id-tagged block for the model. Bounds total
 *  length so a big crawl cannot blow the context / cost. PURE. */
export function buildSourcesPrompt(sources: HarvestedSource[], hints?: IntakeInputs['hints']): string {
  const usable = sources.filter((s) => (s.text ?? '').trim().length > 0)
  const parts: string[] = []
  if (hints) {
    const bits = [
      hints.name && `name hint: ${hints.name}`,
      hints.category && `category hint: ${hints.category}`,
      hints.city && `city hint: ${hints.city}`,
      hints.type && `type hint: ${hints.type}`,
    ].filter(Boolean)
    if (bits.length) parts.push(`OPERATOR HINTS: ${bits.join('; ')}`)
  }
  parts.push('SOURCES:')
  let budget = 40_000 // total chars of source text fed to the model (cost guard)
  for (const s of usable) {
    if (budget <= 0) break
    const text = (s.text ?? '').slice(0, Math.min(6_000, budget))
    budget -= text.length
    parts.push(
      `--- source id=${s.id} kind=${s.kind}${s.url ? ` url=${s.url}` : ''}${s.title ? ` title=${JSON.stringify(s.title)}` : ''}\n${text}`,
    )
  }
  parts.push('\nExtract the business profile and call save_business_profile.')
  return parts.join('\n\n')
}

/** The result of an extract run, or null when AI is unavailable (fail-safe). */
export type ExtractRunResult = (ExtractionResult & { costUsd: number }) | null

/**
 * Extract a BusinessProfile draft + first-pass ledger from harvested sources (SONNET, forced
 * tool). Gated on aiEnabled + the per-feature budget cap; returns null when off/over-budget/failed
 * so the orchestrator degrades to a flagged draft. `profileId` attributes the usage ledger entry.
 */
export async function extractProfile(input: {
  sources: HarvestedSource[]
  hints?: IntakeInputs['hints']
  profileId?: string | null
}): Promise<ExtractRunResult> {
  if (!aiEnabled()) return null
  if (await featureOverBudget(EXTRACT_FEATURE)) return null
  const usable = input.sources.filter((s) => (s.text ?? '').trim().length > 0)
  if (usable.length === 0) return null

  try {
    const res = await completeRaw({
      tier: 'sonnet',
      maxTokens: 4096,
      thinking: { type: 'disabled' },
      system: withVoice(EXTRACT_SYSTEM),
      tools: [EXTRACTION_TOOL],
      toolChoice: { type: 'tool', name: TOOL_NAME },
      messages: [{ role: 'user', content: buildSourcesPrompt(input.sources, input.hints) }],
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
    const nameFallback = input.hints?.name ?? ''
    const result = coerceExtraction(block.input as RawExtraction, input.sources, nameFallback)
    return { ...result, costUsd: res.costUsd }
  } catch {
    return null
  }
}
