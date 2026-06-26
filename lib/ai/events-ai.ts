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

import type Anthropic from '@anthropic-ai/sdk'
import { completeRaw } from './complete'
import { aiEnabled } from './client'
import { MODELS, type ModelTier } from './models'
import { estimateCostUsd } from './budget'
import { recordAiUsage, featureOverBudget } from './usage'
import { withVoice } from './voice'
import { coerceEventExtraction } from '@/lib/events/normalize'
import type { ExtractedEvent, EventSparkAnswers } from '@/lib/events/types'

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
      corners: {
        type: 'array',
        description:
          'The four corners of the poster within the image, each normalized 0..1, in order [top-left, top-right, bottom-right, bottom-left]. Provide these only when you can clearly locate all four; omit otherwise. They let the app straighten a tilted photo.',
        items: {
          type: 'object',
          properties: { x: { type: 'number' }, y: { type: 'number' } },
        },
      },
      quality: {
        type: 'object',
        description: 'Your honest read on the capture quality of the photo.',
        properties: {
          legible: { type: 'boolean', description: 'True if the text is clear enough to read. Lean toward true for any usable shot.' },
          glare: { type: 'boolean', description: 'True ONLY if glare or reflection actually hides text. The normal sheen of a glossy poster that is still fully readable is NOT glare.' },
          skew: { type: 'boolean', description: 'True only if a steep angle makes the poster hard to read. A mild tilt the app can straighten is fine.' },
          note: {
            type: 'string',
            description:
              'A short, plain retake tip when the capture is poor (for example "Some glare on the top. Try again without the flash."). Leave empty when the photo is fine. No em dashes, no emojis.',
          },
        },
      },
      details: {
        type: 'object',
        description:
          'Everything else printed on the poster, captured into a flexible structure. Every field is optional. Omit a field when the poster has nothing for it. Never invent anything that is not printed.',
        properties: {
          lineup: {
            type: 'array',
            description: 'The bands, speakers, djs, performers, or hosts named on the poster.',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                role: { type: 'string', enum: ['band', 'speaker', 'dj', 'performer', 'host', 'other'] },
                note: { type: 'string' },
                imageBox: {
                  type: 'object',
                  description: 'Normalized 0..1 crop box of this act\'s photo on the poster, when one is shown.',
                  properties: { x: { type: 'number' }, y: { type: 'number' }, w: { type: 'number' }, h: { type: 'number' } },
                },
                confidence: { type: 'string', enum: ['high', 'low'], description: 'low when the poster is hard to read here.' },
              },
            },
          },
          schedule: {
            type: 'array',
            description: 'Printed set times or a run of show.',
            items: {
              type: 'object',
              properties: {
                time: { type: 'string' },
                title: { type: 'string' },
                note: { type: 'string' },
                confidence: { type: 'string', enum: ['high', 'low'] },
              },
            },
          },
          features: {
            type: 'array',
            items: { type: 'string' },
            description: 'Amenities or highlights, for example "all ages", "food trucks", "sober space".',
          },
          tickets: {
            type: 'array',
            description: 'Ticket tiers printed on the poster.',
            items: {
              type: 'object',
              properties: {
                label: { type: 'string' },
                priceCents: { type: 'number', description: 'Whole cents (e.g. 1500 for $15), or omit when not printed.' },
                note: { type: 'string' },
                confidence: { type: 'string', enum: ['high', 'low'] },
              },
            },
          },
          links: {
            type: 'array',
            description: 'URLs or handles printed on the poster.',
            items: {
              type: 'object',
              properties: {
                label: { type: 'string' },
                url: { type: 'string' },
                kind: { type: 'string', enum: ['tickets', 'rsvp', 'website', 'instagram', 'other'] },
              },
            },
          },
          sponsors: { type: 'array', items: { type: 'string' }, description: 'Sponsor or partner names printed on the poster.' },
          imageRegions: {
            type: 'array',
            description: 'Other croppable image regions for a gallery (logos, photos, artwork), beyond the cover.',
            items: {
              type: 'object',
              properties: {
                box: {
                  type: 'object',
                  properties: { x: { type: 'number' }, y: { type: 'number' }, w: { type: 'number' }, h: { type: 'number' } },
                },
                kind: { type: 'string', enum: ['logo', 'photo', 'art'] },
                note: { type: 'string' },
              },
            },
          },
          other: {
            type: 'array',
            description: 'A catch-all for anything that does not fit the slots above, for example {"label":"age","value":"21+"} or {"label":"dress code","value":"all white"}.',
            items: {
              type: 'object',
              properties: { label: { type: 'string' }, value: { type: 'string' } },
            },
          },
          confidence: { type: 'string', enum: ['high', 'low'], description: 'low when the poster as a whole is hard to read.' },
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
- cover: if a strong image region appears on a poster (artwork, photo, the main graphic), set found=true, imageIndex to which image it is in (0-based, in the order given), and box to the normalized bounding box (x,y top-left, w,h size, each 0..1) around the best cover region. If there is no usable image region, set found=false.
- corners: when you can clearly see all four corners of the poster in the photo, give them as four normalized points (each 0..1) in order top-left, top-right, bottom-right, bottom-left. This lets the app straighten a tilted shot. Omit corners when they are cropped off or unclear.
- quality: report honestly, and lean toward accepting a usable shot. Set legible=false ONLY when text is genuinely too blurry or small to read. Set glare=true ONLY when a reflection actually hides text you would otherwise be able to read; do NOT flag the normal sheen or shine of a glossy poster that is still fully readable. Set skew=true only when a steep angle makes it hard to read (a mild tilt the app straightens on its own is fine). When the capture is genuinely poor, add a short plain retake note (for example "The bottom is cut off. Try a straight-on shot of the whole poster."). Leave the note empty when the photo is readable. No em dashes, no emojis.
- details: harvest everything else printed on the poster into the details fields. Identify the lineup (bands, speakers, djs, performers, hosts) and, when a photo of an act is shown, give its imageBox crop region. Capture set times (schedule), amenities and highlights (features), ticket tiers (tickets), links and handles (links), sponsors, any other croppable image regions for a gallery (imageRegions), and put anything else in other as label/value pairs. Mark a row confidence=low when the poster is hard to read there. Never invent a detail that is not on the poster.`

const ASSIST_SYSTEM = `You are Vera, Frequency's assistant. A community member is typing a quick note about an event they want to post, and wants it tidied into an event draft.

Turn their free text into structured details and call the save_event tool. Rules:
- Only fill fields the text actually supports. Do not invent a date, venue, organizer, or price.
- description: a tidied 1 to 2 sentence version in plain voice. Do not add facts they did not mention.
- starts_at and ends_at: ISO 8601 when the text gives a date. If only a month and day are given, use the next future occurrence.
- domain: classify into one of mind, body, spirit, expression.
- tags: 3 to 6 short lowercase descriptors drawn from what they wrote.
- details: capture any extra structure the text gives into the details fields: a lineup (bands, speakers, performers, hosts), set times (schedule), amenities (features), ticket tiers (tickets), links (links), sponsors, and anything else as other label/value pairs. Do not invent details they did not mention.
- There is no image, so set cover.found=false and omit corners, imageBox, and imageRegions (those need a photo).`

const SPARK_SYSTEM = `You are Vera, Frequency's assistant. A community member answered a few quick questions about an event they want to post (what it is, when, where, and who it is for), and may have pasted a flyer or write-up. Turn that into an event draft and call the save_event tool. Rules:
- Only record what the answers or pasted text actually say. Never invent a title, date, venue, organizer, or price.
- If the member pasted a flyer or write-up, read it closely and let it lead; the short answers fill the gaps.
- description: a clean 1 to 2 sentence version in plain voice. Say what the event is and who it is for. Do not add facts they did not give.
- starts_at and ends_at: ISO 8601 from the "when" answer. If only a month and day are given, use the next future occurrence. If the time is vague, leave it out rather than invent a precise time.
- price: if they say free, set isFree=true. If a paid price is given, set priceCents in whole cents (e.g. 1500 for $15).
- domain: classify into one of mind, body, spirit, expression.
- tags: 3 to 6 short lowercase descriptors drawn from what they wrote.
- details: capture any extra structure they give (a lineup, set times, ticket tiers, links, sponsors) into the details fields, and anything else as other label/value pairs. Do not invent details.
- There is no image, so set cover.found=false and omit corners, imageBox, and imageRegions.`

async function runExtraction(opts: {
  tier: ModelTier
  feature: string
  system: string
  content: Anthropic.MessageParam['content']
  profileId?: string | null
}): Promise<ExtractedEvent | null> {
  // Kill switch + per-feature daily cap (lib/ai/budget.ts). Both surfaces (Sonnet vision scan +
  // Haiku text assist) gate here, so AI off / over budget falls back to plain manual entry and
  // never bills on. event-poster-scan is the vision path, so its cap is the higher one.
  if (!aiEnabled()) return null
  if (await featureOverBudget(opts.feature)) return null
  try {
    const res = await completeRaw({
      tier: opts.tier,
      maxTokens: 1024,
      thinking: { type: 'disabled' },
      system: withVoice(opts.system),
      tools: [EXTRACTION_TOOL],
      toolChoice: { type: 'tool', name: TOOL_NAME },
      messages: [{ role: 'user', content: opts.content }],
    })

    void recordAiUsage({
      feature: opts.feature,
      model: MODELS[opts.tier],
      usage: res.usage,
      costUsd: estimateCostUsd(opts.tier, res.usage),
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

/** Compose the wizard answers (and any pasted flyer text) into one prompt for the spark. */
function composeSparkText(a: EventSparkAnswers, sourceText?: string | null): string {
  const src = sourceText?.trim().slice(0, 4000)
  return [
    src
      ? `The member pasted a flyer or write-up. Read it closely and draft the event FROM it; the short answers below fill any gaps:\n"""\n${src}\n"""\n`
      : '',
    `What it is: ${a.what.trim().slice(0, 500) || '(not given)'}`,
    `When: ${a.when.trim().slice(0, 200) || '(not given)'}`,
    `Where: ${a.where.trim().slice(0, 300) || '(not given)'}`,
    `Who it is for and details: ${a.details.trim().slice(0, 800) || '(none)'}`,
    '',
    'Turn this into an event draft. Call save_event.',
  ]
    .filter(Boolean)
    .join('\n')
}

/**
 * Vera's Spark for events: a few wizard answers (plus an optional pasted flyer) → an event
 * draft (Sonnet). Mirrors draftJourneySpark / draftPracticeSpark. Returns null when AI is off
 * or over budget, so the wizard falls back to plain manual entry. Reuses the shared save_event
 * tool, so a sparked draft is identical in shape to a poster-scanned one (the same draft editor
 * and createEventDraft consume it).
 */
export async function draftEventSpark(input: {
  answers: EventSparkAnswers
  sourceText?: string | null
  profileId?: string | null
}): Promise<ExtractedEvent | null> {
  return runExtraction({
    tier: 'sonnet',
    feature: 'event-spark',
    system: SPARK_SYSTEM,
    profileId: input.profileId,
    content: [{ type: 'text', text: composeSparkText(input.answers, input.sourceText) }],
  })
}
