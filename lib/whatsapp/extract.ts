// AI classify + extract for the WhatsApp chat-import engine. Takes the parsed,
// classifiable messages and, in budget-gated batches, asks the model to label each
// as event / housing / roommate / other and pull structured fields for the first
// two. Mirrors lib/ai/events-ai.ts exactly: one forced structured-output tool, every
// field re-validated by a coercer (never trust raw), voice-canon via withVoice(), and
// a hard fall back to "AI skipped" when the switch is off or the cap is hit.
//
// This module NEVER writes to the DB. It returns staged items for an operator to
// review; the writer (create draft / list housing) is a separate, deliberate step.
// Events reuse coerceEventExtraction so a staged event is identical in shape to a
// poster-scanned one. Housing copy is run through the redactor before it leaves here.

import type Anthropic from '@anthropic-ai/sdk'
import { completeRaw } from '@/lib/ai/complete'
import { aiEnabled } from '@/lib/ai/client'

import { aiAvailable, featureOverBudget } from '@/lib/ai/usage'
import { withVoice } from '@/lib/ai/voice'
import { lenientList, rowsOrNone, textOrEmpty, validateModelValue, z } from '@/lib/ai/schema'
import { coerceEventExtraction } from '@/lib/events/normalize'
import type { FieldConfidence } from '@/lib/events/types'
import type { HousingType, RoomType } from '@/lib/listings/types'
import { redactContacts } from './redact'
import type { ClassifiedItem, HousingExtract, ImportCategory, WhatsAppMessage } from './types'

const FEATURE = 'whatsapp-import'
const TOOL_NAME = 'save_items'
// Sonnet text reasoning over messy chat (quality matters to keep junk out), batched to
// bound cost. Caps mirror the spirit of event-poster-scan: enough to process a big
// group export in a run without an unbounded bill.
const BATCH_SIZE = 28
const MAX_MESSAGES = 700 // per run; beyond this the preview is marked truncated
const MAX_TOKENS = 4096

const HOUSING_TYPES = ['rental', 'roommate', 'sublet'] as const satisfies readonly HousingType[]
const ROOM_TYPES = ['private_room', 'shared_room', 'entire_place'] as const satisfies readonly RoomType[]
const CATEGORIES = ['event', 'housing', 'roommate', 'other'] as const satisfies readonly ImportCategory[]

const EXTRACTION_TOOL: Anthropic.Tool = {
  name: TOOL_NAME,
  description:
    'Save the structured items you found in this batch of community chat messages.',
  input_schema: {
    type: 'object',
    properties: {
      items: {
        type: 'array',
        description:
          'One entry per real listing or event. Skip pure chatter, questions, and replies. Merge a multi-message post by the same person into ONE item.',
        items: {
          type: 'object',
          properties: {
            refs: {
              type: 'array',
              items: { type: 'number' },
              description: 'The [ref] number(s) of the message(s) this item came from.',
            },
            category: {
              type: 'string',
              enum: ['event', 'housing', 'roommate', 'other'],
              description:
                'event = a gathering with a date. housing = a place offered (rental/sublet). roommate = someone offering or seeking a room/roommate. other = anything else.',
            },
            confidence: { type: 'string', enum: ['high', 'low'] },
            note: {
              type: 'string',
              description: 'One short plain line on what this is. No hype, no em dashes.',
            },
            event: {
              type: 'object',
              description: 'Fill ONLY when category is event. Use only what the message says.',
              properties: {
                title: { type: 'string' },
                description: {
                  type: 'string',
                  description: 'A clean 1 to 2 sentence description in plain voice. No invented detail.',
                },
                startsAt: { type: 'string', description: 'ISO 8601 start. If only a date is given, keep the date.' },
                endsAt: { type: 'string', description: 'ISO 8601 end, if stated.' },
                location: { type: 'string', description: 'Venue and city as written.' },
                isFree: { type: 'boolean' },
                priceCents: { type: 'number', description: 'Whole cents (1500 = $15) when a price is stated.' },
                organizerName: { type: 'string' },
                organizerContact: { type: 'string', description: 'Contact the host gave (handle, email, phone, url).' },
                domain: {
                  type: 'string',
                  enum: ['mind', 'body', 'spirit', 'expression'],
                  description: 'Best-fit Pillar for the event.',
                },
                tags: { type: 'array', items: { type: 'string' }, description: '3 to 6 short lowercase tags.' },
              },
            },
            housing: {
              type: 'object',
              description: 'Fill ONLY when category is housing or roommate. Use only what the message says.',
              properties: {
                title: { type: 'string', description: 'A short, plain summary line for the listing.' },
                description: { type: 'string', description: 'The details in plain voice, no hype.' },
                listingType: { type: 'string', enum: ['rental', 'roommate', 'sublet'] },
                roomType: { type: 'string', enum: ['private_room', 'shared_room', 'entire_place'] },
                rentCents: { type: 'number', description: 'Monthly rent in whole cents (120000 = $1200) when stated.' },
                bedrooms: { type: 'number' },
                neighborhood: { type: 'string' },
                city: { type: 'string' },
                availableFrom: { type: 'string', description: 'ISO date the place is available, if stated.' },
              },
            },
          },
          required: ['refs', 'category'],
        },
      },
    },
    required: ['items'],
  },
}

const SYSTEM = `You are Vera, Frequency's assistant. An admin exported their community WhatsApp group and wants the real listings and events pulled out of the chatter, so they can be reviewed and posted.

You will get a batch of messages, each prefixed with a [ref] number and the sender. Call ${TOOL_NAME} with one item per real listing or event you find. Rules:
- Only record what the message actually says. Never invent a date, price, address, organizer, or contact.
- Categories: event (a gathering with a date and place), housing (a rental or sublet offered), roommate (someone offering OR seeking a room/roommate), other (questions, replies, chatter, "is this still available?", thanks, and anything not a listing or event).
- Most messages are 'other'. Be strict: a question about housing is NOT a listing. A reply to an event is NOT an event.
- Merge a post that spans several consecutive messages from the same sender into ONE item, and list every [ref] it used.
- description / note: plain voice, 1 to 2 sentences, no hype, no em dashes. Do not add facts the sender did not write.
- event.startsAt / endsAt: ISO 8601 when a date is given. If only a month and day are written, use the next future occurrence.
- event.domain: classify into mind, body, spirit, or expression.
- housing.rentCents: whole cents (120000 for $1200/mo). roomType only when clear.
- Leave any field blank when the message does not give it. Skip a message entirely when it is just 'other' and not worth posting (do not emit an 'other' item for every reply).`

// ── Reading the reply (never trust raw model JSON) ──────────────────────────────────
// The save_items reply is read through one schema (PROG-E8C, the ADR-1287 pattern, lib/ai/schema.ts). A field of the
// wrong type falls to its safe reading on its own, a row that is not an object is dropped, and a reply that is not
// the declared shape yields no items.

/** A whole number above zero, or null. */
const POSITIVE_INT = z
  .number()
  .transform((n) => (n > 0 ? Math.round(n) : null))
  .nullable()
  .catch(null)

/** The housing half of an item as sent. A type outside its closed set reads as "not stated". */
const HOUSING_REPLY = z.object({
  title: textOrEmpty(160),
  description: textOrEmpty(1200),
  listingType: textOrEmpty(20).pipe(z.enum(HOUSING_TYPES)).nullable().catch(null),
  roomType: textOrEmpty(20).pipe(z.enum(ROOM_TYPES)).nullable().catch(null),
  rentCents: POSITIVE_INT,
  bedrooms: POSITIVE_INT,
  neighborhood: textOrEmpty(120),
  city: textOrEmpty(120),
  availableFrom: textOrEmpty(40),
})

/** One item as sent. `event` is handed whole to the events reader, which has its own schema. An unknown category is
 *  'other'; confidence is 'high' unless the model says 'low'; refs that are not numbers are dropped. */
const ITEM_REPLY = z.object({
  category: z.enum(CATEGORIES).catch('other'),
  refs: rowsOrNone(z.number().transform((n) => Math.round(n)).pipe(z.number().positive())),
  confidence: z.enum(['high', 'low'] as const satisfies readonly FieldConfidence[]).catch('high'),
  note: textOrEmpty(240),
  event: z.unknown().optional(),
  housing: HOUSING_REPLY.nullable().catch(null),
})

const ITEMS_REPLY = z.object({ items: lenientList(ITEM_REPLY) })

/** A parsed housing reply → a safe HousingExtract, with the description redacted and any
 *  inline contacts lifted out (kept off public copy until the listing is claimed). */
function toHousing(r: z.infer<typeof HOUSING_REPLY>, fallbackType: ImportCategory): HousingExtract {
  const { redacted, contacts } = redactContacts(r.description)
  return {
    title: r.title,
    description: redacted,
    listingType: r.listingType ?? (fallbackType === 'roommate' ? 'roommate' : 'rental'),
    roomType: r.roomType,
    rentCents: r.rentCents,
    bedrooms: r.bedrooms,
    neighborhood: r.neighborhood,
    city: r.city,
    availableFrom: r.availableFrom,
    contacts,
  }
}

/** A roommate item with no housing object still deserves a minimal shell so the operator sees it. */
const NO_HOUSING = HOUSING_REPLY.parse({})

function toItem(r: z.infer<typeof ITEM_REPLY>): ClassifiedItem | null {
  const item: ClassifiedItem = {
    refs: [...new Set(r.refs)].slice(0, 24),
    category: r.category,
    confidence: r.confidence,
    note: r.note,
    imageNames: [], // filled by the action from the parsed chat (lib/whatsapp/associate)
  }
  if (r.category === 'event') {
    item.event = coerceEventExtraction(r.event)
    // Drop an event the model couldn't actually name (keeps junk out of the review).
    if (!item.event.title) return null
  } else if (r.category === 'housing' || r.category === 'roommate') {
    const housing = r.housing ?? (r.category === 'roommate' ? NO_HOUSING : null)
    item.housing = housing ? toHousing(housing, r.category) : undefined
    if (!item.housing || (!item.housing.title && !item.housing.description)) return null
  }
  return item
}

/** Read one save_items reply into staged items. PURE + total: anything that is not the declared shape is []. */
function readItems(raw: unknown): ClassifiedItem[] {
  const res = validateModelValue(raw, ITEMS_REPLY)
  if (!res.ok) return []
  return res.data.items.map(toItem).filter((x): x is ClassifiedItem => x !== null)
}

// ── Batch runner ────────────────────────────────────────────────────────────────────

function renderBatch(messages: WhatsAppMessage[]): string {
  return messages
    .map((m) => `[${m.ref}] ${m.author || 'unknown'}: ${m.text.replace(/\s+/g, ' ').slice(0, 600)}`)
    .join('\n')
}

async function runBatch(
  messages: WhatsAppMessage[],
  profileId: string | null,
): Promise<ClassifiedItem[]> {
  try {
    const res = await completeRaw({
      accounting: { feature: FEATURE, profileId },
      tier: 'sonnet',
      maxTokens: MAX_TOKENS,
      thinking: { type: 'disabled' },
      system: withVoice(SYSTEM),
      tools: [EXTRACTION_TOOL],
      toolChoice: { type: 'tool', name: TOOL_NAME },
      messages: [
        {
          role: 'user',
          content: `Here is a batch of community messages. Pull out the real events and housing listings. Call ${TOOL_NAME}.\n\n${renderBatch(messages)}`,
        },
      ],
    })

    const block = res.content.find(
      (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use' && b.name === TOOL_NAME,
    )
    return readItems(block?.input)
  } catch {
    // One bad batch must not sink the whole run — skip it and keep going.
    return []
  }
}

interface ClassifyResult {
  items: ClassifiedItem[]
  /** True when AI was off or over budget — the caller shows the parse only. */
  aiSkipped: boolean
  /** True when more than MAX_MESSAGES were eligible and the tail was not processed. */
  truncated: boolean
}

/**
 * Classify + extract over the classifiable messages, in budget-gated batches. Returns
 * staged items (no DB writes). Falls back to `aiSkipped` when the kill switch is off or
 * the daily cap is hit, so the operator still gets the deterministic parse.
 */
export async function classifyAndExtract(
  messages: WhatsAppMessage[],
  opts: { profileId?: string | null } = {},
): Promise<ClassifyResult> {
  const profileId = opts.profileId ?? null
  if (!aiEnabled() || !(await aiAvailable()) || (await featureOverBudget(FEATURE))) {
    return { items: [], aiSkipped: true, truncated: false }
  }

  const truncated = messages.length > MAX_MESSAGES
  const work = messages.slice(0, MAX_MESSAGES)
  const batches: WhatsAppMessage[][] = []
  for (let i = 0; i < work.length; i += BATCH_SIZE) batches.push(work.slice(i, i + BATCH_SIZE))

  const items: ClassifiedItem[] = []
  for (const batch of batches) {
    // Re-check the cap between batches so a long export halts itself the moment it
    // crosses the daily budget rather than running every batch.
    if (await featureOverBudget(FEATURE)) {
      return { items, aiSkipped: items.length === 0, truncated: true }
    }
    items.push(...(await runBatch(batch, profileId)))
  }

  return { items, aiSkipped: false, truncated }
}
