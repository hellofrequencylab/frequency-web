// The AI harvest for the Profile Creator (docs/NETWORK-CRM.md, ADR-096). Two
// surfaces, one structured-extraction tool:
//   • scanCardImage  — vision: a photo of a business card / poster → fields, a
//     suggested connection note, tags, and a normalized face box for the crop.
//   • assistFromText — Vera assist on manual entry: free text → the same shape.
//
// Per the cost-tiering doctrine (lib/ai/models.ts, AI-STRATEGY): vision OCR runs
// on Sonnet (quality), the text assist on Haiku (cheap). Both degrade to null
// (the UI falls back to plain manual entry) when AI is off or the call fails —
// the product never depends on the model being up (mirrors lib/studio/winback.ts).

import Anthropic from '@anthropic-ai/sdk'
import { getAnthropic } from './client'
import { MODELS, type ModelTier } from './models'
import { estimateCostUsd } from './budget'
import { recordAiUsage } from './usage'
import { coerceExtraction } from '@/lib/connections/normalize'
import type { ExtractedContact } from '@/lib/connections/types'

type ImageMediaType = 'image/jpeg' | 'image/png' | 'image/webp'

const TOOL_NAME = 'save_contact'

// The structured-output contract. Forcing this tool guarantees a parseable shape;
// every field is optional and re-validated by coerceExtraction (never trust raw).
const EXTRACTION_TOOL: Anthropic.Tool = {
  name: TOOL_NAME,
  description: 'Save the structured contact details harvested from the source.',
  input_schema: {
    type: 'object',
    properties: {
      displayName: { type: 'string', description: "The person's full name." },
      email: { type: 'string' },
      phone: { type: 'string' },
      title: { type: 'string', description: 'Job title or role.' },
      company: { type: 'string', description: 'Company or organization.' },
      city: { type: 'string', description: 'City or location.' },
      website: { type: 'string' },
      socials: {
        type: 'object',
        description: 'Social handles or profile URLs, if present.',
        properties: {
          instagram: { type: 'string' },
          linkedin: { type: 'string' },
          x: { type: 'string' },
          other: { type: 'string' },
        },
      },
      tags: {
        type: 'array',
        items: { type: 'string' },
        description: '3–6 short, lowercase descriptors — interests, industry, or how you might collaborate.',
      },
      connectionNote: {
        type: 'string',
        description: 'One or two warm sentences a steward could use to remember this person and the connection.',
      },
      photo: {
        type: 'object',
        description: 'A portrait/headshot of the person on the source, if any.',
        properties: {
          found: { type: 'boolean' },
          box: {
            type: 'object',
            description: 'Normalized bounding box (each value 0..1): x,y = top-left; w,h = width,height.',
            properties: {
              x: { type: 'number' },
              y: { type: 'number' },
              w: { type: 'number' },
              h: { type: 'number' },
            },
          },
        },
      },
    },
    required: [],
  },
}

const SCAN_SYSTEM = `You are Vera, Frequency's assistant. A community steward photographed a business card, flyer, or poster and wants it turned into a CRM profile.

Read every detail you can and call the save_contact tool. Rules:
- Only record what is actually present — never invent a name, email, company, or any other detail.
- tags: 3–6 short lowercase descriptors (interests, industry, or how the steward might collaborate).
- connectionNote: one or two warm, human sentences the steward can use to remember who this is — no fluff, no fabricated backstory.
- photo: if a portrait/headshot of a person appears, set found=true and box to the normalized bounding box (x,y top-left, w,h size — each 0..1) tightly around the face/portrait. If there is no person's photo, set found=false.`

const ASSIST_SYSTEM = `You are Vera, Frequency's assistant. A community steward is jotting a quick note about someone they just met, and wants it tidied into a CRM profile.

Turn their free text into structured details and call the save_contact tool. Rules:
- Only fill fields the text actually supports — do not invent contact details.
- tags: 3–6 short lowercase descriptors drawn from what they wrote.
- connectionNote: a tidied one-or-two-sentence version of the connection, in a warm, human voice. Do not add facts they didn't mention.
- There is no image, so set photo.found=false.`

async function runExtraction(opts: {
  tier: ModelTier
  feature: string
  system: string
  content: Anthropic.MessageParam['content']
  profileId?: string | null
}): Promise<ExtractedContact | null> {
  const client = getAnthropic()
  if (!client) return null
  try {
    const res = await client.messages.create({
      model: MODELS[opts.tier],
      max_tokens: 1024,
      thinking: { type: 'disabled' },
      system: opts.system,
      tools: [EXTRACTION_TOOL],
      tool_choice: { type: 'tool', name: TOOL_NAME },
      messages: [{ role: 'user', content: opts.content }],
    })

    const usage = { inputTokens: res.usage.input_tokens, outputTokens: res.usage.output_tokens }
    void recordAiUsage({
      feature: opts.feature,
      model: MODELS[opts.tier],
      usage,
      costUsd: estimateCostUsd(opts.tier, usage),
      profileId: opts.profileId ?? null,
    })

    const block = res.content.find(
      (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use' && b.name === TOOL_NAME,
    )
    if (!block) return null
    return coerceExtraction(block.input)
  } catch {
    return null
  }
}

/** Vision harvest: a card/poster photo → a structured profile (Sonnet). */
export async function scanCardImage(input: {
  imageBase64: string
  mediaType: ImageMediaType
  profileId?: string | null
}): Promise<ExtractedContact | null> {
  return runExtraction({
    tier: 'sonnet',
    feature: 'connection-scan',
    system: SCAN_SYSTEM,
    profileId: input.profileId,
    content: [
      { type: 'image', source: { type: 'base64', media_type: input.mediaType, data: input.imageBase64 } },
      { type: 'text', text: 'Harvest this person’s details into a profile. Call save_contact.' },
    ],
  })
}

/** Vera assist on manual entry: free text → a structured profile (Haiku). */
export async function assistFromText(input: {
  text: string
  profileId?: string | null
}): Promise<ExtractedContact | null> {
  const text = input.text.trim().slice(0, 2000)
  if (!text) return null
  return runExtraction({
    tier: 'haiku',
    feature: 'connection-assist',
    system: ASSIST_SYSTEM,
    profileId: input.profileId,
    content: [{ type: 'text', text }],
  })
}
