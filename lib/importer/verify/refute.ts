// ─────────────────────────────────────────────────────────────────────────────
// SMART BUSINESS IMPORTER — the ADVERSARIAL REFUTER (P1, docs/BUSINESS-IMPORTER.md §4.2).
// The second-pass verifier. For each extracted field it runs a deliberately HOSTILE
// prompt on a DIFFERENT model tier from extraction (Extract on sonnet, Verify on OPUS)
// so a single model's blind spot is less likely to pass both gates. Given ONLY the
// harvested snippets, it asks: can this specific claim be refuted, or is it unsupported?
//
// Returns supported | unsupported | contradicted per field (docs §4.2). The PURE reducer
// (./gate.ts applyVerdict) turns that into a ledger mutation. FAIL-SAFE: AI off, over
// budget, or a thrown call yields NO verdict for the field -> the field stays UNVERIFIED
// (the safe default), never auto-promoted. Verification failing closed is the point.
// ─────────────────────────────────────────────────────────────────────────────

import type Anthropic from '@anthropic-ai/sdk'
import { completeRaw } from '@/lib/ai/complete'
import { aiEnabled } from '@/lib/ai/client'
import { MODELS } from '@/lib/ai/models'
import { estimateCostUsd } from '@/lib/ai/budget'
import { recordAiUsage, featureOverBudget } from '@/lib/ai/usage'
import type { HarvestedSource } from '../intake'
import type { FieldVerdict, RefuterVerdict } from './gate'

export const VERIFY_FEATURE = 'business-import-verify'
const TOOL_NAME = 'verify_field'

const VERIFY_TOOL: Anthropic.Tool = {
  name: TOOL_NAME,
  description: 'Record whether the harvested snippets support, fail to support, or contradict the claim.',
  input_schema: {
    type: 'object',
    properties: {
      verdict: {
        type: 'string',
        enum: ['supported', 'unsupported', 'contradicted'],
        description:
          'supported = a snippet clearly states this exact claim; unsupported = no snippet states it (neither for nor against); contradicted = a snippet states something different.',
      },
      snippet: {
        type: 'string',
        description: 'The exact snippet you relied on, copied verbatim. Required for supported or contradicted.',
      },
      confidence: { type: 'number', description: '0..1 confidence in your verdict.' },
      reason: { type: 'string', description: 'One short line: why. No em dashes.' },
    },
    required: ['verdict'],
  },
}

const VERIFY_SYSTEM = `You are an adversarial fact checker for a business importer. Your job is to REFUTE claims, not to be agreeable.

You are given a CLAIM about a business (for example an address, a phone number, a price, or opening hours) and a set of SNIPPETS harvested from the web. Decide, using ONLY the snippets, whether the claim can stand.

Be hostile to the claim. A claim is:
- "supported" ONLY when a snippet clearly and specifically states this exact claim. A vague or partial match is NOT support. Quote the exact snippet.
- "contradicted" when a snippet states something different for the same fact (a different address, a different price). Quote the exact snippet.
- "unsupported" in every other case: when no snippet states the claim, when the match is loose, or when you are unsure. When in doubt, choose unsupported. Do not give the claim the benefit of the doubt.

Never use outside knowledge. If it is not in the snippets, it is unsupported. Call verify_field once.`

/** Coerce the model's raw verify_field output into a RefuterVerdict, defaulting to the SAFE
 *  'unsupported' for any garbage. PURE + total. */
export function coerceVerdict(raw: unknown): { verdict: RefuterVerdict; snippet?: string; confidence?: number } {
  const o = (raw ?? {}) as { verdict?: unknown; snippet?: unknown; confidence?: unknown }
  const v = o.verdict
  const verdict: RefuterVerdict =
    v === 'supported' || v === 'contradicted' ? v : 'unsupported'
  const snippet = typeof o.snippet === 'string' && o.snippet.trim() ? o.snippet.trim() : undefined
  const confidence =
    typeof o.confidence === 'number' && Number.isFinite(o.confidence)
      ? Math.min(1, Math.max(0, o.confidence))
      : undefined
  // A supported/contradicted verdict with NO snippet is downgraded to unsupported: the refuter
  // must quote its evidence, mirroring the extractor's grounding gate.
  if ((verdict === 'supported' || verdict === 'contradicted') && !snippet) {
    return { verdict: 'unsupported', confidence }
  }
  return { verdict, snippet, confidence }
}

/** Render the claim + the snippets into the hostile prompt. Only snippet text is fed (never the
 *  extracted draft), so the refuter cannot see what the extractor concluded. PURE. */
export function buildRefutePrompt(claim: string, path: string, sources: HarvestedSource[]): string {
  const snippets = sources
    .filter((s) => (s.text ?? '').trim().length > 0)
    .slice(0, 30)
    .map((s, i) => `[${i + 1}]${s.url ? ` (${s.url})` : ''}: ${(s.text ?? '').slice(0, 1500)}`)
  return [
    `FIELD: ${path}`,
    `CLAIM: ${claim}`,
    '',
    'SNIPPETS:',
    snippets.length ? snippets.join('\n') : '(no snippets were harvested)',
    '',
    'Can these snippets support the claim? Call verify_field.',
  ].join('\n')
}

/**
 * Run the adversarial refuter on one field. Returns a FieldVerdict, or null when AI is off /
 * over budget / the call fails (the field then stays unverified, the safe default). OPUS tier.
 */
export async function refuteField(input: {
  path: string
  claim: string
  sources: HarvestedSource[]
  sourceUrl?: string
  profileId?: string | null
}): Promise<{ verdict: FieldVerdict; costUsd: number } | null> {
  if (!aiEnabled()) return null
  if (await featureOverBudget(VERIFY_FEATURE)) return null
  if (!input.claim.trim()) return null

  try {
    const res = await completeRaw({
      tier: 'opus',
      maxTokens: 1024,
      thinking: { type: 'disabled' },
      system: VERIFY_SYSTEM, // NOT withVoice: this is an internal judgment, not member-facing copy.
      tools: [VERIFY_TOOL],
      toolChoice: { type: 'tool', name: TOOL_NAME },
      messages: [{ role: 'user', content: buildRefutePrompt(input.claim, input.path, input.sources) }],
    })

    void recordAiUsage({
      feature: VERIFY_FEATURE,
      model: MODELS.opus,
      usage: res.usage,
      costUsd: estimateCostUsd('opus', res.usage),
      profileId: input.profileId ?? null,
    })

    const block = res.content.find(
      (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use' && b.name === TOOL_NAME,
    )
    if (!block) return null
    const coerced = coerceVerdict(block.input)
    return {
      verdict: {
        path: input.path,
        verdict: coerced.verdict,
        snippet: coerced.snippet,
        sourceUrl: input.sourceUrl,
        confidence: coerced.confidence,
      },
      costUsd: res.costUsd,
    }
  } catch {
    return null
  }
}
