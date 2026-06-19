// The AI harvest for the Profile Creator (docs/NETWORK-CRM.md, ADR-098). Two
// surfaces, one structured-extraction tool:
//   • scanCardImage  — vision: a photo of a business card / poster → fields, a
//     suggested connection note, tags, and a normalized face box for the crop.
//   • assistFromText — Vera assist on manual entry: free text → the same shape.
//
// Per the cost-tiering doctrine (lib/ai/models.ts, AI-STRATEGY): vision OCR runs
// on Sonnet (quality), the text assist on Haiku (cheap). Both degrade to null
// (the UI falls back to plain manual entry) when AI is off or the call fails —
// the product never depends on the model being up (mirrors lib/studio/winback.ts).

import type Anthropic from '@anthropic-ai/sdk'
import { completeRaw } from './complete'
import { MODELS, type ModelTier } from './models'
import { estimateCostUsd } from './budget'
import { recordAiUsage } from './usage'
import { withVoice } from './voice'
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
        description: '3 to 6 short, lowercase descriptors: interests, industry, or how you might collaborate.',
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
          imageIndex: { type: 'number', description: 'Which image (0-based, in the order given) the portrait is in.' },
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
      logo: {
        type: 'object',
        description: 'The company or brand logo on the source, if any.',
        properties: {
          found: { type: 'boolean' },
          imageIndex: { type: 'number', description: 'Which image (0-based, in the order given) the logo is in.' },
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
          'One entry per input image, in the order given. Entry i is the four corners of the card in image i, each normalized 0..1, in order [top-left, top-right, bottom-right, bottom-left]. Use null for an image where you cannot clearly see all four corners (or that is not a card). They let the app straighten each side.',
        items: {
          type: ['array', 'null'],
          items: {
            type: 'object',
            properties: { x: { type: 'number' }, y: { type: 'number' } },
          },
        },
      },
      quality: {
        type: 'object',
        description: 'Your honest read on the capture quality of the photo(s).',
        properties: {
          legible: { type: 'boolean', description: 'True if the text is clear enough to read.' },
          glare: { type: 'boolean', description: 'True if glare or reflection blocks part of the card.' },
          skew: { type: 'boolean', description: 'True if the card is tilted or photographed at a steep angle.' },
          note: {
            type: 'string',
            description:
              'A short, plain retake tip when the capture is poor (for example "Some glare on the front. Try again without the flash."). Leave empty when the photos are fine. No em dashes, no emojis.',
          },
        },
      },
      details: {
        type: 'object',
        description:
          'Everything else printed on the card, captured into a flexible structure. Every field is optional. Omit a field when the card has nothing for it. Never invent anything that is not printed.',
        properties: {
          phones: {
            type: 'array',
            description: 'Every phone number printed, with its printed label (mobile, office, fax, ...).',
            items: {
              type: 'object',
              properties: {
                label: { type: 'string' },
                number: { type: 'string' },
                confidence: { type: 'string', enum: ['high', 'low'], description: 'low when the card is hard to read here.' },
              },
            },
          },
          emails: {
            type: 'array',
            description: 'Every email address printed, with its printed label when one is shown.',
            items: {
              type: 'object',
              properties: {
                label: { type: 'string' },
                address: { type: 'string' },
                confidence: { type: 'string', enum: ['high', 'low'] },
              },
            },
          },
          addresses: {
            type: 'array',
            items: { type: 'string' },
            description: 'Street or mailing addresses printed on the card, each as one line.',
          },
          services: {
            type: 'array',
            items: { type: 'string' },
            description: 'Services or offerings listed, for example "sound baths", "notary", "house calls".',
          },
          certifications: {
            type: 'array',
            items: { type: 'string' },
            description: 'Certifications, licenses, or credentials printed, for example "RYT-500", "Lic #123456".',
          },
          hours: { type: 'string', description: 'Business hours as printed, in one line.' },
          links: {
            type: 'array',
            description: 'URLs, booking pages, or portfolios printed on the card.',
            items: {
              type: 'object',
              properties: {
                label: { type: 'string' },
                url: { type: 'string' },
                kind: { type: 'string', enum: ['website', 'booking', 'portfolio', 'other'] },
                confidence: { type: 'string', enum: ['high', 'low'] },
              },
            },
          },
          other: {
            type: 'array',
            description: 'A catch-all for anything that does not fit the slots above, for example {"label":"tagline","value":"Healing through sound"}.',
            items: {
              type: 'object',
              properties: {
                label: { type: 'string' },
                value: { type: 'string' },
                confidence: { type: 'string', enum: ['high', 'low'] },
              },
            },
          },
          confidence: { type: 'string', enum: ['high', 'low'], description: 'low when the card as a whole is hard to read.' },
        },
      },
    },
    required: [],
  },
}

const SCAN_SYSTEM = `You are Vera, Frequency's assistant. A community steward photographed a business card, flyer, or poster and wants it turned into a CRM profile.

Read every detail you can and call the save_contact tool. Rules:
- You may be given several images of the SAME contact. When two or more images arrive, treat image 1 as the FRONT of the card and image 2 as the BACK of the same card unless the message says otherwise; any further images are extra shots. Treat them all as one person and merge every detail you can read across all of them into ONE profile.
- Only record what is actually present. Never invent a name, email, company, or any other detail.
- tags: 3 to 6 short lowercase descriptors (interests, industry, or how the steward might collaborate).
- connectionNote: one or two warm, human sentences the steward can use to remember who this is. No fluff, no fabricated backstory.
- photo: if a portrait/headshot of the person appears in ANY image, set found=true, imageIndex to which image it is in (0-based, in the order given), and box to the normalized bounding box (x,y top-left, w,h size, each 0..1) tightly around the face/portrait. If no image shows the person's photo, set found=false.
- logo: if a company or brand logo appears in ANY image, set found=true, imageIndex to which image it is in (0-based), and box to the normalized bounding box around the logo mark. If there is no logo, set found=false. Locate BOTH the photo and the logo when both exist.
- corners: give one entry per input image, in order. Entry i is the four corners of the card in image i as normalized points (each 0..1) in order top-left, top-right, bottom-right, bottom-left. Use null for an image where the corners are cropped off, unclear, or the image is not a card. This lets the app straighten each side.
- quality: report honestly. Set legible=false when text is too blurry or small to read, glare=true when a reflection blocks part of the card, skew=true when it is photographed at a steep angle. When the capture is poor, add a short plain retake note (for example "The front is blurry. Hold steady and try again."). Leave the note empty when the photos are fine. No em dashes, no emojis.
- details: harvest EVERYTHING printed on the card into the details fields: every phone with its printed label (phones), every email (emails), street or mailing addresses (addresses), services or offerings (services), certifications and licenses (certifications), business hours (hours), URLs and booking or portfolio pages (links), and anything else as other label/value pairs. Mark a row confidence=low when the print is worn, stylized, or hard to read there. Never invent a detail that is not printed.`

const ASSIST_SYSTEM = `You are Vera, Frequency's assistant. A community steward is jotting a quick note about someone they just met, and wants it tidied into a CRM profile.

Turn their free text into structured details and call the save_contact tool. Rules:
- Only fill fields the text actually supports. Do not invent contact details.
- tags: 3 to 6 short lowercase descriptors drawn from what they wrote.
- connectionNote: a tidied one-or-two-sentence version of the connection, in a warm, human voice. Do not add facts they didn't mention.
- details: capture any extra structure the text gives into the details fields (phones, emails, addresses, services, certifications, hours, links, other). Do not invent details they did not mention.
- There is no image, so set photo.found=false and logo.found=false, and omit corners and quality (those need a photo).`

async function runExtraction(opts: {
  tier: ModelTier
  feature: string
  system: string
  content: Anthropic.MessageParam['content']
  profileId?: string | null
}): Promise<ExtractedContact | null> {
  try {
    const res = await completeRaw({
      tier: opts.tier,
      // The full-card harvest (details + corners + boxes) runs longer than the
      // old flat shape; give the tool call room so dense cards do not truncate.
      maxTokens: 1536,
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
    return coerceExtraction(block.input)
  } catch {
    return null
  }
}

/** Vision harvest: one or more photos of the same contact (e.g. front + back of a
 *  card) → a single structured profile (Sonnet). `hasBack` tells the model that
 *  image 2 really is the back of the card (vs. just an extra shot). */
export async function scanCardImage(input: {
  images: { base64: string; mediaType: ImageMediaType }[]
  hasBack?: boolean
  profileId?: string | null
}): Promise<ExtractedContact | null> {
  const imgs = input.images.slice(0, 6)
  if (!imgs.length) return null
  const sides = input.hasBack && imgs.length > 1
    ? 'Image 1 is the FRONT of the business card and image 2 is the BACK of the same card.'
    : 'Image 1 is the FRONT of the business card.'
  const extras =
    imgs.length > (input.hasBack ? 2 : 1)
      ? ' The remaining images are extra shots of the SAME person/contact.'
      : ''
  const content: Anthropic.MessageParam['content'] = [
    ...imgs.map((im) => ({
      type: 'image' as const,
      source: { type: 'base64' as const, media_type: im.mediaType, data: im.base64 },
    })),
    {
      type: 'text' as const,
      text:
        imgs.length > 1
          ? `${sides}${extras} Combine everything you can read across all of them into ONE profile, with per-image corners and both the face and logo regions when present. Call save_contact.`
          : 'Harvest this person’s details into a profile, with the card corners and the face and logo regions when present. Call save_contact.',
    },
  ]
  return runExtraction({
    tier: 'sonnet',
    feature: 'connection-scan',
    system: SCAN_SYSTEM,
    profileId: input.profileId,
    content,
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
