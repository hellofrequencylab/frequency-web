// AI extraction for the Poster Events engine: capture a town poster, the model
// turns it into an event draft. Two surfaces, one structured-extraction tool
// (mirrors lib/ai/connections-ai.ts):
//   • scanEventPoster  — vision: photo(s) of a poster → event fields, a clean
//     description, a Domain + tags, and a normalized cover-image crop box.
//   • assistEventFromText — text assist on manual entry: free text → the same shape.
//
// Per the cost-tiering doctrine (lib/ai/models.ts, AI-STRATEGY): vision OCR runs
// on Sonnet (quality), the text assist on Haiku (cheap). Both degrade to null (the
// UI falls back to plain manual entry) when AI is off or the call fails — the
// product never depends on the model being up. Every word the model writes is
// voice-canon via withVoice(); every field is re-validated by coerceEventExtraction.

import Anthropic from '@anthropic-ai/sdk'
import { getAnthropic } from './client'
import { MODELS, type ModelTier } from './models'
import { estimateCostUsd } from './budget'
import { recordAiUsage } from './usage'
import { withVoice } from './voice'
import { coerceEventExtraction } from '@/lib/events/normalize'
import type { ExtractedEvent } from '@/lib/events/types'

type ImageMediaType = 'image/jpeg' | 'image/png' | 'image/webp'

const TOOL_NAME = 'save_event'

// The structured-output contract. Forcing this tool guarantees a parseable shape;
// every field is optional and re-validated by coerceEventExtraction (never trust raw).
const EXTRACTION_TOOL: Anthropic.Tool = {
  name: TOOL_NAME,
  description: 'Save the structured event details captured from the poster or note.',
  input_schema: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'The event name as printed.' },
      description: {
        type: 'string',
        description:
          'A clean 1 to 2 sentence description in plain voice. Say what it is and who it is for. No hype, no em dashes, no invented detail.',
      },
      startsAt: {
        type: 'string',
        description:
          'Start date and time in ISO 8601. If only a month and day are printed, use the next future occurrence of that date.',
      },
      endsAt: { type: 'string', description: 'End date and time in ISO 8601, if printed.' },
      location: { type: 'string', description: 'Venue and city as printed.' },
      isFree: { type: 'boolean', description: 'True if the poster says the event is free.' },
      priceCents: {
        type: 'number',
        description: 'Ticket price in whole cents (e.g. 1500 for $15) when a paid price is printed.',
      },
      organizerName: { type: 'string', description: 'Who is hosting or organizing, if printed.' },
      organizerContact: {
        type: 'string',
        description: 'Organizer contact printed on the poster: email, phone, handle, or URL.',
      },
      domain: {
        type: 'string',
        enum: ['mind', 'body', 'spirit', 'expression'],
        description:
          'Best-fit Domain: mind (curiosity, growth, relating, purpose), body (movement, health, the physical), spirit (stillness, meaning, inner life), expression (creativity, craft, making).',
      },
      tags: {
        type: 'array',
        items: { type: 'string' },
        description: '3 to 6 short lowercase descriptors drawn from the poster.',
      },
      cover: {
        type: 'object',
        description: 'The best image region on the poster to crop as the event cover.',
        properties: {
          found: { type: 'boolean' },
          imageIndex: { type: 'number', description: 'Which image (0-based, in the order given) the region is in.' },
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

const SCAN_SYSTEM = `You are Vera, Frequency's assistant. A community member photographed a town event poster or flyer and wants it turned into an event draft.

Read every detail you can and call the save_event tool. Rules:
- You may be given several images of the SAME poster, e.g. a wide shot plus a close-up. Treat them as one event and merge every detail you can read across all of them.
- Only record what is actually present. Never invent a title, date, venue, organizer, or price.
- description: a clean 1 to 2 sentences in plain voice. Say what the event is and who it is for. No hype, no fabricated backstory.
- starts_at and ends_at: ISO 8601. If the poster prints only a month and day with no year, use the NEXT future occurrence of that date.
- price: if the poster says free, set isFree=true. If a paid price is printed, set priceCents in whole cents (e.g. 1500 for $15).
- domain: classify into one of mind, body, spirit, expression.
- tags: 3 to 6 short lowercase descriptors drawn from the poster.
- cover: if a strong image region appears on a poster (artwork, photo, the main graphic), set found=true, imageIndex to which image it is in (0-based, in the order given), and box to the normalized bounding box (x,y top-left, w,h size, each 0..1) around the best cover region. If there is no usable image region, set found=false.`

const ASSIST_SYSTEM = `You are Vera, Frequency's assistant. A community member is typing a quick note about an event they want to post, and wants it tidied into an event draft.

Turn their free text into structured details and call the save_event tool. Rules:
- Only fill fields the text actually supports. Do not invent a date, venue, organizer, or price.
- description: a tidied 1 to 2 sentence version in plain voice. Do not add facts they did not mention.
- starts_at and ends_at: ISO 8601 when the text gives a date. If only a month and day are given, use the next future occurrence.
- domain: classify into one of mind, body, spirit, expression.
- tags: 3 to 6 short lowercase descriptors drawn from what they wrote.
- There is no image, so set cover.found=false.`

async function runExtraction(opts: {
  tier: ModelTier
  feature: string
  system: string
  content: Anthropic.MessageParam['content']
  profileId?: string | null
}): Promise<ExtractedEvent | null> {
  const client = getAnthropic()
  if (!client) return null
  try {
    const res = await client.messages.create({
      model: MODELS[opts.tier],
      max_tokens: 1024,
      thinking: { type: 'disabled' },
      system: withVoice(opts.system),
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
    return coerceEventExtraction(block.input)
  } catch {
    return null
  }
}

/** Vision harvest: one or more photos of the SAME poster → a single event draft
 *  (Sonnet). Returns null when AI is off or the call fails (UI falls back to
 *  manual entry). The caller must gate on aiAvailable + featureOverBudget. */
export async function scanEventPoster(input: {
  images: { base64: string; mediaType: ImageMediaType }[]
  profileId?: string | null
}): Promise<ExtractedEvent | null> {
  const imgs = input.images.slice(0, 6)
  if (!imgs.length) return null
  const content: Anthropic.MessageParam['content'] = [
    ...imgs.map((im) => ({
      type: 'image' as const,
      source: { type: 'base64' as const, media_type: im.mediaType, data: im.base64 },
    })),
    {
      type: 'text' as const,
      text:
        imgs.length > 1
          ? `These ${imgs.length} images are different views of the SAME event poster. Combine everything you can read across all of them into ONE event. Call save_event.`
          : 'Turn this event poster into a draft. Call save_event.',
    },
  ]
  return runExtraction({
    tier: 'sonnet',
    feature: 'event-poster-scan',
    system: SCAN_SYSTEM,
    profileId: input.profileId,
    content,
  })
}

/** Text assist on manual entry: free text → an event draft (Haiku). */
export async function assistEventFromText(input: {
  text: string
  profileId?: string | null
}): Promise<ExtractedEvent | null> {
  const text = input.text.trim().slice(0, 2000)
  if (!text) return null
  return runExtraction({
    tier: 'haiku',
    feature: 'event-poster-scan',
    system: ASSIST_SYSTEM,
    profileId: input.profileId,
    content: [{ type: 'text', text }],
  })
}
